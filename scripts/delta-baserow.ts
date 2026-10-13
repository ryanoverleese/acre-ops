#!/usr/bin/env node
/** Cutover-only, one-way delta. Default is READ ONLY. See supabase/cutover-runbook.md. */
import { readFile, open, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import bcrypt from 'bcryptjs';
import {
  PROJECT, DATABASE, TABLES, JOINS, SafeError, BaserowReader,
  Destination, FileCopier, preflight, convertRow, joinRows, optionRows, fingerprint,
  digest, identifier, fieldFor, fileIdentity, loadManifest, loadCurrentSchema,
  assertEnvironment, atomicJson, skipRackRow,
// @ts-expect-error Node 24 runs this standalone script directly and requires the .ts extension.
} from './import-baserow.ts';
import type { Row, Schema, Snapshot, Crosswalk, Issue } from './import-baserow.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = resolve(ROOT, 'scripts');
const BCRYPT = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/;
const schemaValue = (value: unknown, type: string) => type === 'jsonb' ? JSON.stringify(value) : value;
type Data = Map<string, Row[]>;
type Change = { key: string; before?: Row; after?: Row; columns: string[] };
export type TableDelta = { table: string; source: number; eligible: number; destination: number; native: number; added: Change[]; changed: Change[]; deleted: Change[] };
type Plan = { tables: TableDelta[]; sourceFingerprint: string; destinationFingerprint: string; approval: string; issues: Issue[]; desired: Data; before: Data; schema: Schema; snapshot: Snapshot; files: ReturnType<typeof fileSummary>; preserved: Record<string, number> };

export function stable(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)])) : v;
  return JSON.stringify(sort(value));
}
export function normalized(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null;
  if (type === 'timestamptz') return new Date(String(value)).toISOString();
  if (/^(numeric|bigint|integer)/.test(type)) {
    const raw = String(value);
    if (raw.startsWith('new:')) return raw; // Symbolic crosswalk before INSERT.
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) throw new SafeError('Unexpected destination numeric value');
    const negative = raw.startsWith('-');
    const [whole, fraction = ''] = raw.replace(/^[+-]/, '').split('.');
    const result = (whole.replace(/^0+(?=\d)/, '') || '0') + (fraction.replace(/0+$/, '') ? '.' + fraction.replace(/0+$/, '') : '');
    return negative && result !== '0' ? '-' + result : result;
  }
  if (type === 'jsonb') return stable(value);
  return value;
}
export function changedColumns(before: Row, after: Row, table: string, schema: Schema): string[] {
  return Object.keys(after).filter(key => {
    const c = schema.tables.get(table)?.find(c => c.name === key);
    if (!c) throw new SafeError('Delta contains unknown column');
    return stable(normalized(before[key], c.type)) !== stable(normalized(after[key], c.type));
  });
}
const keyOf = (table: string, row: Row) => {
  const join = JOINS.find(j => j.name === table);
  return join ? `${row[join.left]}:${row[join.right]}` : String(row.baserow_id);
};
export function compareTable(table: string, desired: Row[], before: Row[], schema: Schema, source = desired.length, managed: (r: Row) => boolean = r => r.baserow_id !== null, protectedIds = new Set<string>()): TableDelta {
  const actual = new Map(before.filter(managed).map(r => [keyOf(table, r), r]));
  const wanted = new Map(desired.map(r => [keyOf(table, r), r]));
  if (wanted.size !== desired.length || actual.size !== before.filter(managed).length) throw new SafeError(`${table}: duplicate delta identity`);
  const delta: TableDelta = { table, source, eligible: desired.length, destination: before.length, native: before.filter(r => !managed(r)).length, added: [], changed: [], deleted: [] };
  for (const [key, after] of wanted) {
    const old = actual.get(key);
    if (!old) delta.added.push({ key, after, columns: Object.keys(after) });
    else { const columns = changedColumns(old, after, table, schema); if (columns.length) delta.changed.push({ key, before: old, after, columns }); }
  }
  for (const [key, old] of actual) if (!wanted.has(key) && !protectedIds.has(key)) delta.deleted.push({ key, before: old, columns: [] });
  return delta;
}

