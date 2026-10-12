import 'server-only';
import { unstable_cache } from 'next/cache';
import { query, transaction, touched, invalidate } from './database';
import { registry, sourceTable, identifier as q, labels, fieldName, positiveId, DataError, DATA_TAG, DATA_VERSION, BUCKET } from './registry';
import type { Column } from './registry';

export type Row = Record<string, unknown>;
export interface Filter { field: string; type: 'equal' | 'not_equal' | 'contains' | 'higher_than' | 'lower_than' | 'link_row_has' | 'date_equal'; value: unknown }
export interface FetchOptions { page?: number; size?: number; search?: string; orderBy?: string; filters?: Record<string, unknown>; baserowFilters?: Filter[] }
export type SelectOption = { id: number; value: string; color: string };
export type TableSelectOptions = Record<string, SelectOption[]>;
export type TableSelectOptionsWithMeta = Record<string, { fieldId: number; options: SelectOption[] }>;
const hidden = new Set(['baserow_id', 'password_hash', 'pin']);
const blank = (v: unknown) => v == null || (typeof v === 'string' && !v.trim());
const relationLabel = (table: string) => table.endsWith('_options') ? 'value' : labels[table] || 'name';

// One SQL query per page: option/link hydration uses bounded indexed subqueries,
// not an HTTP request (or recursive full-table load) for each related record.
export function readProjection(table: string): string {
  const meta = sourceTable(table);
  const parts = ['r.*'];
  for (const c of meta.columns) {
    if (!c.target || (table === 'fields' && c.name === 'billing_entity_id')) continue;
    const target = registry.tables[c.target];
    const object = c.target.endsWith('_options')
      ? `jsonb_build_object('id', t.id, 'value', t.value, 'color', coalesce(t.color, 'gray'))`
      : `jsonb_build_array(jsonb_build_object('id', t.id, 'value', coalesce(t.${q(relationLabel(c.target))}::text, '')))`;
    parts.push(`(SELECT ${object} FROM public.${q(target.read)} t WHERE t.id = r.${q(c.name)}) AS ${q('__' + fieldName(table, c))}`);
  }
  for (const join of registry.joins.filter(j => j.source === table)) {
    const object = join.target.endsWith('_options')
      ? `jsonb_build_object('id', t.id, 'value', t.value, 'color', coalesce(t.color, 'gray'))`
      : `jsonb_build_object('id', t.id, 'value', coalesce(t.${q(relationLabel(join.target))}::text, ''))`;
    parts.push(`(SELECT coalesce(jsonb_agg(${object} ORDER BY j.position, t.id), '[]'::jsonb) FROM public.${q(join.name)} j JOIN public.${q(registry.tables[join.target].read)} t ON t.id = j.${q(join.right)} WHERE j.${q(join.left)} = r.id) AS ${q('__' + join.field)}`);
  }
  return parts.join(', ');
}
export function serialize(table: string, raw: Row, secrets = false): Row {
  const meta = sourceTable(table);
  const out: Row = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('__') || hidden.has(key) || key.endsWith('_id') && key !== 'logger_id' && key !== 'cropx_telemetry_id' && !['order_id', 'item_id'].includes(key)) continue;
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  for (const c of meta.columns) {
    if (c.target && !(table === 'fields' && c.name === 'billing_entity_id')) out[fieldName(table, c)] = raw['__' + fieldName(table, c)] ?? (c.target.endsWith('_options') ? null : []);
    if (c.type === 'date' && raw[c.name] != null) out[c.name] = raw[c.name] instanceof Date ? (raw[c.name] as Date).toISOString().slice(0, 10) : String(raw[c.name]).slice(0, 10);
    if (/^(integer|bigint|numeric)/.test(c.type) && !c.target && raw[c.name] != null && !hidden.has(c.name)) {
      const n = Number(raw[c.name]);
      if (!Number.isFinite(n) || c.type === 'bigint' && !Number.isSafeInteger(n)) throw new DataError('Record contains an unsafe numeric value', 500);
      out[c.name] = n;
    }
    if (c.type === 'jsonb') out[c.name] = (Array.isArray(raw[c.name]) ? raw[c.name] as Row[] : []).map((file, index) => ({
      name: file.name, size: file.size, mime_type: file.mime, is_image: String(file.mime).startsWith('image/'),
      url: `/api/files/${table}/${positiveId(raw.id)}/${c.name}/${index}`,
    }));
  }
  for (const join of registry.joins.filter(j => j.source === table)) out[join.field] = raw['__' + join.field] || [];
  if (table === 'notifications') out.changed_field = raw.field_name;
  if (table === 'users' && secrets) out.password_hash = raw.password_hash;
  if (table === 'installers') { out.pinSet = !!raw.pin; if (secrets) out.pin = raw.pin; }
  return out;
}
export function compileWhere(table: string, options: FetchOptions, start = 0) {
  const meta = sourceTable(table); const values: unknown[] = []; const conditions: string[] = [];
  const param = (v: unknown) => { values.push(v); return `$${values.length + start}`; };
  const filters = [...(options.baserowFilters || []), ...Object.entries(options.filters || {}).map(([field,value]) => ({field,type:'equal' as const,value}))];
  for (const f of filters) {
    const field = f.field.replace(/ /g, '_');
    const join = registry.joins.find(j => j.source === table && j.field === field);
    const c = meta.columns.find(c => fieldName(table, c) === field || c.name === field);
    if (join) {
      if (!['equal', 'link_row_has', 'not_equal'].includes(f.type)) throw new DataError('Unsupported relationship filter');
      conditions.push(`${f.type === 'not_equal' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM public.${q(join.name)} j WHERE j.${q(join.left)} = r.id AND j.${q(join.right)} = ${param(positiveId(f.value))})`);
      continue;
    }
    if (!c || hidden.has(c.name) || table === 'fields' && c.name === 'billing_entity_id') throw new DataError('Unknown filter field');
    const col = `r.${q(c.name)}`;
    if (f.type === 'contains') conditions.push(`${col}::text ILIKE ${param('%' + String(f.value).replace(/[\\%_]/g, '\\$&') + '%')}`);
    else {
      const op = {equal:'=',not_equal:'IS DISTINCT FROM',higher_than:'>',lower_than:'<',link_row_has:'=',date_equal:'='}[f.type];
      if (!op) throw new DataError('Unsupported filter');
      if (f.value == null) conditions.push(`${col} IS ${f.type === 'not_equal' ? 'NOT ' : ''}NULL`);
      else conditions.push(`${col} ${op} ${param(c.target ? positiveId(f.value) : f.value)}`);
    }
  }
  if (options.search) {
    const cols = meta.columns.filter(c => !c.target && !hidden.has(c.name) && c.type === 'text');
    const p = param('%' + options.search.replace(/[\\%_]/g, '\\$&') + '%');
    conditions.push('(' + (cols.map(c => `r.${q(c.name)} ILIKE ${p}`).join(' OR ') || 'FALSE') + ')');
  }
  return {sql: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '', values};
}
function order(table: string, value?: string) {
  const fields = (value || 'id').split(',');
  const valid = sourceTable(table).columns.map(c => c.name);
  return fields.map(field => {
    const descending = field.startsWith('-'); const name = field.replace(/^-/, '').replace(/ /g, '_');
    if (!valid.includes(name) || hidden.has(name)) throw new DataError('Unsupported sort field');
    return `r.${q(name)} ${descending ? 'DESC' : 'ASC'} NULLS LAST`;
  }).concat(fields.some(f => f.replace(/^-/, '') === 'id') ? [] : ['r.id ASC']).join(', ');
}
export async function getRows<T>(table: string, options: FetchOptions = {}): Promise<T[]> {
  const meta = sourceTable(table); const where = compileWhere(table, options);
  const size = Math.min(1000, Math.max(1, Number(options.size) || 500));
  const rows: T[] = [];
  for (let offset = 0; ; offset += size) {
    const batch = await query(`SELECT ${readProjection(table)} FROM public.${q(meta.read)} r${where.sql} ORDER BY ${order(table, options.orderBy)} LIMIT $${where.values.length+1} OFFSET $${where.values.length+2}`, [...where.values, size, offset]);
    rows.push(...batch.map(row => serialize(table, row) as T));
    if (batch.length < size) return rows;
  }
}
export async function getRow<T>(table: string, id: number, secrets = false): Promise<T> {
  const meta = sourceTable(table);
  const rows = await query(`SELECT ${readProjection(table)} FROM public.${q(meta.read)} r WHERE r.id = $1`, [positiveId(id)]);
  if (!rows[0]) throw new DataError('Record not found', 404);
  return serialize(table, rows[0], secrets) as T;
}
export function getCachedRows<T>(table: string, options?: FetchOptions, revalidateSeconds = 120): Promise<T[]> {
  if (table === 'users' || table === 'installers') return getRows<T>(table, options);
  return unstable_cache(() => getRows<T>(table, options), [DATA_VERSION,table,JSON.stringify(options || {})], {revalidate: revalidateSeconds, tags:[DATA_TAG,`${DATA_VERSION}-${table}`]})();
}
export const bustTableCache = (table: string) => invalidate([table]);
export const addSpaceVariants = (data: Row): Row => ({...data});

