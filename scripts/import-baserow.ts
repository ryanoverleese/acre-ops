#!/usr/bin/env node
/** One-way, restartable import. Node >= 24; isolated pg dependency.
 * See import-baserow.README.md. Never add a Baserow mutation to this file.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';

export const PROJECT = 'junawlttpyztjlnbmvcb';
export const ORGANIZATION = 'bcjwjhlwqewrgtlicybl';
export const DATABASE = 360377;
export const BUCKET = 'baserow-import';
export const PROJECT_URL = `https://${PROJECT}.supabase.co`;
export const SCHEMA_SHA = 'a2c0dbb2fb41acc05d356ccf068a43eaf1d7c854d84ca3d300d91ac42981e6c3';
export const BILLING_MIGRATION = '20261012183218_field_billing_entities.sql';
export const BILLING_SHA = 'ccc64da7e7b861c3e95d5319a4e6b5ab37e6a0358dc4128ef5a20d01eb3198c5';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = resolve(ROOT, 'scripts');
const PAGE_SIZE = 200;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
type Row = Record<string, unknown>;
type Option = { id: number; value: string; color?: string };
type Field = { id: number; name: string; type: string; select_options?: Option[]; link_row_table_id?: number };
type Column = { name: string; type: string; required: boolean; identity: boolean; target?: string };
type Catalog = { name: string; source: string; field: string };
type Schema = { tables: Map<string, Column[]>; catalogs: Catalog[] };
type Snapshot = { fields: Map<string, Field[]>; rows: Map<string, Row[]> };
type Crosswalk = Map<string, Map<string, string>>;
export type Issue = { kind: string; table: string; row?: string; field?: string; file_index?: number; target_id?: string; code: string; blocking: boolean };
type FileRef = { bucket: string; path: string; name: string; size: number; mime: string };
type ManifestEntry = { ref: FileRef; sha256: string; source_size: number | null };
type Manifest = { version: number; project: string; database: number; files: Record<string, ManifestEntry> };
type Fetcher = typeof fetch;
type Logger = (message: string) => void;

// The inventory's order is intentional; scalar FK parents precede their children.
export const TABLES: [string, number][] = [
  ['products_services', 826849], ['inventory', 827222], ['users', 828606],
  ['installers', 939826], ['mileage_logs', 982999], ['documents', 861653],
  ['billing_entities', 817297], ['contacts', 817294], ['operations', 817295],
  ['fields', 817298], ['weather_stations', 831050], ['field_seasons', 817300],
  ['probes', 817299], ['probe_rack', 934076], ['probe_assignments', 819350],
  ['repairs', 817301], ['water_recs', 817302], ['invoices', 817303],
  ['invoice_lines', 817304], ['orders', 831072], ['order_items', 831073],
  ['notifications', 854433],
];
const SOURCE_IDS = new Map(TABLES);
export const JOINS = [
  { name: 'field_billing_entities', source: 'fields', field: 'billing_entity', left: 'field_id', right: 'billing_entity_id', target: 'billing_entities' },
  { name: 'contact_operations', source: 'contacts', field: 'operations', left: 'contact_id', right: 'operation_id', target: 'operations' },
  { name: 'contact_billing_entities', source: 'contacts', field: 'billing_entity', left: 'contact_id', right: 'billing_entity_id', target: 'billing_entities' },
  { name: 'contact_customer_types', source: 'contacts', field: 'customer_type', left: 'contact_id', right: 'customer_type_id', target: 'contact_customer_type_options' },
  { name: 'probe_contacts', source: 'probes', field: 'contact', left: 'probe_id', right: 'contact_id', target: 'contacts' },
  { name: 'probe_billing_entities', source: 'probes', field: 'billing_entity', left: 'probe_id', right: 'billing_entity_id', target: 'billing_entities' },
  { name: 'probe_owner_operations', source: 'probes', field: 'owner_operation', left: 'probe_id', right: 'operation_id', target: 'operations' },
  { name: 'field_season_services', source: 'field_seasons', field: 'service_type', left: 'field_season_id', right: 'product_service_id', target: 'products_services' },
];
const REVERSE: Record<string, string[]> = {
  operations: ['notifications'], billing_entities: ['fields', 'invoices', 'weather_stations', 'orders'],
  fields: ['field_seasons'], probes: ['probe_assignments', 'probe_rack'],
  field_seasons: ['repairs', 'water_recs', 'invoice_lines', 'probe_assignments'],
  probe_assignments: ['repairs'], products_services: ['field_seasons', 'order_items'],
  invoices: ['invoice_lines'], orders: ['order_items'],
};

export class SafeError extends Error {}
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const normalizeName = (name: string) => name.toLowerCase().replace(/\?/g, '').replace(/\s+/g, '_');
const blank = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && !value.trim());
const label = (value: unknown): unknown => value && typeof value === 'object' && !Array.isArray(value) ? (value as Row).value : value;
const identifier = (name: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new SafeError('Invalid SQL identifier'); return `"${name}"`; };
const rowId = (value: unknown) => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new SafeError('Unsafe numeric row ID');
  const id = String(value);
  if (!/^[1-9]\d*$/.test(id)) throw new SafeError('Invalid positive row ID');
  return id;
};
const fieldFor = (s: Snapshot, table: string, name: string) => s.fields.get(table)?.find(f => normalizeName(f.name) === name);
const sourceValue = (row: Row, field?: Field) => field ? row[`field_${field.id}`] : undefined;
const issue = (issues: Issue[], value: Issue) => { if (!issues.some(i => JSON.stringify(i) === JSON.stringify(value))) issues.push(value); };

export function skipRackRow(table: string, row: Row, snapshot: Snapshot, issues: Issue[]): boolean {
  if (table !== 'probe_rack') return false;
  const missing = ['rack', 'rack_slot'].filter(name => blank(sourceValue(row, fieldFor(snapshot, table, name))));
  if (!missing.length) return false;
  issue(issues, { kind: 'skipped_row', table, row: rowId(row.id), field: missing.join(','), code: 'blank_required_rack_location', blocking: false });
  return true;
}

// Parse ONLY the pinned migration's simple CREATE TABLE declarations, not arbitrary SQL.
export function parseSchema(sql: string, billingSql: string): Schema {
  if (digest(sql) !== SCHEMA_SHA) throw new SafeError('001_init.sql differs from reviewed commit 368e25d; review the importer before proceeding');
  if (digest(billingSql) !== BILLING_SHA) throw new SafeError('Approved all-field billing migration differs; review before proceeding');
  const tables = new Map<string, Column[]>();
  for (const match of (sql + '\n' + billingSql).matchAll(/CREATE TABLE public\.([a-z_]+) \(\n([\s\S]*?)\n\);/g)) {
    const columns: Column[] = [];
    for (const line of match[2].split('\n')) {
      const c = line.match(/^\s+([a-z_]+) (bigint|integer|text|boolean|jsonb|date|timestamptz|numeric(?:\(\d+,\d+\))?)(.*)/);
      if (c) columns.push({ name: c[1], type: c[2], required: /NOT NULL|IDENTITY|PRIMARY KEY/.test(c[3]), identity: /IDENTITY/.test(c[3]), target: c[3].match(/REFERENCES public\.([a-z_]+)/)?.[1] });
    }
    tables.set(match[1], columns);
  }
  const catalogs = [...sql.matchAll(/COMMENT ON TABLE public\.([a-z_]+_options) IS 'Editable options for ([a-z_]+)\.([a-z_]+)/g)].map(m => ({ name: m[1], source: m[2], field: m[3] }));
  if (tables.size !== 65 || catalogs.length !== 35 || TABLES.some(([t]) => !tables.has(t))) throw new SafeError('Unexpected migration structure');
  return { tables, catalogs };
}

// Raw API errors can contain passwords, query text, row contents or signed URLs.
// Never expose their bodies, URLs, causes or stack traces in logs/errors.
export async function request(fetcher: Fetcher, url: string, init: RequestInit, service: string, allowedStatuses: number[] = []): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response: Response;
    try { response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(90_000) }); }
    catch { if (attempt === 3) throw new SafeError(`${service}: network/timeout error`); await new Promise(r => setTimeout(r, 500 * 2 ** attempt)); continue; }
    if (response.ok || allowedStatuses.includes(response.status)) return response;
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const delay = Math.min(10_000, Math.max(500 * 2 ** attempt, Number(response.headers.get('retry-after') || 0) * 1000));
      await response.body?.cancel(); await new Promise(r => setTimeout(r, delay)); continue;
    }
    await response.body?.cancel();
    throw new SafeError(`${service}: HTTP ${response.status}`);
  }
  throw new SafeError(`${service}: retries exhausted`);
}
async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new SafeError('Invalid JSON response (body withheld)'); }
}

export class BaserowReader {
  token: string; fetcher: Fetcher;
  constructor(token: string, fetcher: Fetcher = fetch) { this.token = token; this.fetcher = fetcher; }
  // No caller-controlled method, origin or arbitrary URL. GET is the only source operation.
  async get(table: number, kind: 'fields' | 'rows', page = 1): Promise<unknown> {
    if (!TABLES.some(([, id]) => id === table)) throw new SafeError('Source table is outside database 360377 inventory');
    // Baserow's default ordering is order, then id. Its order_by accepts source
    // field IDs, NOT the synthetic row-id column. Count + duplicate checks below
    // reject partial exports if rows are reordered during pagination.
    const path = kind === 'fields' ? `/api/database/fields/table/${table}/` : `/api/database/rows/table/${table}/?size=${PAGE_SIZE}&page=${page}`;
    return json(await request(this.fetcher, `https://api.baserow.io${path}`, { method: 'GET', headers: { Authorization: `Token ${this.token}` } }, 'Baserow'));
  }
  async collect(log: Logger): Promise<Snapshot> {
    const snapshot: Snapshot = { fields: new Map(), rows: new Map() };
    for (const [table, id] of TABLES) {
      const fields = await this.get(id, 'fields');
      if (!Array.isArray(fields)) throw new SafeError(`${table}: invalid field metadata`);
      snapshot.fields.set(table, fields as Field[]);
      const rows: Row[] = []; const seen = new Set<string>(); let expected = -1;
      for (let page = 1; ; page++) {
        const data = await this.get(id, 'rows', page) as { count: number; next: string | null; results: Row[] };
        if (!Number.isSafeInteger(data.count) || data.count < 0 || !Array.isArray(data.results)) throw new SafeError(`${table}: invalid pagination response`);
        if (expected === -1) expected = data.count;
        if (expected !== data.count) throw new SafeError(`${table}: source count changed during collection; retry a new dry run`);
        for (const row of data.results) {
          const key = rowId(row.id);
          if (seen.has(key)) throw new SafeError(`${table}: duplicate row while paginating`);
          seen.add(key); rows.push(row);
        }
        if (rows.length > expected || (data.next && data.results.length === 0)) throw new SafeError(`${table}: incomplete/inconsistent pagination`);
        if (page % 10 === 0) log(`${table}: read ${rows.length}/${expected}`);
        if (!data.next) break;
        // Do not follow response.next: it is untrusted and could leak the source token.
        if (page > Math.ceil(expected / PAGE_SIZE) + 1) throw new SafeError(`${table}: pagination did not terminate`);
      }
      if (rows.length !== expected) throw new SafeError(`${table}: COLLECTION INCOMPLETE`);
      snapshot.rows.set(table, rows); log(`${table}: ${rows.length} source rows`);
    }
    return snapshot;
  }
}

export function scalar(value: unknown, column: Column): unknown {
  value = label(value);
  if (blank(value)) return null;
  if (column.type === 'text') {
    if (typeof value !== 'string' && typeof value !== 'number') throw new SafeError('Expected text');
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new SafeError('Unsafe numeric text');
    return String(value); // Nonblank labels and notes are intentionally not trimmed.
  }
  if (column.type === 'boolean') { if (typeof value !== 'boolean') throw new SafeError('Expected boolean'); return value; }
  if (column.type === 'date' || column.type === 'timestamptz') {
    const text = String(value);
    const pattern = column.type === 'date' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;
    if (!pattern.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text.slice(0, 10)).toISOString().slice(0, 10) !== text.slice(0, 10)) throw new SafeError('Invalid date');
    return text;
  }
  const text = String(value).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) throw new SafeError('Invalid numeric value');
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new SafeError('Numeric values must be exact decimal strings');
  if (column.type === 'integer' || column.type === 'bigint') {
    if (!/^[+-]?\d+$/.test(text)) throw new SafeError('Non-integral integer');
    const n = BigInt(text), min = BigInt(column.type === 'integer' ? '-2147483648' : '-9223372036854775808'), max = BigInt(column.type === 'integer' ? '2147483647' : '9223372036854775807');
    if (n < min || n > max) throw new SafeError('Integer out of range');
  }
  const precision = column.type.match(/^numeric\((\d+),(\d+)\)$/);
  if (precision) {
    const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
    if (whole.replace(/^0+/, '').length > Number(precision[1]) - Number(precision[2]) || fraction.replace(/0+$/, '').length > Number(precision[2])) throw new SafeError('Numeric precision would be lost');
  }
  if (/(^|_)lat$/.test(column.name) && Math.abs(Number(text)) > 90) throw new SafeError('Latitude out of range');
  if (/(^|_)lng$/.test(column.name) && Math.abs(Number(text)) > 180) throw new SafeError('Longitude out of range');
  return text;
}

function sourceColumn(column: Column): string { return column.target && column.name.endsWith('_id') ? column.name.slice(0, -3) : column.name; }
function linkItems(value: unknown): Row[] {
  if (blank(value)) return [];
  if (!Array.isArray(value) || value.some(v => !v || typeof v !== 'object')) throw new SafeError('Invalid link array');
  return value as Row[];
}
function lookupId(walk: Crosswalk, target: string, value: unknown, options: boolean): string | undefined {
  if (blank(value)) return undefined;
  return walk.get(target)?.get(options ? String(label(value)) : rowId((value as Row).id));
}

export function convertRow(table: string, row: Row, s: Snapshot, schema: Schema, walk: Crosswalk, issues: Issue[]): Row {
  const out: Row = { baserow_id: rowId(row.id) };
  for (const c of schema.tables.get(table) || []) {
    if (c.name === 'id' || c.name === 'baserow_id') continue;
    const field = fieldFor(s, table, sourceColumn(c));
    if (!field) continue; // Schema-only optional columns retain defaults/current values.
    const raw = sourceValue(row, field);
    try {
      // All field billing links, not just multi-links, go to the join. Do not
      // create a second source of truth in the deprecated compatibility column.
      if (table === 'fields' && c.name === 'billing_entity_id') { out[c.name] = null; continue; }
      if (c.type === 'jsonb') { out[c.name] = []; continue; } // Resolved through Storage separately.
      if (c.target) {
        const options = c.target.endsWith('_options');
        const items = options ? (blank(raw) ? [] : [raw]) : linkItems(raw);
        if (items.length > 1) throw new SafeError('Multiple links cannot fit scalar FK');
        out[c.name] = items.length ? lookupId(walk, c.target, items[0], options) ?? null : null;
        if (items.length && out[c.name] === null) issue(issues, { kind: 'missing_link', table, row: rowId(row.id), field: field.name, ...(!options ? { target_id: rowId((items[0] as Row).id) } : {}), code: 'missing_target', blocking: c.required });
      } else out[c.name] = scalar(raw, c);
      if (c.required && out[c.name] === null) throw new SafeError('Required column is blank or unresolved');
    } catch (error) { issue(issues, { kind: 'invalid_value', table, row: rowId(row.id), field: field.name, code: error instanceof SafeError ? error.message : 'incompatible_with_schema', blocking: true }); }
  }
  return out;
}

export function optionRows(s: Snapshot, catalog: Catalog): Row[] {
  const field = fieldFor(s, catalog.source, catalog.field);
  if (!field) return [];
  if (!['single_select', 'multiple_select'].includes(field.type) || !Array.isArray(field.select_options)) throw new SafeError(`${catalog.name}: expected dropdown metadata`);
  const seen = new Set<string>();
  return field.select_options.map((option, index) => {
    if (blank(option.value) || seen.has(option.value)) throw new SafeError(`${catalog.name}: blank or duplicate dropdown label; cannot silently merge`);
    seen.add(option.value);
    return { baserow_id: rowId(option.id), value: option.value, color: blank(option.color) ? null : option.color, sort_order: index, active: true };
  });
}

export function joinRows(s: Snapshot, walk: Crosswalk, issues: Issue[], join: typeof JOINS[number]): Row[] {
  const rows: Row[] = []; const seen = new Set<string>();
  const field = fieldFor(s, join.source, join.field);
  if (!field) return rows;
  for (const row of s.rows.get(join.source) || []) {
    const left = walk.get(join.source)?.get(rowId(row.id));
    if (!left) throw new SafeError(`${join.name}: missing imported owner`);
    for (const [position, item] of linkItems(sourceValue(row, field)).entries()) {
      const option = join.target.endsWith('_options');
      const right = lookupId(walk, join.target, item, option);
      if (!right) { issue(issues, { kind: 'missing_link', table: join.source, row: rowId(row.id), field: field.name, ...(!option ? { target_id: rowId(item.id) } : {}), code: 'missing_target', blocking: false }); continue; }
      const key = `${left}:${right}`;
      if (seen.has(key)) continue;
      seen.add(key); rows.push({ [join.left]: left, [join.right]: right, position });
    }
  }
  return rows;
}

export function preflight(s: Snapshot, schema: Schema): { issues: Issue[]; walk: Crosswalk; expected: Record<string, number>; absent: string[] } {
  const issues: Issue[] = [], walk: Crosswalk = new Map(), expected: Record<string, number> = {}, absent: string[] = [];
  for (const [table] of TABLES) { const rows = (s.rows.get(table) || []).filter(r => !skipRackRow(table, r, s, issues)); expected[table] = rows.length; walk.set(table, new Map(rows.map(r => [rowId(r.id), rowId(r.id)]))); }
  for (const catalog of schema.catalogs) {
    const rows = optionRows(s, catalog); expected[catalog.name] = rows.length;
    walk.set(catalog.name, new Map(rows.map(r => [String(r.value), rowId(r.baserow_id)])));
    if (!fieldFor(s, catalog.source, catalog.field)) absent.push(`${catalog.source}.${catalog.field} (no source dropdown; catalog left unchanged)`);
  }
  for (const [table] of TABLES) {
    const names = new Set<string>();
    const mapped = new Set((schema.tables.get(table) || []).map(sourceColumn));
    JOINS.filter(j => j.source === table).forEach(j => mapped.add(j.field));
    (REVERSE[table] || []).forEach(n => mapped.add(n));
    for (const field of s.fields.get(table) || []) {
      const name = normalizeName(field.name);
      if (names.has(name)) throw new SafeError(`${table}: duplicate normalized field name`);
      names.add(name);
      if (!mapped.has(name) && !['formula', 'lookup', 'rollup', 'count'].includes(field.type)) throw new SafeError(`${table}.${name}: unmapped source field; review before import`);
      const c = schema.tables.get(table)?.find(c => sourceColumn(c) === name);
      const j = JOINS.find(j => j.source === table && j.field === name);
      const target = c?.target || j?.target;
      if (target && !target.endsWith('_options') && field.link_row_table_id !== SOURCE_IDS.get(target)) throw new SafeError(`${table}.${name}: source link target changed`);
      if (['single_select', 'multiple_select'].includes(field.type) && !(table === 'water_recs' && name === 'report_type') && !schema.catalogs.some(c => c.source === table && c.field === name)) throw new SafeError(`${table}.${name}: dropdown lacks a catalog`);
    }
    for (const c of schema.tables.get(table) || []) if (c.name !== 'id' && c.name !== 'baserow_id' && c.required && c.type !== 'jsonb' && !names.has(sourceColumn(c))) throw new SafeError(`${table}.${c.name}: required source column missing`);
    const unique = new Map<string, Set<string>>();
    for (const row of s.rows.get(table) || []) {
      if (skipRackRow(table, row, s, issues)) continue;
      const converted = convertRow(table, row, s, schema, walk, issues);
      for (const c of schema.tables.get(table) || []) if ((c.identity && c.name !== 'id') || (table === 'probes' && c.name === 'serial_number')) {
        const value = converted[c.name]; if (blank(value)) continue;
        const values = unique.get(c.name) || new Set<string>();
        if (values.has(String(value))) issue(issues, { kind: 'duplicate', table, row: rowId(row.id), field: c.name, code: 'duplicate_unique_value', blocking: true });
        values.add(String(value)); unique.set(c.name, values);
      }
    }
  }
  for (const join of JOINS) { expected[join.name] = joinRows(s, walk, issues, join).length; if (!fieldFor(s, join.source, join.field)) absent.push(`${join.source}.${join.field} (no source multi-link; join left unchanged)`); }
  return { issues, walk, expected, absent };
}

// Expiring URLs are excluded; attachment identity/size and all actual source values remain.
export function fingerprint(s: Snapshot): string {
  const clean = (v: unknown): unknown => Array.isArray(v) ? v.map(clean) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Row).filter(([k]) => !['url', 'thumbnails'].includes(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, clean(x)])) : v;
  return digest(JSON.stringify(clean({ fields: Object.fromEntries(s.fields), rows: Object.fromEntries(s.rows) })));
}

type PgClient = { connect(): Promise<void>; query(sql: string, values?: unknown[]): Promise<{ rows: Row[] }>; end(): Promise<void>; on(event: string, listener: () => void): unknown };
export function databaseConfig(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new SafeError('Invalid DATABASE_URL (value withheld)'); }
  const direct = u.hostname === `db.${PROJECT}.supabase.co` && decodeURIComponent(u.username) === 'postgres';
  const sessionPool = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) && decodeURIComponent(u.username) === `postgres.${PROJECT}`;
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || (!direct && !sessionPool) || (u.port && u.port !== '5432') || u.pathname !== '/postgres' || !u.password || u.hash) throw new SafeError('DATABASE_URL must target acre-ops Postgres (direct or session pooler, port 5432)');
  for (const [key, value] of u.searchParams) if (key !== 'sslmode' || !['require', 'verify-full'].includes(value)) throw new SafeError('Unsupported DATABASE_URL option; TLS verification must stay enabled');
  // Explicit fields prevent URL parameters/environment from overriding TLS or routing.
  return { host: u.hostname, port: 5432, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: 'postgres', ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000, statement_timeout: 60000, query_timeout: 65000, application_name: 'acre-ops-baserow-import' };
}

export class Destination {
  databaseUrl: string; storageKey: string; apply: boolean; fetcher: Fetcher; verified = false; storageVerified = false;
  client?: PgClient; activeTable?: string; connected = false; databaseUrlAlt?: string; connectionUsed?: 'DATABASE_URL' | 'DATABASE_URL_ALT';
  constructor(databaseUrl: string, storageKey: string, apply: boolean, fetcher: Fetcher = fetch, client?: PgClient, databaseUrlAlt?: string) {
    this.databaseUrl = databaseUrl; this.storageKey = storageKey; this.apply = apply; this.fetcher = fetcher; this.client = client; this.databaseUrlAlt = databaseUrlAlt;
  }
  async connect(): Promise<void> {
    if (this.connected) return;
    const configs = [this.databaseUrl, ...(this.databaseUrlAlt ? [this.databaseUrlAlt] : [])].map(databaseConfig);
    const injected = this.client;
    for (const [index, config] of configs.entries()) {
      if (!injected) {
        try {
          const { Client } = createRequire(new URL('./import-runtime/package.json', import.meta.url))('pg');
          const ca = await readFile(new URL('./import-runtime/supabase-ca.crt', import.meta.url), 'utf8');
          this.client = new Client({ ...config, ssl: { ...config.ssl, ca } }) as PgClient;
        }
        catch { throw new SafeError('Install importer dependencies: npm ci --prefix scripts/import-runtime'); }
      }
      this.client!.on('error', () => { this.connected = false; this.verified = false; });
      try {
        await this.client!.connect();
        await this.client!.query('SET default_transaction_read_only = on');
        this.connected = true; this.connectionUsed = index === 0 ? 'DATABASE_URL' : 'DATABASE_URL_ALT'; return;
      } catch { await this.close(); }
    }
    throw new SafeError('Postgres connection failed for all supplied URLs; check credentials, network and trusted TLS certificates (details withheld)');
  }
  async close(): Promise<void> {
    this.verified = false; this.connected = false;
    try { await this.client?.end(); } catch { /* Do not expose driver error details. */ }
  }
  async query(query: string, parameters: unknown[] = [], write = false): Promise<Row[]> {
    if (!this.verified || !this.connected || !this.client || (write && (!this.apply || !this.activeTable))) throw new SafeError('Destination write/identity guard refused request');
    try {
      if (!this.activeTable) await this.client.query('BEGIN READ ONLY');
      const result = await this.client.query(query, parameters);
      if (!this.activeTable) await this.client.query('COMMIT');
      return result.rows;
    } catch {
      if (!this.activeTable) try { await this.client.query('ROLLBACK'); } catch { /* Original failure wins. */ }
      throw new SafeError('Postgres query failed (details withheld)');
    }
  }
  async tableTransaction<T>(table: string, schema: Schema, work: () => Promise<T>): Promise<T> {
    if (!this.verified || !this.connected || !this.client || !this.apply || this.activeTable || !schema.tables.has(table)) throw new SafeError('Table transaction guard refused request');
    try {
      await this.client.query('BEGIN READ WRITE'); this.activeTable = table;
      const result = await work();
      await this.client.query('COMMIT');
      return result;
    } catch (error) {
      try { await this.client.query('ROLLBACK'); } catch { /* Restart checks handle uncertain connection/commit outcomes. */ }
      throw error instanceof SafeError ? error : new SafeError(`${table}: transaction failed (details withheld); rerun safely`);
    } finally { this.activeTable = undefined; }
  }
  async verify(schema: Schema): Promise<void> {
    this.verified = false;
    databaseConfig(this.databaseUrl); // Reject another project's connection before any network request.
    if (!this.storageKey.startsWith('sb_secret_') && !/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(this.storageKey)) throw new SafeError('Storage requires a secret key or legacy service-role JWT');
    // Server authentication at the fixed acre-ops origin, not local JWT claim decoding.
    const buckets = await json(await request(this.fetcher, `${PROJECT_URL}/storage/v1/bucket`, { method: 'GET', headers: this.storageHeaders() }, 'Acre Ops Storage authentication'));
    if (!Array.isArray(buckets) || buckets.some(b => b.id === BUCKET && b.public !== false)) throw new SafeError('Invalid Storage response or public import bucket');
    this.storageVerified = true;
    await this.connect();
    this.verified = true;
    try {
    const actual = await this.query("SELECT c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'");
    if (actual.length !== schema.tables.size || actual.some(t => !schema.tables.has(String(t.name)) || t.rls !== true)) throw new SafeError('Destination schema/RLS differs from migration');
    const columns = await this.query("SELECT table_name,column_name,udt_name,is_nullable,is_identity FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
    const udt: Record<string, string> = { bigint: 'int8', integer: 'int4', text: 'text', boolean: 'bool', jsonb: 'jsonb', date: 'date', timestamptz: 'timestamptz', numeric: 'numeric' };
    for (const [table, expected] of schema.tables) {
      const found = columns.filter(c => c.table_name === table);
      if (found.length !== expected.length || expected.some(c => !found.some(a => a.column_name === c.name && a.udt_name === udt[c.type.replace(/\(.*/, '')] && a.is_nullable === (c.required ? 'NO' : 'YES') && a.is_identity === (c.identity ? 'YES' : 'NO')))) throw new SafeError(`${table}: destination column drift`);
    }
    const grants = await this.query("SELECT table_name FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')");
    if (grants.length) throw new SafeError('Destination has client table grants; private legacy credentials must not be exposed');
    // This authenticates the supplied key against this project's Storage before any write.
    await this.bucket(false);
    } catch (error) { this.verified = false; throw error; }
  }
  storageHeaders(): Record<string, string> {
    return { apikey: this.storageKey, ...(this.storageKey.startsWith('eyJ') ? { Authorization: `Bearer ${this.storageKey}` } : {}) };
  }
  async storage(path: string, init: RequestInit, write: boolean, statuses: number[] = []): Promise<Response> {
    if (!this.verified || !this.storageVerified || (write && !this.apply) || (!write && init.method !== 'GET') || !path.startsWith('/') || path.includes('..')) throw new SafeError('Storage safety guard refused request');
    return request(this.fetcher, `${PROJECT_URL}/storage/v1${path}`, { ...init, headers: { ...this.storageHeaders(), ...init.headers } }, 'Supabase Storage', statuses);
  }
  async bucket(create: boolean): Promise<void> {
    // Listing verifies authentication even if the specific bucket is absent.
    const all = await json(await this.storage('/bucket', { method: 'GET' }, false));
    if (!Array.isArray(all)) throw new SafeError('Invalid Storage bucket response');
    const bucket = (all as Row[]).find(b => b.id === BUCKET);
    if (bucket) { if (bucket.public !== false) throw new SafeError('Import bucket is public; refusing to use it'); return; }
    if (!create) return;
    await this.storage('/bucket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_FILE_BYTES }) }, true);
    await this.bucket(false);
  }
  async objectBytes(path: string): Promise<Buffer | null> {
    const r = await this.storage(`/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'GET' }, false, [400, 404]);
    if (!r.ok) { await r.body?.cancel(); return null; }
    return limitedBytes(r);
  }
  async upload(ref: FileRef, bytes: Buffer, sha: string): Promise<void> {
    await this.storage(`/object/${BUCKET}/${ref.path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { 'Content-Type': ref.mime, 'x-upsert': 'false', 'x-metadata': Buffer.from(JSON.stringify({ import_sha256: sha, source_database: DATABASE })).toString('base64') }, body: new Uint8Array(bytes),
    }, true);
  }
  async upsert(table: string, rows: Row[], schema: Schema, conflict = ['baserow_id']): Promise<Row[]> {
    if (this.activeTable !== table) throw new SafeError('Upsert must run inside its own table transaction');
    if (!rows.length) return [];
    const columns = Object.keys(rows[0]); const allowed = schema.tables.get(table);
    if (!allowed || columns.some(c => !allowed.some(a => a.name === c)) || rows.some(r => Object.keys(r).join(',') !== columns.join(',')) || conflict.some(c => !columns.includes(c))) throw new SafeError('Invalid upsert shape');
    const names = columns.map(identifier).join(',');
    const updates = columns.filter(c => !conflict.includes(c)).map(c => `${identifier(c)}=EXCLUDED.${identifier(c)}`).join(',');
    const returning = conflict[0] === 'baserow_id' ? 'id::text,baserow_id::text' : conflict.map(identifier).join(',');
    // One parameter contains the data. No source value becomes SQL text.
    const query = `INSERT INTO public.${identifier(table)} (${names}) SELECT ${names} FROM jsonb_populate_recordset(NULL::public.${identifier(table)},$1::jsonb) ON CONFLICT (${conflict.map(identifier).join(',')}) DO UPDATE SET ${updates} RETURNING ${returning}`;
    return this.query(query, [JSON.stringify(rows)], true);
  }
  async counts(schema: Schema): Promise<Record<string, number>> {
    const result = await this.query([...schema.tables.keys()].map(t => `SELECT '${t}' AS name,count(*)::text AS count FROM public.${identifier(t)}`).join(' UNION ALL '));
    if (result.length !== schema.tables.size) throw new SafeError('Incomplete destination counts');
    return Object.fromEntries(result.map(r => [String(r.name), Number(r.count)]));
  }
  async advanceCounters(schema: Schema, table: string): Promise<number> {
    if (this.activeTable !== table || !schema.tables.has(table)) throw new SafeError('Counter must run inside its own table transaction');
    const statements: string[] = []; let count = 0;
    for (const c of schema.tables.get(table)!) if (c.identity) {
      count++;
      // max() handles explicitly imported autonumbers. last_value prevents rewind on reruns.
      // setval(..., true) intentionally leaves an empty sequence at least one step ahead.
      statements.push(`seq := pg_get_serial_sequence('public.${table}','${c.name}'); EXECUTE format('SELECT last_value FROM %s',seq) INTO previous; SELECT max(${identifier(c.name)}) INTO highest FROM public.${identifier(table)}; PERFORM pg_catalog.setval(seq::regclass,GREATEST(COALESCE(highest,1),previous),true);`);
    }
    if (count) await this.query(`DO $import_counters$ DECLARE seq text; previous bigint; highest bigint; BEGIN ${statements.join('\n')} END $import_counters$;`, [], true);
    return count;
  }
}

async function limitedBytes(response: Response): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > MAX_FILE_BYTES) { await response.body?.cancel(); throw new SafeError('File exceeds 50 MiB limit'); }
  if (!response.body) throw new SafeError('Empty file response');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > MAX_FILE_BYTES) throw new SafeError('File exceeds 50 MiB limit'); chunks.push(item.value); }
  } catch { await reader.cancel(); throw new SafeError('File download incomplete or too large'); }
  return Buffer.concat(chunks);
}

