import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, types, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import { getDatabasePool } from './database';
import { SUPABASE_CA } from './trusted-ca';
import { DataError, PROJECT_REF, PROJECT_URL, positiveId } from './registry';

// Calendar dates stay strings (same as office pool).
types.setTypeParser(1082, value => value);

type GrowerScope = { client: PoolClient; operationId: number };
const scopes = new AsyncLocalStorage<GrowerScope>();
let growerPool: Pool | undefined;
let growerConnecting: Promise<Pool> | undefined;
let usingOwnerFallback = false;

const GROWER_USER = 'acre_grower';

/** Connection config for the weaker grower login only. Never accepts the owner role. */
export function growerDatabaseConfig(raw: string): PoolConfig {
  let u: URL;
  try { u = new URL(raw); } catch { throw new DataError('Invalid grower database configuration', 503); }
  const user = decodeURIComponent(u.username);
  const direct = u.hostname === `db.${PROJECT_REF}.supabase.co` && user === GROWER_USER;
  const pooled = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) && user === `${GROWER_USER}.${PROJECT_REF}`;
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !(direct || pooled) || !['', '5432', '6543'].includes(u.port)
    || u.pathname !== '/postgres' || !u.password || u.hash) {
    throw new DataError('Grower database must use the acre_grower role on the acre-ops project', 503);
  }
  for (const [key, value] of u.searchParams) {
    if (key !== 'sslmode' || !['require', 'verify-full'].includes(value)) {
      throw new DataError('Unsupported grower database connection option', 503);
    }
  }
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user,
    password: decodeURIComponent(u.password),
    database: 'postgres',
    ssl: { ca: SUPABASE_CA, rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
    statement_timeout: 30000,
    query_timeout: 35000,
    application_name: 'acre-ops-grower',
    allowExitOnIdle: true,
  };
}

function assertProject() {
  if (process.env.SUPABASE_URL?.replace(/\/$/, '') !== PROJECT_URL) {
    throw new DataError('SUPABASE_URL must point to acre-ops', 503);
  }
}

async function getGrowerPool(): Promise<Pool> {
  assertProject();
  if (growerPool) return growerPool;
  if (!growerConnecting) {
    growerConnecting = (async () => {
      const raw = process.env.DATABASE_URL_GROWER;
      // Until DATABASE_URL_GROWER is set on Netlify, demote the office pool with
      // SET LOCAL ROLE acre_grower inside withGrowerOperation (same as contract tests).
      if (!raw) {
        usingOwnerFallback = true;
        growerPool = await getDatabasePool();
        return growerPool;
      }
      const config = growerDatabaseConfig(raw);
      const candidate = new Pool(config);
      candidate.on('error', () => { /* Do not log driver errors: they can contain credentials or row data. */ });
      try {
        await candidate.query('SELECT 1');
        usingOwnerFallback = false;
        growerPool = candidate;
        return candidate;
      } catch {
        await candidate.end().catch(() => {});
        throw new DataError('Could not connect as acre_grower; check DATABASE_URL_GROWER', 503);
      }
    })().finally(() => { growerConnecting = undefined; });
  }
  return growerConnecting;
}

function safeError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  const code = (error as { code?: string })?.code;
  if (code === '42501') return new DataError('Grower access denied', 403);
  if (code?.startsWith('22')) return new DataError('A required field or value is invalid', 400);
  return new DataError('Grower database operation failed; no database details are exposed', 503);
}

/** Run read-only grower work scoped to one farm. Sets app.grower_operation_id for the transaction. */
export async function withGrowerOperation<T>(
  operationId: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const op = positiveId(operationId);
  if (scopes.getStore()) {
    if (scopes.getStore()!.operationId !== op) {
      throw new DataError('Grower scope cannot switch farms mid-request', 500);
    }
    return work();
  }
  let client: PoolClient;
  try { client = await (await getGrowerPool()).connect(); }
  catch (error) { throw safeError(error); }
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT set_config('app.grower_operation_id', $1, true)`,
      [String(op)],
    );
    // When the connection is the owner (fallback / contract tests), demote for
    // this transaction so base-table grants are enforced like acre_grower login.
    const who = await client.query<{ current_user: string }>('SELECT current_user');
    if (who.rows[0]?.current_user !== GROWER_USER || usingOwnerFallback) {
      await client.query('SET LOCAL ROLE acre_grower');
    }
    const result = await scopes.run({ client, operationId: op }, work);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw safeError(error);
  } finally {
    client.release();
  }
}

export async function growerQuery<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const scope = scopes.getStore();
  if (!scope) throw new DataError('Grower queries require withGrowerOperation', 500);
  try {
    return (await scope.client.query<T>(sql, values)).rows;
  } catch (error) {
    throw safeError(error);
  }
}

export function growerOperationId(): number {
  const scope = scopes.getStore();
  if (!scope) throw new DataError('Grower queries require withGrowerOperation', 500);
  return scope.operationId;
}
