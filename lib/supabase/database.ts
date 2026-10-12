import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, types, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import { revalidateTag } from 'next/cache';
import { SUPABASE_CA } from './trusted-ca';
import { RemovalError } from '../probe-removal';
import { DATA_TAG, DATA_VERSION, DataError, PROJECT_REF, PROJECT_URL, registry } from './registry';

type Transaction = { client: PoolClient; touched: Set<string>; afterCommit: (() => void | Promise<void>)[] };
const transactions = new AsyncLocalStorage<Transaction>();
let pool: Pool | undefined;
let connecting: Promise<Pool> | undefined;
// A calendar date is not an instant: avoid timezone shifts during serialization.
types.setTypeParser(1082, value => value);

export function databaseConfig(raw: string): PoolConfig {
  let u: URL;
  try { u = new URL(raw); } catch { throw new DataError('Invalid database configuration', 503); }
  const direct = u.hostname === `db.${PROJECT_REF}.supabase.co` && decodeURIComponent(u.username) === 'postgres';
  const pooled = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) && decodeURIComponent(u.username) === `postgres.${PROJECT_REF}`;
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !(direct || pooled) || !['', '5432', '6543'].includes(u.port)
    || u.pathname !== '/postgres' || !u.password || u.hash) throw new DataError('Database must point to the acre-ops project', 503);
  for (const [key, value] of u.searchParams) if (key !== 'sslmode' || !['require', 'verify-full'].includes(value)) throw new DataError('Unsupported database connection option', 503);
  return { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: 'postgres',
    ssl: { ca: SUPABASE_CA, rejectUnauthorized: true }, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000,
    statement_timeout: 30000, query_timeout: 35000, application_name: 'acre-ops-supabase-branch', allowExitOnIdle: true };
}
export function assertProject() {
  if (process.env.SUPABASE_URL?.replace(/\/$/, '') !== PROJECT_URL) throw new DataError('SUPABASE_URL must point to acre-ops', 503);
}
async function getPool(): Promise<Pool> {
  assertProject();
  if (pool) return pool;
  if (!connecting) connecting = (async () => {
    const candidates = [process.env.DATABASE_URL, process.env.DATABASE_URL_ALT].filter((v): v is string => !!v);
    if (!candidates.length) throw new DataError('Database connection is not configured', 503);
    // Validate ALL targets before any connection. Never fall back to another project.
    const configs = candidates.map(databaseConfig);
    for (const config of configs) {
      const candidate = new Pool(config);
      candidate.on('error', () => { /* Do not log driver errors: they can contain credentials or row data. */ });
      try { await candidate.query('SELECT 1'); pool = candidate; return candidate; }
      catch { await candidate.end().catch(() => {}); }
    }
    throw new DataError('Could not connect to acre-ops Postgres; check connection settings', 503);
  })().finally(() => { connecting = undefined; });
  return connecting;
}
function safeError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  if (error instanceof RemovalError) return new DataError(error.message, error.status);
  const code = (error as {code?: string})?.code;
  if (code === '23505') return new DataError('That value already exists', 409);
  if (code === '23503') return new DataError('This record is linked to another record; review its links first', 409);
  if (code === '23502' || code === '23514' || code?.startsWith('22')) return new DataError('A required field or value is invalid', 400);
  return new DataError('Database operation failed; no database details are exposed', 503);
}
export async function query<T extends QueryResultRow = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  try { return (await (transactions.getStore()?.client || await getPool()).query<T>(sql, values)).rows; }
  catch (error) { throw safeError(error); }
}
export function invalidate(tables: Iterable<string>) {
  // All hydrated rows can depend on another table's display label. Broad expiry
  // is intentional for this small app; no stale inverse/derived projection remains.
  try {
    revalidateTag(DATA_TAG, { expire: 0 });
    revalidateTag(`${DATA_VERSION}-options`, { expire: 0 });
    for (const table of tables) revalidateTag(`${DATA_VERSION}-${table}`, { expire: 0 });
  } catch { /* Tests and read-only command-line diagnostics have no Next cache context. */ }
}
export function touched(...tables: string[]) {
  const tx = transactions.getStore();
  if (!tx) throw new DataError('Writes require a transaction', 500);
  for (const table of tables) {
    if (!registry.tables[table]) throw new DataError('Unknown touched table', 500);
    tx.touched.add(table);
  }
}
export function afterCommit(callback: () => void | Promise<void>) {
  const tx = transactions.getStore();
  if (!tx) throw new DataError('Commit callback requires a transaction', 500);
  tx.afterCommit.push(callback);
}
export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  if (transactions.getStore()) return work();
  let client: PoolClient;
  try { client = await (await getPool()).connect(); } catch(error) { throw safeError(error); }
  const tx: Transaction = { client, touched: new Set(), afterCommit: [] };
  let result: T;
  try {
    await client.query('BEGIN');
    // Serialize app write actions, including graph operations, on this project.
    // This avoids lost join updates / double enrollment without changing schema.
    await client.query('SELECT pg_advisory_xact_lock(714626, 6)');
    result = await transactions.run(tx, work);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw safeError(error);
  } finally { client.release(); }
  invalidate(tx.touched);
  for (const callback of tx.afterCommit) await callback();
  return result;
}