export function fileIdentity(table: string, row: Row, field: Field, file: Row): { key: string; path: string; name: string; size: number | null } {
  if (blank(file.name) || typeof file.name !== 'string') throw new SafeError('File lacks stable Baserow identity');
  const name = typeof file.original_name === 'string' && file.original_name.trim() ? file.original_name : file.name;
  const size = blank(file.size) ? null : Number(file.size);
  if (size !== null && (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES)) throw new SafeError('Invalid or oversized source file');
  const key = `${SOURCE_IDS.get(table)}/${rowId(row.id)}/${field.id}/${file.name}`;
  // Stable storage path survives source URL expiration; no original path segments are trusted.
  return { key, path: `${DATABASE}/${SOURCE_IDS.get(table)}/${rowId(row.id)}/${field.id}/${digest(file.name)}`, name, size };
}

export function checkFileUrl(raw: unknown): URL {
  let url: URL; try { url = new URL(String(raw)); } catch { throw new SafeError('Invalid source file URL'); }
  const host = url.hostname;
  // The exact S3 bucket hostname below was observed in this database's live
  // attachment metadata. Do not broaden this to all S3/AWS hosts.
  const allowed = host === 'baserow.io' || host.endsWith('.baserow.io') || host === 'baserow-media.ams3.digitaloceanspaces.com' || host === 'baserow-backend-production20240528124524339000000001.s3.amazonaws.com';
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed) throw new SafeError('Source file host is outside the Baserow allowlist');
  return url;
}