// Reads exact decimals/bigints as strings; jsonb numeric serialization would lose
// precision for large crosswalks/autonumbers. All identifiers come from pinned SQL.
export async function readDestination(target: Destination, schema: Schema): Promise<Data> {
  const data: Data = new Map();
  const ownSnapshot = !target.activeTable;
  if (ownSnapshot) {
    if (!target.verified || !target.connected || !target.client) throw new SafeError('Read snapshot guard refused');
    await target.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    target.activeTable = 'read_only_snapshot';
  }
  try {
  for (const [table, columns] of schema.tables) {
    const select = columns.map(c => `${identifier(c.name)}${/^(numeric|bigint|integer|date|timestamptz)/.test(c.type) ? '::text' : ''} AS ${identifier(c.name)}`).join(',');
    data.set(table, await target.query(`SELECT ${select} FROM public.${identifier(table)} ORDER BY ${columns.some(c => c.name === 'id') ? 'id' : columns.filter(c => c.target).map(c => identifier(c.name)).join(',')}`));
  }
  if (ownSnapshot) await target.client!.query('COMMIT');
  return data;
  } catch (error) {
    if (ownSnapshot) try { await target.client!.query('ROLLBACK'); } catch { /* Safe original error wins. */ }
    throw error instanceof SafeError ? error : new SafeError('Destination snapshot failed; details withheld');
  } finally { if (ownSnapshot) target.activeTable = undefined; }
}
export const dataFingerprint = (data: Data) => digest(stable(Object.fromEntries([...data].map(([t, rows]) => [t, rows.map(r => stable(r)).sort()]))));

export function crosswalk(snapshot: Snapshot, schema: Schema, before: Data, issues: Issue[]): Crosswalk {
  const walk: Crosswalk = new Map();
  for (const [table] of TABLES) {
    const old = new Map((before.get(table) || []).filter(r => r.baserow_id !== null).map(r => [String(r.baserow_id), String(r.id)]));
    walk.set(table, new Map((snapshot.rows.get(table) || []).filter(r => !skipRackRow(table, r, snapshot, issues)).map(r => [String(r.id), old.get(String(r.id)) || `new:${table}:${r.id}`])));
  }
  for (const catalog of schema.catalogs) {
    const old = before.get(catalog.name) || [];
    const map = new Map<string, string>();
    for (const row of optionRows(snapshot, catalog)) {
      const sameId = old.find(r => r.baserow_id === row.baserow_id);
      const sameValue = old.find(r => r.value === row.value);
      // Renames retaining an option's crosswalk are supported, but never steal
      // a label owned by a different option or a Supabase-native option.
      if (sameValue && sameValue.id !== sameId?.id) issues.push({kind:'conflict', table:catalog.name, row:String(row.baserow_id), code:'option_value_owned_by_different_row', blocking:true});
      map.set(String(row.value), sameId ? String(sameId.id) : `new:${catalog.name}:${row.baserow_id}`);
    }
    walk.set(catalog.name, map);
  }
  return walk;
}

