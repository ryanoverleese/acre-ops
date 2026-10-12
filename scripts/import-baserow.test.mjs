import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BaserowReader, Destination, FileCopier, TABLES, JOINS, PROJECT, DATABASE, BUCKET,
  parseSchema, scalar, preflight, convertRow, joinRows, optionRows, fingerprint,
  checkFileUrl, fileIdentity, digest, request, BILLING_MIGRATION, skipRackRow, databaseConfig,
} from './import-baserow.ts';

const sql = await readFile(new URL('../supabase/migrations/001_init.sql', import.meta.url), 'utf8');
const billingSql = await readFile(new URL(`../supabase/migrations/${BILLING_MIGRATION}`, import.meta.url), 'utf8');
const schema = parseSchema(sql, billingSql);
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const dbUrl = `postgresql://postgres:fixture@db.${PROJECT}.supabase.co:5432/postgres`;
function fakePg(handler = () => []) {
  const calls = [];
  return { calls, on() {}, async connect() { calls.push(['CONNECT']); }, async end() { calls.push(['END']); }, async query(sql, values) { calls.push([sql, values]); return { rows: await handler(sql, values) }; } };
}
function readyTarget(apply = true, handler, fetcher = async () => reply([])) {
  const client = fakePg(handler), d = new Destination(dbUrl, 'sb_secret_fixture', apply, fetcher, client);
  d.verified = true; d.connected = true; d.storageVerified = true;
  return { d, client };
}
function schemaReply(sql) {
  if (sql.includes('c.relrowsecurity')) return [...schema.tables.keys()].map(name => ({name, rls:true}));
  if (sql.includes('information_schema.columns')) {
    const udt={bigint:'int8',integer:'int4',text:'text',boolean:'bool',jsonb:'jsonb',date:'date',timestamptz:'timestamptz',numeric:'numeric'};
    return [...schema.tables].flatMap(([table,cols])=>cols.map(c=>({table_name:table,column_name:c.name,udt_name:udt[c.type.replace(/\(.*/, '')],is_nullable:c.required?'NO':'YES',is_identity:c.identity?'YES':'NO'})));
  }
  return [];
}
function fixture() {
  let id = 100;
  const s = { fields: new Map(), rows: new Map() };
  for (const [table] of TABLES) {
    const fields = schema.tables.get(table).filter(c => !['id', 'baserow_id'].includes(c.name)).map(c => ({
      id: ++id, name: c.target && c.name.endsWith('_id') ? c.name.slice(0, -3) : c.name,
      type: c.target ? c.target.endsWith('_options') ? 'single_select' : 'link_row' : c.type === 'jsonb' ? 'file' : 'text',
      ...(c.target && !c.target.endsWith('_options') ? { link_row_table_id: TABLES.find(([t]) => t === c.target)[1] } : {}),
      ...(c.target?.endsWith('_options') ? { select_options: [{ id: id * 10, value: `Option ${id}`, color: 'blue' }] } : {}),
    }));
    s.fields.set(table, fields); s.rows.set(table, []);
  }
  for (const join of JOINS) if (!s.fields.get(join.source).some(f => f.name === join.field)) s.fields.get(join.source).push({ id: ++id, name: join.field, type: join.target.endsWith('_options') ? 'multiple_select' : 'link_row', ...(join.target.endsWith('_options') ? { select_options: [{ id: 10001, value: 'Farmer' }] } : { link_row_table_id: TABLES.find(([t]) => t === join.target)[1] }) });
  return s;
}
function row(s, table, id, values) {
  const out = { id };
  for (const [name, value] of Object.entries(values)) out[`field_${s.fields.get(table).find(f => f.name === name).id}`] = value;
  s.rows.get(table).push(out); return out;
}

test('pinned schema covers 22 sources, 35 catalogs, eight joins and 60 identities', () => {
  assert.equal(schema.tables.size, 65); assert.equal(schema.catalogs.length, 35); assert.equal(JOINS.length, 8);
  assert.equal([...schema.tables.values()].flat().filter(c => c.identity).length, 60);
  assert.throws(() => parseSchema(sql + '\n', billingSql), /reviewed commit/);
});
test('blank text/serials become NULL; false and zero remain; decimal strings remain exact', () => {
  const text = { name: 'serial_number', type: 'text' };
  assert.equal(scalar('  ', text), null); assert.equal(scalar(0, text), '0'); assert.equal(scalar('00123', text), '00123');
  assert.equal(scalar('  notes  ', text), '  notes  '); assert.equal(scalar(false, { type: 'boolean' }), false);
  assert.equal(scalar('0', { type: 'numeric(14,2)', name: 'amount' }), '0');
  assert.equal(scalar('9007199254740993', { type: 'bigint', name: 'record_name' }), '9007199254740993');
  assert.throws(() => scalar('1.001', { type: 'numeric(14,2)', name: 'amount' }), /precision/);
  assert.throws(() => scalar('2026-02-30', { type: 'date' }), /date/);
});
test('missing FK logs error but preserves entire source row; multiple scalar links block', () => {
  const s = fixture(); row(s, 'fields', 1, { name: 'Test field', billing_entity: [{ id: 99 }] });
  let c = preflight(s, schema); assert.equal(c.issues.length, 1); assert.equal(c.issues[0].blocking, false);
  let converted = convertRow('fields', s.rows.get('fields')[0], s, schema, c.walk, []);
  assert.equal(converted.name, 'Test field'); assert.equal(converted.baserow_id, '1'); assert.equal(converted.billing_entity_id, null);
  row(s, 'probe_rack', 1, { rack: 'A', rack_slot: 1, probe: [{ id: 99 }, { id: 100 }] });
  c = preflight(s, schema); assert(c.issues.some(i => i.blocking));
});
test('source IDs resolve through destination crosswalk, not directly into FKs', () => {
  const s = fixture(); row(s, 'billing_entities', 4, { name: 'Grower' });
  const r = row(s, 'invoices', 7, { billing_entity: [{ id: 4 }] });
  const c = preflight(s, schema); c.walk.get('billing_entities').set('4', '900');
  assert.equal(convertRow('invoices', r, s, schema, c.walk, []).billing_entity_id, '900');
});
test('EVERY field billing link uses the join; no arbitrary primary or duplicate storage', () => {
  const s = fixture(); row(s, 'billing_entities', 4, { name: 'A' }); row(s, 'billing_entities', 5, { name: 'B' });
  const single = row(s, 'fields', 7, { name: 'Single', billing_entity: [{ id: 4 }] });
  const multi = row(s, 'fields', 8, { name: 'Multiple', billing_entity: [{ id: 4 }, { id: 5 }] });
  const c = preflight(s, schema); assert.equal(c.issues.length, 0);
  c.walk.get('billing_entities').set('4', '900'); c.walk.get('billing_entities').set('5', '901');
  assert.equal(convertRow('fields', single, s, schema, c.walk, []).billing_entity_id, null);
  assert.equal(convertRow('fields', multi, s, schema, c.walk, []).billing_entity_id, null);
  const rows = joinRows(s, c.walk, [], JOINS.find(j => j.name === 'field_billing_entities'));
  assert.deepEqual(rows, [{field_id:'7',billing_entity_id:'900',position:0},{field_id:'8',billing_entity_id:'900',position:0},{field_id:'8',billing_entity_id:'901',position:1}]);
});
test('dropdowns link by value; report_type labels remain unmerged', () => {
  const s = fixture(); const status = s.fields.get('probes').find(f => f.name === 'status');
  const r = row(s, 'probes', 1, { status: { id: 999999, value: status.select_options[0].value } });
  const c = preflight(s, schema); c.walk.get('probe_status_options').set(status.select_options[0].value, '8100');
  assert.equal(convertRow('probes', r, s, schema, c.walk, []).status_id, '8100');
  for (const [id, value] of ['full', 'full_report', 'water_day_update', 'update'].entries()) {
    const r = row(s, 'water_recs', id + 1, { record_name: id + 30, report_type: { id: 3, value } });
    assert.equal(convertRow('water_recs', r, s, schema, c.walk, []).report_type, value);
  }
});
test('duplicate nonblank serials and required blank names block before writes', () => {
  const s = fixture(); row(s, 'probes', 1, { serial_number: '123' }); row(s, 'probes', 2, { serial_number: '123' });
  row(s, 'contacts', 1, { name: '   ' });
  const errors = preflight(s, schema).issues;
  assert(errors.some(e => e.kind === 'duplicate')); assert(errors.some(e => e.table === 'contacts' && e.blocking));
});
test('blank rack locations skip only that Baserow row and remain in the error report', () => {
  const s = fixture();
  row(s, 'probe_rack', 10, {rack:' ',rack_slot:1});
  row(s, 'probe_rack', 11, {rack:'A',rack_slot:null});
  row(s, 'probe_rack', 12, {rack:'B',rack_slot:''});
  row(s, 'probe_rack', 13, {rack:'C',rack_slot:0});
  row(s, 'probe_rack', 14, {rack:'D',rack_slot:6});
  const c = preflight(s, schema);
  assert.equal(c.expected.probe_rack, 2);
  assert.deepEqual(c.issues.map(i=>i.row), ['10','11','12']);
  assert(c.issues.every(i=>i.kind==='skipped_row' && !i.blocking));
  const eligible=s.rows.get('probe_rack').filter(r=>!skipRackRow('probe_rack',r,s,c.issues));
  assert.deepEqual(eligible.map(r=>r.id),[13,14]);
  assert.equal(c.issues.length,3); // Reruns do not duplicate the error entries.
  assert.equal(c.walk.get('probe_rack').has('10'),false);
});
test('joins preserve position, deduplicate edges, and report missing targets', () => {
  const s = fixture(); row(s, 'contacts', 1, { name: 'A' }); row(s, 'contacts', 2, { name: 'B' });
  row(s, 'probes', 8, { contact: [{ id: 2 }, { id: 1 }, { id: 1 }, { id: 99 }] });
  const c = preflight(s, schema); c.walk.get('probes').set('8', '808'); c.walk.get('contacts').set('2', '202');
  const rows = joinRows(s, c.walk, [], JOINS.find(j => j.name === 'probe_contacts'));
  assert.deepEqual(rows, [{ probe_id: '808', contact_id: '202', position: 0 }, { probe_id: '808', contact_id: '1', position: 1 }]);
  assert.equal(c.expected.probe_contacts, 2); assert(c.issues.some(i => i.target_id === '99'));
});
test('unknown fields, wrong link targets, duplicate dropdown labels are rejected', () => {
  let s = fixture(); s.fields.get('fields').push({ id: 999999, name: 'new_data', type: 'text' });
  assert.throws(() => preflight(s, schema), /unmapped source/);
  s = fixture(); s.fields.get('fields').find(f => f.name === 'billing_entity').link_row_table_id = 123;
  assert.throws(() => preflight(s, schema), /target changed/);
  s = fixture(); const catalog = schema.catalogs[0], field = s.fields.get(catalog.source).find(f => f.name === catalog.field);
  field.select_options.push({ ...field.select_options[0], id: 99 });
  assert.throws(() => optionRows(s, catalog), /duplicate dropdown/);
});
test('Baserow paginates 401 rows, uses GET only and ignores response next URL', async () => {
  const calls = [];
  const reader = new BaserowReader('fake-token', async (raw, init) => {
    const u = new URL(raw); calls.push({ u, init });
    if (u.pathname.includes('/fields/')) return reply([]);
    const table = Number(u.pathname.split('/').at(-2)), page = Number(u.searchParams.get('page'));
    const total = table === 817302 ? 401 : 0;
    return reply({ count: total, next: page * 200 < total ? 'https://not-baserow.invalid/steal' : null, results: Array.from({ length: Math.max(0, Math.min(200, total - (page - 1) * 200)) }, (_, i) => ({ id: (page - 1) * 200 + i + 1 })) });
  });
  const s = await reader.collect(() => {}); assert.equal(s.rows.get('water_recs').length, 401);
  assert(calls.every(c => c.init.method === 'GET' && c.u.hostname === 'api.baserow.io'));
  await assert.rejects(reader.get(1035630, 'rows'), /outside/);
});
test('incomplete or duplicate source pages fail rather than claiming completion', async () => {
  const reader = new BaserowReader('fake', async raw => String(raw).includes('/fields/') ? reply([]) : reply({ count: 3, next: null, results: [{ id: 1 }] }));
  await assert.rejects(reader.collect(() => {}), /INCOMPLETE/);
});
test('destination cannot write in dry run or before identity verification', async () => {
  let requests = 0; const d = new Destination(dbUrl, 'sb_secret_fake', false, async () => { requests++; return reply([]); });
  await assert.rejects(d.query('select 1'), /guard/); d.verified = true;
  await assert.rejects(d.query('insert', [], true), /guard/);
  await assert.rejects(d.storage('/bucket', { method: 'POST' }, true), /guard/);
  assert.equal(requests, 0);
});
test('wrong project is rejected before any query or Storage operation', async () => {
  const calls = []; const d = new Destination(dbUrl.replace(PROJECT,'otherproject'), 'sb_secret_fake', true, async () => { calls.push('HTTP'); return reply([]); });
  await assert.rejects(d.verify(schema), /acre-ops/); assert.deepEqual(calls, []);
});
test('upsert is parameterized, batches are keyed by baserow_id and joins by endpoints', async () => {
  let body; const {d} = readyTarget(true, (query,parameters) => { if(query.startsWith('INSERT'))body={query,parameters};return [{id:'8',baserow_id:'4'}]; });
  const dangerous = "'); DROP TABLE fields; --";
  await d.tableTransaction('operations',schema,()=>d.upsert('operations', [{ baserow_id: '4', name: dangerous }], schema));
  assert(!body.query.includes(dangerous)); assert(body.parameters[0].includes(dangerous)); assert.match(body.query, /ON CONFLICT \("baserow_id"\)/);
  await d.tableTransaction('probe_contacts',schema,()=>d.upsert('probe_contacts', [{ probe_id: '1', contact_id: '2', position: 0 }], schema, ['probe_id', 'contact_id']));
  assert.match(body.query, /ON CONFLICT \("probe_id","contact_id"\)/);
});
test('file destinations are stable, unsafe URLs rejected, fingerprints ignore URL expiry', () => {
  const file = { name: 'immutable-id', original_name: '../../name.jpg', size: 3, url: 'https://files.baserow.io/a?token=abc' };
  const a = fileIdentity('documents', { id: 1 }, { id: 2 }, file);
  const b = fileIdentity('documents', { id: 1 }, { id: 2 }, { ...file, url: 'https://files.baserow.io/a?token=def' });
  assert.equal(a.path, b.path); assert(!a.path.includes('..')); assert.equal(a.name, '../../name.jpg');
  assert.throws(() => checkFileUrl('https://api.baserow.io.evil.invalid/a'), /allowlist/);
  assert.throws(() => checkFileUrl('http://127.0.0.1/a'), /allowlist/);
  assert.equal(checkFileUrl('https://baserow-backend-production20240528124524339000000001.s3.amazonaws.com/file').protocol, 'https:');
  assert.throws(() => checkFileUrl('https://unrelated.s3.amazonaws.com/file'), /allowlist/);
  const s = fixture(); const r = row(s, 'documents', 1, { file: [file] }); const hash = fingerprint(s);
  r[`field_${s.fields.get('documents').find(f => f.name === 'file').id}`][0].url += 'changed';
  assert.equal(fingerprint(s), hash);
});
test('file dry run never uploads or saves a manifest; actual bytes are checked', async () => {
  let saved = 0; const bytes = Buffer.from('abc');
  const copier = new FileCopier(undefined, { version: 1, project: PROJECT, database: DATABASE, files: {} }, async () => { saved++; }, async (u, init) => { assert.equal(init.method, 'GET'); assert.equal(init.headers, undefined); return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } }); });
  const ref = await copier.copy('documents', { id: 1 }, { id: 2 }, { name: 'stable', size: 3, url: 'https://files.baserow.io/file' });
  assert.equal(ref.size, 3); assert.equal(ref.bucket, BUCKET); assert.equal(saved, 0); assert.equal(copier.counts.copied, 0);
});
test('file rerun uses manifest; lost manifest recovers upload without duplicates', async () => {
  const bytes = Buffer.from('abc'), objects = new Map(); let uploads = 0, saves = 0, downloads = 0;
  const target = { apply: true, objectBytes: async p => objects.get(p) ?? null, upload: async (r, b) => { uploads++; objects.set(r.path, b); } };
  const manifest = { version: 1, project: PROJECT, database: DATABASE, files: {} };
  const fetcher = async () => { downloads++; return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } }); };
  const file = { name: 'stable', size: 3, url: 'https://files.baserow.io/file' };
  let copier = new FileCopier(target, manifest, async () => { saves++; }, fetcher);
  await copier.copy('documents', { id: 1 }, { id: 2 }, file); assert.equal(uploads, 1); assert.equal(saves, 1);
  copier = new FileCopier(target, manifest, async () => { saves++; }, fetcher);
  await copier.copy('documents', { id: 1 }, { id: 2 }, file); assert.equal(copier.counts.skipped, 1); assert.equal(downloads, 1); assert.equal(uploads, 1);
  copier = new FileCopier(target, { ...manifest, files: {} }, async () => {}, fetcher);
  await copier.copy('documents', { id: 1 }, { id: 2 }, file); assert.equal(copier.counts.recovered, 1); assert.equal(uploads, 1);
});
test('failed files log errors and leave remaining row fields intact', async () => {
  const s = fixture(), r = row(s, 'documents', 2, { name: 'Doc', file: [{ name: 'bad', url: 'https://invalid.local/private' }] });
  const issues = []; const copier = new FileCopier(undefined, { version: 1, project: PROJECT, database: DATABASE, files: {} }, async () => { throw Error('must not write'); });
  const converted = convertRow('documents', r, s, schema, new Map(), issues);
  Object.assign(converted, await copier.rowFiles('documents', r, s, schema, issues));
  assert.equal(converted.name, 'Doc'); assert.deepEqual(converted.file, []); assert.equal(copier.counts.failed, 1); assert.equal(issues[0].blocking, false);
});
test('HTTP error bodies containing credentials are not exposed', async () => {
  await assert.rejects(request(async () => reply({ error: 'SECRET-PASSWORD-123' }, 403), 'https://example.invalid', { method: 'GET' }, 'Example'), error => error.message === 'Example: HTTP 403' && !error.stack.includes('SECRET-PASSWORD'));
});
test('counter adjustment advances all 60 identities without rewinding', async () => {
  const d = new Destination(dbUrl, 'sb_secret_fake', true); let sql='', total=0;
  d.query = async query => { sql += query; return []; };
  for(const table of schema.tables.keys()){d.activeTable=table;total+=await d.advanceCounters(schema,table);}
  assert.equal(total, 60);
  assert.match(sql, /GREATEST\(COALESCE\(highest,1\),previous\)/);
  assert.match(sql, /'public\.water_recs','record_name'/); assert.match(sql, /'public\.orders','order_id'/); assert.match(sql, /'public\.order_items','item_id'/);
});