export async function downloadFile(file: Row, fetcher: Fetcher = fetch): Promise<{ bytes: Buffer; mime: string }> {
  const url = checkFileUrl(file.url);
  // No Baserow/Supabase token is ever forwarded to attachment/CDN URLs.
  const response = await request(fetcher, url.href, { method: 'GET' }, 'Baserow attachment');
  const bytes = await limitedBytes(response);
  const mime = response.headers.get('content-type')?.split(';')[0].trim() || (typeof file.mime_type === 'string' ? file.mime_type : 'application/octet-stream');
  if (mime === 'text/html' && file.mime_type !== 'text/html') throw new SafeError('Attachment returned an HTML error document');
  if (!blank(file.size) && Number(file.size) !== bytes.length) throw new SafeError('Attachment size differs from source metadata');
  return { bytes, mime };
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const tmp = resolve(dirname(path), `import-${randomUUID()}.tmp`);
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(tmp, path);
}

export class FileCopier {
  target?: Destination; manifest: Manifest; persist: (m: Manifest) => Promise<void>; fetcher: Fetcher;
  counts = { references: 0, downloaded: 0, copied: 0, skipped: 0, recovered: 0, failed: 0, bytes: 0 };
  constructor(target: Destination | undefined, manifest: Manifest, persist: (m: Manifest) => Promise<void>, fetcher: Fetcher = fetch) {
    if (manifest.version !== 1 || manifest.project !== PROJECT || manifest.database !== DATABASE) throw new SafeError('Manifest belongs to another import');
    this.target = target; this.manifest = manifest; this.persist = persist; this.fetcher = fetcher;
  }
  async copy(table: string, row: Row, field: Field, file: Row): Promise<FileRef> {
    const identity = fileIdentity(table, row, field, file), old = this.manifest.files[identity.key];
    if (this.target && old) {
      if (old.ref.bucket !== BUCKET || old.ref.path !== identity.path || old.source_size !== identity.size) throw new SafeError('Manifest identity/size mismatch');
      const existing = await this.target.objectBytes(identity.path);
      if (existing && digest(existing) === old.sha256 && existing.length === old.ref.size) {
        this.counts.skipped++; this.counts.bytes += existing.length;
        return { ...old.ref, name: identity.name };
      }
      if (existing) throw new SafeError('Existing imported file failed integrity check; will not overwrite it');
    }
    const { bytes, mime } = await downloadFile(file, this.fetcher); this.counts.downloaded++; this.counts.bytes += bytes.length;
    const ref: FileRef = { bucket: BUCKET, path: identity.path, name: identity.name, size: bytes.length, mime };
    if (this.target?.apply) {
      // Crash recovery: upload may have succeeded immediately before manifest was saved.
      const existing = await this.target.objectBytes(identity.path);
      if (existing) {
        if (digest(existing) !== digest(bytes)) throw new SafeError('Existing object conflicts with source; will not overwrite');
        this.counts.recovered++;
      } else {
        await this.target.upload(ref, bytes, digest(bytes));
        const check = await this.target.objectBytes(identity.path);
        if (!check || digest(check) !== digest(bytes)) throw new SafeError('Uploaded file failed verification');
        this.counts.copied++;
      }
      this.manifest.files[identity.key] = { ref, sha256: digest(bytes), source_size: identity.size };
      await this.persist(this.manifest);
    }
    return ref;
  }
  async rowFiles(table: string, row: Row, s: Snapshot, schema: Schema, issues: Issue[]): Promise<Row> {
    const out: Row = {};
    for (const field of s.fields.get(table) || []) if (field.type === 'file') {
      const name = normalizeName(field.name);
      if (!schema.tables.get(table)?.some(c => c.name === name && c.type === 'jsonb')) throw new SafeError(`${table}.${name}: unmapped file column`);
      const raw = sourceValue(row, field); const files = blank(raw) ? [] : raw;
      const refs: FileRef[] = []; out[name] = refs;
      if (!Array.isArray(files)) { issue(issues, { kind: 'file', table, row: rowId(row.id), field: field.name, code: 'invalid_file_array', blocking: false }); this.counts.failed++; continue; }
      for (const [fileIndex, file] of files.entries()) {
        this.counts.references++;
        try { refs.push(await this.copy(table, row, field, file as Row)); }
        catch (error) {
          this.counts.failed++;
          // SafeError strings above contain no URL/token/file content; arbitrary exceptions do not escape.
          issue(issues, { kind: 'file', table, row: rowId(row.id), field: field.name, file_index: fileIndex, code: error instanceof SafeError ? error.message : 'file_processing_failed', blocking: false });
        }
      }
    }
    return out;
  }
}