export async function protectDestination(table: string, wanted: Row, old: Row | undefined, preserved: Record<string, number>, issues: Issue[]): Promise<void> {
  if (table === 'installers' && wanted.pin != null) {
    const pin = String(wanted.pin);
    if (!BCRYPT.test(pin) && !/^\d{4,6}$/.test(pin)) { issues.push({kind:'invalid_value',table,row:String(wanted.baserow_id),field:'pin',code:'invalid_pin_format',blocking:true}); return; }
    if (old?.pin && BCRYPT.test(String(old.pin)) && (pin === old.pin || (!BCRYPT.test(pin) && await bcrypt.compare(pin, String(old.pin).replace(/^\$2y\$/, '$2b$'))))) {
      wanted.pin = old.pin; // Equal plaintext/hash is NOT a changed row.
      preserved['installers.hashed_pin'] = (preserved['installers.hashed_pin'] || 0) + 1;
    }
  }
  if (table === 'users' && old?.last_login && (!wanted.last_login || Date.parse(String(old.last_login)) > Date.parse(String(wanted.last_login)))) {
    wanted.last_login = old.last_login;
    preserved['users.newer_last_login'] = (preserved['users.newer_last_login'] || 0) + 1;
  }
  if (table === 'invoice_lines') {
    delete wanted.field_unit_rate; delete wanted.field_quantity;
    if (old?.field_unit_rate != null && ['rate','quantity','field_season_id','invoice_id'].some(k => Object.hasOwn(wanted,k) && normalized(wanted[k], 'numeric') !== normalized(old[k], 'numeric'))) {
      issues.push({kind:'conflict',table,row:String(wanted.baserow_id),code:'billing_snapshot_requires_manual_reconciliation',blocking:true});
    }
  }
}

function fileSummary(copier: FileCopier, newReferences: number, missingObjects: number) {
  return { ...copier.counts, new_references: newReferences, objects_to_copy: missingObjects };
}
export function checkFinalLinks(schema: Schema, before: Data, deltas: TableDelta[], issues: Issue[]): void {
  const final: Data = new Map();
  for (const [table, rows] of before) {
    const delta = deltas.find(d => d.table === table);
    const deleted = new Set(delta?.deleted.map(c => keyOf(table,c.before!)) || []);
    const updates = new Map(delta?.changed.map(c => [keyOf(table,c.before!),c.after!]) || []);
    final.set(table,[...rows.filter(r => !deleted.has(keyOf(table,r))).map(r => ({...r,...updates.get(keyOf(table,r))})), ...(delta?.added.map(c => ({id:`new:${table}:${c.after!.baserow_id}`, ...c.after!})) || [])]);
  }
  for (const [table, rows] of final) for (const c of schema.tables.get(table) || []) if (c.target) {
    const ids = new Set((final.get(c.target) || []).map(r => String(r.id)));
    for (const row of rows) if (row[c.name] != null && !ids.has(String(row[c.name]))) issues.push({kind:'conflict',table,row:row.baserow_id == null ? 'native' : String(row.baserow_id),field:c.name,code:'deletion_or_link_would_break_retained_row',blocking:true});
  }
}