function scalar(value: unknown, c: Column): unknown {
  if (blank(value)) return c.type === 'jsonb' ? '[]' : null;
  if (c.type === 'text') {
    if (!['string','number','boolean'].includes(typeof value)) throw new DataError(`Invalid ${c.name}`);
    return String(value);
  }
  if (c.type === 'boolean') { if (typeof value !== 'boolean') throw new DataError(`Invalid ${c.name}`); return value; }
  if (c.type === 'date' || c.type === 'timestamptz') {
    const text = String(value); const day = text.slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(text)) || new Date(day).toISOString().slice(0,10) !== day) throw new DataError(`Invalid ${c.name}`);
    return c.type === 'date' ? day : text;
  }
  if (c.type === 'jsonb') {
    if (!Array.isArray(value)) throw new DataError('Files must be an array');
    const refs = value.map(file => {
      if (!file || file.bucket !== BUCKET || typeof file.path !== 'string' || !file.path || file.path.includes('..') || typeof file.name !== 'string' || typeof file.mime !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0) throw new DataError('Invalid private Storage reference');
      return {bucket:BUCKET,path:file.path,name:file.name,size:file.size,mime:file.mime};
    });
    return JSON.stringify(refs);
  }
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(String(value)) || !Number.isFinite(Number(value))) throw new DataError(`Invalid ${c.name}`);
  if (['integer','bigint'].includes(c.type) && !Number.isSafeInteger(Number(value))) throw new DataError(`Invalid ${c.name}`);
  return value;
}
async function relationId(target: string, value: unknown): Promise<number | null> {
  if (blank(value) || Array.isArray(value) && !value.length) return null;
  if (Array.isArray(value)) { if (value.length !== 1) throw new DataError('This link accepts one record'); value = value[0]; }
  if (typeof value === 'object' && value !== null) value = (value as Row).id ?? (value as Row).value;
  if (target.endsWith('_options') && typeof value === 'string') {
    const rows = await query(`SELECT id FROM public.${q(target)} WHERE value = $1`, [value]);
    if (rows[0]) return positiveId(rows[0].id);
    // Settings sends numeric IDs as numbers; strings are exact labels, even "2026".
    throw new DataError('Unknown dropdown value; add it in Settings first');
  }
  const id = positiveId(value);
  if (!(await query(`SELECT id FROM public.${q(target)} WHERE id = $1`, [id])).length) throw new DataError('Linked record was not found');
  return id;
}
export async function decodeWrite(table: string, data: Row) {
  const meta = sourceTable(table); const normalized: Row = {};
  for (const [key,value] of Object.entries(data)) {
    let name = key.replace(/ /g,'_');
    if (table === 'field_seasons' && name === 'notes') name = 'field_note';
    if (name === 'Solo?') name = 'solo'; if (name === 'Address') name = 'address';
    if (name in normalized && JSON.stringify(normalized[name]) !== JSON.stringify(value)) throw new DataError('Conflicting field aliases');
    normalized[name] = value;
  }
  const columns: Row = {}; const joins: {name:string; left:string; right:string; ids:number[]}[] = [];
  for (const [name, value] of Object.entries(normalized)) {
    const join = registry.joins.find(j => j.source === table && j.field === name);
    if (join) {
      const ids: number[] = [];
      for (const item of blank(value) ? [] : Array.isArray(value) ? value : [value]) {
        const id = await relationId(join.target, item); if (id && !ids.includes(id)) ids.push(id);
      }
      joins.push({...join,ids}); continue;
    }
    const c = meta.columns.find(c => fieldName(table,c) === name);
    if (!c || c.identity || c.name === 'baserow_id' || table === 'fields' && c.name === 'billing_entity_id') throw new DataError(`Field is not writable: ${name}`);
    columns[c.name] = c.target ? await relationId(c.target, value) : scalar(value,c);
  }
  return {columns, joins};
}
async function save<T>(table: string, id: number | null, data: Row): Promise<T> {
  return transaction(async () => {
    const {columns,joins} = await decodeWrite(table,data); const keys = Object.keys(columns); let rowId = id;
    if (id == null) {
      const sql = keys.length ? `(${keys.map(q).join(',')}) VALUES (${keys.map((_,i) => '$'+(i+1)).join(',')})` : 'DEFAULT VALUES';
      rowId = positiveId((await query(`INSERT INTO public.${q(table)} ${sql} RETURNING id`,Object.values(columns)))[0].id);
    } else {
      positiveId(id);
      if (keys.length) {
        const rows = await query(`UPDATE public.${q(table)} SET ${keys.map((key,i) => q(key)+' = $'+(i+1)).join(',')} WHERE id = $${keys.length+1} RETURNING id`, [...Object.values(columns),id]);
        if (!rows.length) throw new DataError('Record not found',404);
      } else await getRow(table,id);
    }
    touched(table);
    for (const join of joins) {
      await query(`DELETE FROM public.${q(join.name)} WHERE ${q(join.left)} = $1`,[rowId]);
      if (join.ids.length) await query(`INSERT INTO public.${q(join.name)} (${q(join.left)},${q(join.right)},position) SELECT $1, value, ordinality - 1 FROM unnest($2::bigint[]) WITH ORDINALITY AS ids(value,ordinality)`,[rowId,join.ids]);
      touched(join.name);
    }
    return getRow<T>(table,rowId!);
  });
}
export const createRow = <T>(table: string,data: Row): Promise<T> => save(table,null,data);
export const updateRow = <T>(table: string,id: number,data: Row): Promise<T> => save(table,positiveId(id),data);
export async function deleteRow(table: string,id: number) {
  sourceTable(table);
  return transaction(async () => {
    const deleted = await query(`DELETE FROM public.${q(table)} WHERE id = $1 RETURNING id`,[positiveId(id)]);
    if (!deleted.length) throw new DataError('Record not found',404);
    touched(table,...registry.joins.filter(j => j.source === table || j.target === table).map(j => j.name));
  });
}
export async function getTableFieldOptionsWithMeta(table: string): Promise<TableSelectOptionsWithMeta> {
  sourceTable(table); const result: TableSelectOptionsWithMeta = {};
  for (const catalog of registry.catalogs.filter(c => c.source === table)) {
    const rows = await query(`SELECT id,value,color FROM public.${q(catalog.name)} WHERE active = true ORDER BY sort_order,id`);
    result[catalog.field] = {fieldId:registry.catalogs.indexOf(catalog)+1, options:rows.map(r => ({id:positiveId(r.id),value:String(r.value),color:String(r.color||'gray')}))};
  }
  return result;
}
export async function getTableFieldOptions(table: string): Promise<TableSelectOptions> { return Object.fromEntries(Object.entries(await getTableFieldOptionsWithMeta(table)).map(([key,value]) => [key,value.options])); }
export async function getAllSelectOptions(tables: string[]): Promise<Record<string,TableSelectOptions>> { return Object.fromEntries(await Promise.all(tables.map(async t => [t,await getTableFieldOptions(t)]))); }
export async function getAllSelectOptionsWithMeta(tables: string[]): Promise<Record<string,TableSelectOptionsWithMeta>> { return Object.fromEntries(await Promise.all(tables.map(async t => [t,await getTableFieldOptionsWithMeta(t)]))); }
export function getCachedAllSelectOptions(tables: string[],seconds = 3600) { return unstable_cache(() => getAllSelectOptions(tables), [DATA_VERSION,'options',...tables],{revalidate:seconds,tags:[DATA_TAG,`${DATA_VERSION}-options`]})(); }
export async function saveSelectOptions(fieldId: number, options: SelectOption[]) {
  const catalog = registry.catalogs[positiveId(fieldId)-1];
  if (!catalog || !Array.isArray(options)) throw new DataError('Unknown dropdown');
  return transaction(async () => {
    const existing = await query(`SELECT id,value FROM public.${q(catalog.name)}`);
    const seen = new Set<string>(); const ids: number[] = [];
    for (const [index, option] of options.entries()) {
      if (typeof option.value !== 'string' || !option.value.trim() || seen.has(option.value)) throw new DataError('Dropdown values must be unique and nonblank');
      seen.add(option.value);
      let id = option.id ? positiveId(option.id) : Number(existing.find(e => e.value === option.value)?.id) || null;
      if (id && !existing.some(e => Number(e.id) === id)) throw new DataError('Option belongs to a different dropdown');
      if (id) await query(`UPDATE public.${q(catalog.name)} SET value=$1,color=$2,sort_order=$3,active=true WHERE id=$4`,[option.value,option.color || 'gray',index,id]);
      else id = positiveId((await query(`INSERT INTO public.${q(catalog.name)} (value,color,sort_order) VALUES ($1,$2,$3) RETURNING id`,[option.value,option.color || 'gray',index]))[0].id);
      ids.push(id);
    }
    // Removed choices are retired, never cleared out of existing records.
    await query(`UPDATE public.${q(catalog.name)} SET active=false WHERE NOT(id = ANY($1::bigint[]))`,[ids]);
    touched(catalog.name);
    return {select_options:(await getTableFieldOptionsWithMeta(catalog.source))[catalog.field].options};
  });
}