async function loadManifest(): Promise<Manifest> {
  try { return JSON.parse(await readFile(resolve(STATE, 'import-manifest.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new SafeError('Cannot read manifest; preserve it and repair before rerun'); }
  return { version: 1, project: PROJECT, database: DATABASE, files: {} };
}

function assertEnvironment(env: NodeJS.ProcessEnv, sourceOnly: boolean): void {
  const required = sourceOnly ? ['BASEROW_API_TOKEN'] : ['BASEROW_API_TOKEN', 'DATABASE_URL', 'SUPABASE_URL'];
  for (const key of required) if (!env[key]) throw new SafeError(`Missing environment variable: ${key}`);
  if (!sourceOnly && !env.SUPABASE_SERVICE_ROLE_KEY && !env.SUPABASE_SECRET_KEY) throw new SafeError('Missing acre-ops SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)');
  for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) if (env[key] && env[key]!.replace(/\/$/, '') !== PROJECT_URL) throw new SafeError(`${key} points at another project`);
  if (env.SUPABASE_PROJECT_REF && env.SUPABASE_PROJECT_REF !== PROJECT) throw new SafeError('SUPABASE_PROJECT_REF points at another project');
  if (!sourceOnly) { databaseConfig(env.DATABASE_URL!); if (env.DATABASE_URL_ALT) databaseConfig(env.DATABASE_URL_ALT); }
}

export async function run(args: string[], env?: NodeJS.ProcessEnv, log: Logger = console.log): Promise<void> {
  if (args.includes('--help')) { log('node scripts/import-baserow.ts [--dry-run | --source-only | --apply --expected-fingerprint=SHA256]\nLoads .env.local; existing environment variables take precedence. Default: full read-only dry run. See scripts/import-baserow.README.md.'); return; }
  if (!env) {
    let local: Record<string, string | undefined> = {};
    try { local = parseEnv(await readFile(resolve(ROOT, '.env.local'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new SafeError('Cannot read .env.local (details withheld)'); }
    env = { ...local, ...process.env };
  }
  const apply = args.includes('--apply'), sourceOnly = args.includes('--source-only');
  const expectedFingerprint = args.find(a => a.startsWith('--expected-fingerprint='))?.split('=')[1];
  if (args.some(a => !['--apply', '--dry-run', '--source-only'].includes(a) && !/^--expected-fingerprint=[a-f0-9]{64}$/.test(a)) || (apply && (sourceOnly || args.includes('--dry-run'))) || (apply && !expectedFingerprint)) throw new SafeError('Invalid arguments; apply requires the fingerprint from a completed full dry run');
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (branch !== 'supabase-schema') throw new SafeError('Run only from branch supabase-schema');
  assertEnvironment(env, sourceOnly);
  const schema = parseSchema(await readFile(resolve(ROOT, 'supabase/migrations/001_init.sql'), 'utf8'), await readFile(resolve(ROOT, 'supabase/migrations', BILLING_MIGRATION), 'utf8'));
  const target = sourceOnly ? undefined : new Destination(env.DATABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY!, apply, fetch, undefined, env.DATABASE_URL_ALT);
  try {
  if (target) { await target.verify(schema); log(`Verified acre-ops Postgres via ${target.connectionUsed}; Storage authentication passed`); }
  const s = await new BaserowReader(env.BASEROW_API_TOKEN!).collect(log);
  const check = preflight(s, schema), sourceFingerprint = fingerprint(s);
  log(`Source fingerprint: ${sourceFingerprint}`);
  const before = target ? await target.counts(schema) : {};
  const sourceCounts = Object.fromEntries(TABLES.map(([table]) => [table, s.rows.get(table)!.length]));
  const sourceTotal = Object.values(sourceCounts).reduce((sum, n) => sum + n, 0);
  log(`Source total: ${sourceTotal} across ${TABLES.length} tables; journal excluded`);
  log('Table | Baserow/expected | Supabase before');
  for (const [table, count] of Object.entries(check.expected)) log(`${table} | ${count} | ${before[table] ?? 'not checked'}`);
  for (const absent of check.absent) log(`Inventory note: ${absent}`);
  if (apply && sourceFingerprint !== expectedFingerprint) throw new SafeError('Source changed since dry run; run and review a fresh full dry run before applying');
  if (apply && check.issues.some(i => i.blocking)) {
    log(JSON.stringify({ status: 'BLOCKED BEFORE WRITES', errors: check.issues }, null, 2));
    throw new SafeError('Preflight found incompatible source data; no writes made');
  }
  const manifest = await loadManifest();
  const copier = new FileCopier(target, manifest, m => atomicJson(resolve(STATE, 'import-manifest.json'), m));
  if (!apply) {
    for (const [table] of TABLES) {
      if (!s.fields.get(table)?.some(f => f.type === 'file')) continue;
      for (const [index, row] of (s.rows.get(table) || []).entries()) { await copier.rowFiles(table, row, s, schema, check.issues); if (index % 100 === 0) log(`${table}: attachment checks ${index + 1}/${s.rows.get(table)!.length}`); }
    }
    log(JSON.stringify({ status: sourceOnly ? 'SOURCE-ONLY CHECK — SUPABASE NOT VERIFIED' : 'FULL DRY RUN — NO WRITES', project: PROJECT, database: DATABASE, fingerprint: sourceFingerprint, source_counts: sourceCounts, source_total: sourceTotal, skipped_rows: check.issues.filter(i => i.kind === 'skipped_row'), expected: check.expected, expected_total: Object.values(check.expected).reduce((sum, n) => sum + n, 0), supabase: before, files: copier.counts, errors: check.issues }, null, 2));
    if (check.issues.some(i => i.blocking)) throw new SafeError('Preflight found incompatible source data; no writes made');
    if (check.issues.length) process.exitCode = 2;
    return;
  }
  if (!target) throw new SafeError('Missing destination');
  let lock;
  try { lock = await open(resolve(STATE, 'import.lock'), 'wx', 0o600); await lock.writeFile(JSON.stringify({ pid: process.pid, project: PROJECT, started: new Date().toISOString() })); }
  catch { throw new SafeError('Import lock exists; verify that no other importer is running before removing this exact lock'); }
  const saveErrors = () => atomicJson(resolve(STATE, 'import-errors.json'), { project: PROJECT, source_fingerprint: sourceFingerprint, updated_at: new Date().toISOString(), errors: check.issues });
  const walk: Crosswalk = new Map();
  let counters = 0;
  try {
    await saveErrors(); await target.bucket(true);
    for (const catalog of schema.catalogs) {
      const rows = optionRows(s, catalog);
      const actual = await target.tableTransaction(catalog.name, schema, async () => {
      // Match labels exactly. A conflicting target option ID/value is not silently merged.
      const existing = await target.query(`SELECT id::text,baserow_id::text,value FROM public.${identifier(catalog.name)}`);
      if (rows.some(r => existing.some(e => (e.value === r.value && e.baserow_id !== r.baserow_id) || (e.baserow_id === r.baserow_id && e.value !== r.value)))) throw new SafeError(`${catalog.name}: destination option crosswalk conflicts`);
      await target.upsert(catalog.name, rows, schema);
      counters += await target.advanceCounters(schema, catalog.name);
      return target.query(`SELECT id::text,value FROM public.${identifier(catalog.name)}`);
      });
      walk.set(catalog.name, new Map(actual.map(r => [String(r.value), String(r.id)])));
      log(`${catalog.name}: ${rows.length} options upserted`);
    }
    for (const [table] of TABLES) {
      const rows = s.rows.get(table)!.filter(row => !skipRackRow(table, row, s, check.issues)); const mapping = new Map<string, string>(); walk.set(table, mapping);
      // Finish network/file work before holding a database transaction open.
      const prepared: Row[] = [];
      for (const row of rows) prepared.push({ ...convertRow(table, row, s, schema, walk, check.issues), ...await copier.rowFiles(table, row, s, schema, check.issues) });
      await saveErrors();
      if (check.issues.some(i => i.blocking)) throw new SafeError(`${table}: unresolved required value before upsert`);
      await target.tableTransaction(table, schema, async () => {
      for (let start = 0; start < prepared.length; start += PAGE_SIZE) {
        const batch = prepared.slice(start, start + PAGE_SIZE);
        const results = await target.upsert(table, batch, schema);
        if (results.length !== batch.length) throw new SafeError(`${table}: incomplete upsert response`);
        for (const row of results) mapping.set(rowId(row.baserow_id), rowId(row.id));
        log(`${table}: staged ${Math.min(start + PAGE_SIZE, rows.length)}/${rows.length}`);
      }
      counters += await target.advanceCounters(schema, table);
      });
      log(`${table}: committed ${rows.length} rows`);
    }
    for (const join of JOINS) {
      const rows = joinRows(s, walk, check.issues, join);
      await target.tableTransaction(join.name, schema, async () => {
      for (let start = 0; start < rows.length; start += PAGE_SIZE) await target.upsert(join.name, rows.slice(start, start + PAGE_SIZE), schema, [join.left, join.right]);
      });
      log(`${join.name}: ${rows.length} links upserted`);
    }
    const after = await target.counts(schema);
    for (const [table, expected] of Object.entries(check.expected)) if (after[table] !== expected) issue(check.issues, { kind: 'reconciliation', table, code: `count_expected_${expected}_actual_${after[table]}`, blocking: false });
    // Row counts alone cannot prove the crosswalk: compare the imported ID sets too.
    for (const [table] of TABLES) {
      const actual = await target.query(`SELECT baserow_id::text FROM public.${identifier(table)} WHERE baserow_id IS NOT NULL`);
      const expected = new Set((s.rows.get(table) || []).filter(row => !skipRackRow(table, row, s, check.issues)).map(r => rowId(r.id)));
      if (actual.length !== expected.size || actual.some(r => !expected.has(String(r.baserow_id)))) issue(check.issues, { kind: 'reconciliation', table, code: 'baserow_id_set_mismatch', blocking: false });
    }
    await target.verify(schema); // Includes all-table RLS, private bucket and no client grants.
    const skippedRows = check.issues.filter(i => i.kind === 'skipped_row');
    const report = { status: check.issues.length ? 'COMPLETED WITH ERRORS — REVIEW REQUIRED' : 'VERIFIED', date: new Date().toISOString(), project: PROJECT, database: DATABASE, fingerprint: sourceFingerprint, counters_advanced: counters, source_counts: sourceCounts, expected: check.expected, supabase: after, skipped_rows: skippedRows, files: copier.counts, errors: check.issues, absent_source_fields: check.absent };
    await saveErrors(); await atomicJson(resolve(STATE, 'import-report.json'), report);
    const lines = ['# Baserow → Acre Ops import', '', `${report.date} — ${report.status}`, '', `Project: ${PROJECT}`, '', '| Table | Baserow | Expected after skips | Supabase |', '|---|---:|---:|---:|', ...Object.entries(check.expected).map(([table, n]) => `| ${table} | ${sourceCounts[table] ?? n} | ${n} | ${after[table]} |`), '', `Skipped Baserow rows: ${skippedRows.map(r => `${r.table} #${r.row} (${r.field})`).join('; ') || 'none'}`, '', `Files: ${JSON.stringify(copier.counts)}`, '', `Errors: ${check.issues.length}; see import-errors.json.`, ''];
    await writeFile(resolve(STATE, 'import-report.md'), lines.join('\n'), { mode: 0o600 });
    log(JSON.stringify(report, null, 2));
    if (check.issues.length) process.exitCode = 2;
  } catch (error) {
    issue(check.issues, { kind: 'interrupted', table: 'import', code: error instanceof SafeError ? error.message : 'unexpected_failure_details_withheld', blocking: true });
    await saveErrors(); throw error;
  } finally { await lock.close(); await unlink(resolve(STATE, 'import.lock')); }
  } finally { await target?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run(process.argv.slice(2)).catch(error => { console.error(error instanceof SafeError ? error.message : 'Import stopped; unexpected error details withheld to protect credentials'); process.exitCode = 1; });
}