export async function makePlan(snapshot: Snapshot, schema: Schema, before: Data, copier: FileCopier): Promise<Plan> {
  const check = preflight(snapshot, schema), issues = check.issues;
  const walk = crosswalk(snapshot, schema, before, issues), desired: Data = new Map(), tables: TableDelta[] = [];
  const preserved: Record<string, number> = {}; let newReferences = 0, missingObjects = 0;
  // Count genuinely missing Storage objects, not just missing manifest entries.
  const originalCopy = copier.copy.bind(copier);
  copier.copy = async (table, row, field, file) => {
    const identity = fileIdentity(table,row,field,file);
    if (!copier.manifest.files[identity.key]) newReferences++;
    const downloaded = copier.counts.downloaded;
    const ref = await originalCopy(table,row,field,file);
    if (copier.target && copier.counts.downloaded > downloaded) {
      const bytes = await copier.target.objectBytes(ref.path);
      if (!bytes) missingObjects++;
      else if (bytes.length !== ref.size) throw new SafeError('Existing Storage object has conflicting size');
    }
    return ref;
  };
  for (const catalog of schema.catalogs) {
    if (!fieldFor(snapshot,catalog.source,catalog.field)) continue;
    const rows = optionRows(snapshot,catalog); desired.set(catalog.name,rows);
    tables.push(compareTable(catalog.name,rows,before.get(catalog.name) || [],schema));
  }
  for (const [table] of TABLES) {
    const rows: Row[] = [], old = new Map((before.get(table) || []).map(r => [String(r.baserow_id),r]));
    const skipped = new Set<string>();
    for (const row of snapshot.rows.get(table) || []) {
      if (skipRackRow(table,row,snapshot,issues)) { skipped.add(String(row.id)); continue; }
      const wanted = {...convertRow(table,row,snapshot,schema,walk,issues),...await copier.rowFiles(table,row,snapshot,schema,issues)};
      await protectDestination(table,wanted,old.get(String(row.id)),preserved,issues);
      rows.push(wanted);
    }
    desired.set(table,rows);
    tables.push(compareTable(table,rows,before.get(table) || [],schema,snapshot.rows.get(table)!.length,undefined,skipped));
  }
  for (const join of JOINS) {
    if (!fieldFor(snapshot,join.source,join.field)) continue;
    const rows = joinRows(snapshot,walk,issues,join); desired.set(join.name,rows);
    // The imported owner defines authority, including its now-removed links.
    // Links owned by native app rows are never candidates for deletion.
    const owners = new Set((before.get(join.source) || []).filter(r => r.baserow_id != null).map(r => String(r.id)));
    tables.push(compareTable(join.name,rows,before.get(join.name) || [],schema,rows.length,r => owners.has(String(r[join.left]))));
  }
  // Fail closed on unresolved files/links: do not clear a valid destination value
  // simply because a source download or crosswalk lookup failed.
  for (const issue of issues) if (issue.kind === 'file' || issue.kind === 'missing_link') issue.blocking = true;
  checkFinalLinks(schema,before,tables,issues);
  const sourceFingerprint = fingerprint(snapshot), destinationFingerprint = dataFingerprint(before);
  const approval = digest(stable({version:1,project:PROJECT,sourceFingerprint,destinationFingerprint,files:fileSummary(copier,newReferences,missingObjects)}));
  return {tables,sourceFingerprint,destinationFingerprint,approval,issues,desired,before,schema,snapshot,files:fileSummary(copier,newReferences,missingObjects),preserved};
}

export function summarize(plan: Plan) {
  return { status:plan.issues.some(i=>i.blocking)?'BLOCKED — NO WRITES':'READ-ONLY DELTA', checked_at:new Date().toISOString(), project:PROJECT,database:DATABASE,
    approval:plan.approval,source_fingerprint:plan.sourceFingerprint,destination_fingerprint:plan.destinationFingerprint,
    tables:plan.tables.map(d=>({table:d.table,source:d.source,eligible:d.eligible,supabase:d.destination,new:d.added.length,changed:d.changed.length,deleted:d.deleted.length,native_preserved:d.native,changed_columns:[...new Set(d.changed.flatMap(c=>c.columns))].sort(),new_ids:d.added.map(c=>c.key),changed_ids:d.changed.map(c=>c.key),deleted_ids:d.deleted.map(c=>c.key)})),
    files:plan.files,preserved:plan.preserved,errors:plan.issues };
}

export function assertApproved(plan: Plan, approval: string | undefined, allowDeletes: boolean): void {
  if (plan.issues.some(i=>i.blocking)) throw new SafeError('Delta is blocked; resolve reported issues before writes');
  if (approval !== plan.approval) throw new SafeError('Source/destination/files changed since review; run a fresh dry run');
  if (!allowDeletes && plan.tables.some(d=>d.deleted.length)) throw new SafeError('Reviewed deletions require --allow-deletes');
}