test('Postgres routing is pinned; TLS cannot be disabled or overridden', () => {
  assert.equal(databaseConfig(dbUrl).ssl.rejectUnauthorized,true);
  assert.equal(databaseConfig(dbUrl+'?sslmode=require').ssl.rejectUnauthorized,true);
  assert.equal(databaseConfig(`postgres://postgres.${PROJECT}:fixture@aws-0-us-east-1.pooler.supabase.com:5432/postgres`).port,5432);
  for(const raw of [dbUrl.replace(PROJECT,'reminders'),dbUrl.replace(':5432',':6543'),dbUrl+'?sslmode=disable',dbUrl+'?host=evil.invalid',dbUrl.replace('/postgres','/other'), 'bad-secret-url']) assert.throws(()=>databaseConfig(raw));
});
for(const key of ['sb_secret_fixture', 'eyJnotDecoded.payload.signature']) test(`Storage authenticates ${key.startsWith('sb_')?'opaque key':'legacy JWT'} at fixed project without decoding claims`,async()=>{
  const calls=[],client=fakePg(schemaReply);
  const d=new Destination(dbUrl,key,false,async(u,init)=>{calls.push(u);assert.equal(init.method,'GET');assert.equal(init.headers.apikey,key);assert.equal(init.headers.Authorization,key.startsWith('eyJ')?`Bearer ${key}`:undefined);return reply([]);},client);
  await d.verify(schema);assert.equal(d.verified,true);assert(calls.every(u=>u===`https://${PROJECT}.supabase.co/storage/v1/bucket`));assert(client.calls.some(([s])=>s==='SET default_transaction_read_only = on'));await d.close();assert.equal(d.connected,false);
});
test('rejected Storage credentials stop before opening Postgres',async()=>{
  const client=fakePg(),d=new Destination(dbUrl,'sb_secret_wrong',false,async()=>reply({secret:'do not print'},401),client);
  await assert.rejects(d.verify(schema),/HTTP 401/);assert.equal(client.calls.length,0);assert.equal(d.verified,false);
});
test('dry queries run inside server-enforced READ ONLY; writes and write transactions fail',async()=>{
  const {d,client}=readyTarget(false);
  await d.query('SELECT 1');assert.deepEqual(client.calls.map(c=>c[0]),['BEGIN READ ONLY','SELECT 1','COMMIT']);
  await assert.rejects(d.query('INSERT',[],true),/guard/);await assert.rejects(d.tableTransaction('operations',schema,async()=>{}),/guard/);
  await assert.rejects(d.storage('/bucket',{method:'POST'},false),/guard/);
});
test('all batches for one table share one commit; another table gets a separate transaction',async()=>{
  const {d,client}=readyTarget();
  for(const table of ['operations','contacts']) await d.tableTransaction(table,schema,async()=>{
    for(const id of ['1','2']) await d.upsert(table,[{baserow_id:id,name:'fixture'}],schema);
    await d.advanceCounters(schema,table);
  });
  assert.equal(client.calls.filter(([s])=>s==='BEGIN READ WRITE').length,2);assert.equal(client.calls.filter(([s])=>s==='COMMIT').length,2);assert.equal(client.calls.filter(([s])=>s.startsWith('INSERT')).length,4);
});
test('later batch failure rolls back the whole table, redacts errors and permits a safe retry',async()=>{
  let inserts=0;const {d,client}=readyTarget(true,s=>{if(s.startsWith('INSERT')&&++inserts===2)throw Error('PRIVATE-PASSWORD-ROW-DATA');return [];});
  await assert.rejects(d.tableTransaction('operations',schema,async()=>{for(const id of ['1','2'])await d.upsert('operations',[{baserow_id:id,name:'fixture'}],schema);}),e=>e.message==='Postgres query failed (details withheld)'&&!e.stack.includes('PRIVATE'));
  assert.equal(client.calls.at(-1)[0],'ROLLBACK');assert(!client.calls.some(([s])=>s==='COMMIT'));assert.equal(d.activeTable,undefined);
  await d.tableTransaction('operations',schema,()=>d.upsert('operations',[{baserow_id:'1',name:'fixture'}],schema));assert.equal(client.calls.at(-1)[0],'COMMIT');
});
test('table transaction rejects cross-table upserts and nested transactions',async()=>{
  const {d}=readyTarget();
  await d.tableTransaction('operations',schema,async()=>{
    await assert.rejects(d.upsert('contacts',[{baserow_id:'1',name:'fixture'}],schema),/own table/);
    await assert.rejects(d.tableTransaction('contacts',schema,async()=>{}),/guard/);
  });
});
test('connection tries primary first; alternate is only used when primary fails',async()=>{
  const alt=`postgres://postgres.${PROJECT}:fixture@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
  for(const failFirst of [false,true]){const client=fakePg();let attempts=0;client.connect=async()=>{attempts++;if(failFirst&&attempts===1)throw Error('PRIVATE-CONNECTION-URL');};const d=new Destination(dbUrl,'sb_secret_fixture',false,async()=>reply([]),client,alt);await d.connect();assert.equal(attempts,failFirst?2:1);assert.equal(d.connectionUsed,failFirst?'DATABASE_URL_ALT':'DATABASE_URL');await d.close();}
});
test('count reconciliation matches inventory detail, not its incorrect headline',async()=>{
  const inventory=await readFile(new URL('../supabase/baserow-inventory.md',import.meta.url),'utf8');
  const rows=[...inventory.matchAll(/^### (\w+) \(Baserow (\d+)\) — (\d+) rows/gm)];
  assert.equal(rows.length,23);assert.equal(rows.reduce((n,r)=>n+Number(r[3]),0),19720);assert.equal(rows.filter(r=>r[1]!=='journal').reduce((n,r)=>n+Number(r[3]),0),19715);
});