export async function applyPlan(target: Destination, plan: Plan, approval: string, allowDeletes: boolean, prepareFiles: () => Promise<void>): Promise<void> {
  assertApproved(plan,approval,allowDeletes);
  if (!target.apply || !target.verified || !target.client) throw new SafeError('Delta write guard refused');
  // File bytes and bcrypt work complete BEFORE holding any database lock.
  await prepareFiles();
  const prepared = new Map<Change, Row>();
  for (const d of plan.tables) for (const c of [...d.added,...d.changed]) {
    const row = {...c.after!};
    if (d.table === 'installers' && row.pin != null && !BCRYPT.test(String(row.pin))) row.pin = await bcrypt.hash(String(row.pin),12);
    prepared.set(c,row);
  }
  const remap = new Map<string,string>();
  const isNewLink = (table: string, key: string, value: unknown) => plan.schema.tables.get(table)!.some(c=>c.name===key&&c.target) && typeof value==='string' && value.startsWith('new:');
  const resolveRow = (table: string, row: Row): Row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k,isNewLink(table,k,v) ? remap.get(String(v)) || v : v]));
  const order = [...plan.schema.catalogs.map(c=>c.name),...TABLES.map(([t])=>t),...JOINS.map(j=>j.name)];
  try {
    await target.client.query('BEGIN READ WRITE');
    target.activeTable = 'fields';
    await target.query("SET LOCAL lock_timeout = '5s'",[],true);
    await target.query("SET LOCAL statement_timeout = '60s'",[],true);
    await target.query('SELECT pg_advisory_xact_lock(714626,6)',[],true);
    // Same lock order on every run. Reads remain available; all app/source-copy
    // writes are frozen and concurrent writers cannot invalidate the approval.
    await target.query(`LOCK TABLE ${[...plan.schema.tables.keys()].sort().map(t=>`public.${identifier(t)}`).join(',')} IN SHARE ROW EXCLUSIVE MODE`,[],true);
    if (dataFingerprint(await readDestination(target,plan.schema)) !== plan.destinationFingerprint) throw new SafeError('Destination changed before commit; no database delta applied');
    for (const table of order) {
      const d = plan.tables.find(d=>d.table===table); if (!d) continue;
      target.activeTable = table;
      for (const change of [...d.added,...d.changed]) {
        const row = resolveRow(table,prepared.get(change)!);
        if (Object.entries(row).some(([k,v])=>isNewLink(table,k,v))) throw new SafeError(`${table}: unresolved new crosswalk`);
        const join = JOINS.find(j=>j.name===table);
        // Existing rows use UPDATE: a partial INSERT ... ON CONFLICT would fail
        // NOT NULL validation before reaching its conflict handler.
        const keys = join ? [join.left,join.right] : ['baserow_id'];
        let result: Row[];
        if (change.before) {
          const columns = change.columns.filter(k=>!keys.includes(k));
          const values = [...columns.map(k=>schemaValue(row[k],plan.schema.tables.get(table)!.find(c=>c.name===k)!.type)),...keys.map(k=>row[k])];
          result = await target.query(`UPDATE public.${identifier(table)} SET ${columns.map((k,i)=>`${identifier(k)}=$${i+1}`).join(',')} WHERE ${keys.map((k,i)=>`${identifier(k)}=$${columns.length+i+1}`).join(' AND ')} RETURNING ${join?keys.map(identifier).join(','):'id::text,baserow_id::text'}`,values,true);
        } else result = await target.upsert(table,[row],plan.schema,keys);
        if (result.length !== 1) throw new SafeError('Delta returned an incomplete update');
        if (!join) {
          if (result.length !== 1) throw new SafeError('Delta returned an incomplete crosswalk');
          remap.set(`new:${table}:${row.baserow_id}`,String(result[0].id));
        }
      }
      if (d.added.length || d.changed.some(c=>c.columns.some(name=>plan.schema.tables.get(table)!.some(col=>col.name===name&&col.identity)))) await target.advanceCounters(plan.schema,table);
    }
    // Explicit join deletes first, then child rows, then parents, then options.
    // Final-link preflight ensures neither RESTRICT nor CASCADE silently damages
    // a retained row (especially a native app row).
    for (const table of [...JOINS.map(j=>j.name),...TABLES.map(([t])=>t).reverse(),...plan.schema.catalogs.map(c=>c.name).reverse()]) {
      const d = plan.tables.find(d=>d.table===table); if (!d?.deleted.length) continue;
      target.activeTable = table;
      const join = JOINS.find(j=>j.name===table);
      for (const change of d.deleted) {
        const keys = join ? [join.left,join.right] : ['id','baserow_id'];
        const result = await target.query(`DELETE FROM public.${identifier(table)} WHERE ${keys.map((k,i)=>`${identifier(k)}=$${i+1}`).join(' AND ')} RETURNING ${identifier(keys[0])}`,keys.map(k=>change.before![k]),true);
        if (result.length !== 1) throw new SafeError('Delete reconciliation mismatch; database delta rolled back');
      }
    }
    const actual = await readDestination(target,plan.schema);
    for (const d of plan.tables) {
      if (actual.get(d.table)!.length !== d.destination+d.added.length-d.deleted.length) throw new SafeError(`${d.table}: count verification failed`);
      for (const change of [...d.added,...d.changed]) {
        const row = resolveRow(d.table,prepared.get(change)!);
        const found = actual.get(d.table)!.find(r=>keyOf(d.table,r)===keyOf(d.table,row));
        if (!found || changedColumns(found,row,d.table,plan.schema).length) throw new SafeError(`${d.table}: value verification failed`);
      }
    }
    await target.client.query('COMMIT');
  } catch (error) {
    try { await target.client.query('ROLLBACK'); } catch { /* Fresh dry run resolves uncertain commit outcomes. */ }
    throw error instanceof SafeError ? error : new SafeError('Database delta failed; details withheld. Recheck with dry run before retrying');
  } finally { target.activeTable = undefined; }
}

export async function runDelta(args: string[], suppliedEnv?: NodeJS.ProcessEnv, log: (s:string)=>void = console.log): Promise<void> {
  if (args.includes('--help')) { log('node scripts/delta-baserow.ts --dry-run [--report]\nLater, with approval: --apply --expected-plan=SHA256 --freeze-confirmed [--allow-deletes]\nSee supabase/cutover-runbook.md. No Baserow writes. No Netlify changes.'); return; }
  const apply = args.includes('--apply'), approval = args.find(a=>a.startsWith('--expected-plan='))?.slice(16);
  if (args.some(a=>!['--dry-run','--report','--apply','--freeze-confirmed','--allow-deletes'].includes(a) && !/^--expected-plan=[a-f0-9]{64}$/.test(a)) || (apply && (args.includes('--dry-run') || !approval || !args.includes('--freeze-confirmed'))) || (!apply && (approval || args.includes('--allow-deletes')))) throw new SafeError('Invalid arguments: apply needs a reviewed plan and confirmed writer freeze');
  if (execFileSync('git',['branch','--show-current'],{cwd:ROOT,encoding:'utf8'}).trim()!=='supabase-schema') throw new SafeError('Run only on supabase-schema, before merging');
  const env = suppliedEnv || {...parseEnv(await readFile(resolve(ROOT,'.env.local'),'utf8')),...process.env};
  assertEnvironment(env,false);
  const schema = await loadCurrentSchema();
  const target = new Destination(env.DATABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY!,false,fetch,undefined,env.DATABASE_URL_ALT);
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  let plan: Plan | undefined;
  try {
    if (apply) {
      lock = await open(resolve(STATE,'import.lock'),'wx',0o600);
      await lock.writeFile(JSON.stringify({pid:process.pid,project:PROJECT,mode:'delta',started:new Date().toISOString()}));
    }
    await target.verify(schema);
    const views = await target.query("SELECT relname,reloptions FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='v'");
    if (views.length !== 15 || views.some(v=>!Array.isArray(v.reloptions)||!v.reloptions.includes('security_invoker=true'))) throw new SafeError('Expected 15 security-invoker views; review drift before proceeding');
    const security = await target.query("SELECT conname FROM pg_constraint WHERE conrelid IN ('public.installers'::regclass,'public.invoice_lines'::regclass) AND conname IN ('installers_pin_bcrypt_only','invoice_lines_field_basis_valid') AND convalidated");
    if (security.length !== 2) throw new SafeError('Applied cutover constraints are missing; do not reapply blindly');
    const triggers = await target.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)");
    if (triggers.length) throw new SafeError('Unexpected public triggers require delta safety review');
    const extraLinks = await target.query("SELECT conname FROM pg_constraint WHERE contype='f' AND confrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) AND conrelid NOT IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)");
    if (extraLinks.length) throw new SafeError('External-schema references require delta safety review');
    log(`Verified ${PROJECT} via ${target.connectionUsed}; READ ONLY`);
    const snapshot = await new BaserowReader(env.BASEROW_API_TOKEN!).collect(log);
    const before = await readDestination(target,schema), manifest = await loadManifest();
    const copier = new FileCopier(target,manifest,async()=>{throw new SafeError('Dry run cannot persist file state');});
    plan = await makePlan(snapshot,schema,before,copier);
    const report = summarize(plan); log(JSON.stringify(report,null,2));
    if (args.includes('--report')) await atomicJson(resolve(STATE,'delta-report.json'),report);
    if (!apply) { if (plan.issues.length) process.exitCode=2; return; }
    assertApproved(plan,approval,args.includes('--allow-deletes'));
    // Freeze is operational, not an API lock. Collect twice and require stable
    // source before any Storage/SQL write; a missing/partial page always aborts.
    if (fingerprint(await new BaserowReader(env.BASEROW_API_TOKEN!).collect(log))!==plan.sourceFingerprint) throw new SafeError('Baserow changed during frozen window; no writes made');
    const saveErrors = () => atomicJson(resolve(STATE,'import-errors.json'),{project:PROJECT,mode:'delta',plan:plan!.approval,updated_at:new Date().toISOString(),errors:plan!.issues});
    await saveErrors(); target.apply = true;
    await applyPlan(target,plan,approval!,args.includes('--allow-deletes'),async()=>{
      const files = new FileCopier(target,manifest,m=>atomicJson(resolve(STATE,'import-manifest.json'),m));
      for (const [table] of TABLES) {
        if (!snapshot.fields.get(table)?.some(f=>f.type==='file')) continue;
        for (const row of snapshot.rows.get(table)!) if (!skipRackRow(table,row,snapshot,plan!.issues)) {
          const refs = await files.rowFiles(table,row,snapshot,schema,plan!.issues);
          const wanted = plan!.desired.get(table)!.find(r=>r.baserow_id===String(row.id))!;
          for (const [column,value] of Object.entries(refs)) if (stable(value)!==stable(wanted[column])) throw new SafeError('File metadata changed after review; refresh dry run');
        }
      }
      await saveErrors();
      if (files.counts.failed) throw new SafeError('Attachment copy failed; no database delta applied');
      log(`Files copied: ${files.counts.copied}; already present: ${files.counts.skipped+files.counts.recovered}`);
    });
    await target.verify(schema);
    await saveErrors();
    await atomicJson(resolve(STATE,'delta-report.json'),{...report,status:'DELTA COMMITTED',completed_at:new Date().toISOString(),supabase_after:await target.counts(schema)});
    log('Delta committed and verified. Run a fresh --dry-run --report; zero remaining differences is the cutover gate.');
  } catch (error) {
    const safe = error instanceof SafeError ? error.message : 'Delta stopped; details withheld to protect credentials';
    if (apply && lock) await atomicJson(resolve(STATE,'import-errors.json'),{project:PROJECT,mode:'delta',updated_at:new Date().toISOString(),errors:[...(plan?.issues||[]),{kind:'interrupted',table:'delta',code:safe,blocking:true}]});
    throw new SafeError(safe);
  } finally { await target.close(); if(lock) { await lock.close(); await unlink(resolve(STATE,'import.lock')); } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runDelta(process.argv.slice(2)).catch(error=>{console.error(error instanceof SafeError?error.message:'Delta stopped; details withheld');process.exitCode=1;});
