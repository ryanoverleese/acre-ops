import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import { Destination, PROJECT, FileCopier, TABLES, JOINS, DATABASE, loadCurrentSchema } from './import-baserow.ts';
import { normalized, compareTable, protectDestination, checkFinalLinks, dataFingerprint, readDestination, applyPlan, assertApproved, runDelta, makePlan } from './delta-baserow.ts';

const col=(name,type='text',target)=>({name,type,required:false,identity:false,...(target?{target}:{})});
const schema={tables:new Map([
  ['billing_entities',[col('id','bigint'),col('baserow_id','bigint'),col('name')]],
  ['fields',[col('id','bigint'),col('baserow_id','bigint'),col('name'),col('acreage','numeric(14,2)'),col('photo','jsonb')]],
  ['field_billing_entities',[col('baserow_id','bigint'),col('field_id','bigint','fields'),col('billing_entity_id','bigint','billing_entities'),col('position','integer')]],
]),catalogs:[]};
test('decimals, zero signs, timestamps and JSON key order compare canonically',()=>{
  assert.equal(normalized('0002.000','numeric'),'2');assert.equal(normalized('-0.000','numeric'),'0');
  assert.equal(normalized('9007199254740993','bigint'),'9007199254740993');
  assert.equal(normalized('2026-10-12 12:00:00+00','timestamptz'),normalized('2026-10-12T12:00:00.000Z','timestamptz'));
  assert.equal(normalized({b:2,a:1},'jsonb'),normalized({a:1,b:2},'jsonb'));
});
test('new / changed / deleted rows use the crosswalk; native and skipped rows survive',()=>{
  const before=[{id:'101',baserow_id:'1',name:'A',acreage:'2.00'},{id:'102',baserow_id:'2',name:'old'},{id:'103',baserow_id:'3',name:'delete'},{id:'104',baserow_id:'4',name:'skip'},{id:'105',baserow_id:null,name:'native'}];
  const d=compareTable('fields',[{baserow_id:'1',name:'A',acreage:'2'},{baserow_id:'2',name:'new'},{baserow_id:'6',name:'add'}],before,schema,4,undefined,new Set(['4']));
  assert.deepEqual(d.added.map(x=>x.key),['6']);assert.deepEqual(d.changed.map(x=>x.key),['2']);assert.deepEqual(d.deleted.map(x=>x.key),['3']);assert.equal(d.native,1);
});
test('PIN comparison preserves existing bcrypt, validates new formats and never logs PINs',async()=>{
  const pin='001234', hash=await bcrypt.hash(pin,4), wanted={baserow_id:'7',pin},preserved={},issues=[];
  await protectDestination('installers',wanted,{pin:hash},preserved,issues);
  assert.equal(wanted.pin,hash);assert.equal(preserved['installers.hashed_pin'],1);assert.deepEqual(issues,[]);
  await protectDestination('installers',{baserow_id:'9',pin:'secret-invalid'},undefined,preserved,issues);
  assert(issues[0].blocking);assert(!JSON.stringify(issues).includes('secret-invalid'));
});
test('newer destination login and billing basis are preserved; incompatible billing edits block',async()=>{
  const issues=[],preserved={}, user={last_login:'2026-10-11T00:00:00Z'};
  await protectDestination('users',user,{last_login:'2026-10-12T00:00:00Z'},preserved,issues);
  assert.equal(user.last_login,'2026-10-12T00:00:00Z');
  const wanted={baserow_id:'3',rate:'50',quantity:'2',field_unit_rate:'99',field_quantity:'20'};
  await protectDestination('invoice_lines',wanted,{rate:'25',quantity:'2',field_unit_rate:'50'},preserved,issues);
  assert(!Object.hasOwn(wanted,'field_unit_rate'));assert(!Object.hasOwn(wanted,'field_quantity'));assert(issues[0].blocking);
});
test('native retained links block parent deletion, including cascading join links',()=>{
  const before=new Map([['billing_entities',[{id:'1',baserow_id:'10',name:'B'}]],['fields',[{id:'2',baserow_id:null,name:'native'}]],['field_billing_entities',[{field_id:'2',billing_entity_id:'1',position:0}]]]);
  const delta=compareTable('billing_entities',[],before.get('billing_entities'),schema);
  const issues=[];checkFinalLinks(schema,before,[delta],issues);
  assert.equal(issues.length,1);assert.equal(issues[0].code,'deletion_or_link_would_break_retained_row');
});
test('apply rejects stale approvals, unresolved errors, and unapproved deletions before work',()=>{
  const plan={approval:'abc',issues:[],tables:[{deleted:[{}]}]};
  assert.throws(()=>assertApproved(plan,'other',true),/changed/);
  assert.throws(()=>assertApproved(plan,'abc',false),/allow-deletes/);
  assertApproved(plan,'abc',true);
  assert.throws(()=>assertApproved({...plan,issues:[{blocking:true}]},'abc',true),/blocked/);
});
test('dry-run cannot reach apply even with a matching approval',async()=>{
  await assert.rejects(applyPlan({apply:false},{approval:'a',issues:[],tables:[]},'a',false,async()=>assert.fail('file write')),/write guard/);
  await assert.rejects(runDelta(['--apply'],{}),/Invalid arguments/);
});

async function fixture() {
  const db=new PGlite();
  await db.exec(`CREATE TABLE billing_entities(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,baserow_id bigint UNIQUE,name text NOT NULL);
  CREATE TABLE fields(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,baserow_id bigint UNIQUE,name text NOT NULL,acreage numeric(14,2),photo jsonb DEFAULT '[]');
  CREATE TABLE field_billing_entities(baserow_id bigint UNIQUE,field_id bigint REFERENCES fields ON DELETE CASCADE,billing_entity_id bigint REFERENCES billing_entities ON DELETE CASCADE,position integer,PRIMARY KEY(field_id,billing_entity_id));
  INSERT INTO billing_entities(baserow_id,name) VALUES(10,'original');
  INSERT INTO fields(baserow_id,name,acreage) VALUES(20,'untouched',2),(21,'old',3),(22,'delete',4),(NULL,'native',5);
  INSERT INTO field_billing_entities(field_id,billing_entity_id,position) VALUES(3,1,0);`);
  const calls=[];
  const client={on(){},async connect(){},async end(){},async query(sql,values){calls.push(sql);if(sql.includes('pg_advisory_xact_lock')||sql.startsWith('LOCK TABLE'))return {rows:[]};return db.query(sql,values);}};
  const d=new Destination(`postgresql://postgres:fixture@db.${PROJECT}.supabase.co:5432/postgres`,'sb_secret_fixture',true,async()=>{throw new Error('No external HTTP');},client);
  d.verified=true;d.connected=true;
  return {db,d,calls};
}
async function planFor(d) {
  const before=await readDestination(d,schema);
  const desired=new Map([
    ['billing_entities',[{baserow_id:'10',name:'original'},{baserow_id:'11',name:'new entity'}]],
    ['fields',[{baserow_id:'20',name:'untouched',acreage:'2'},{baserow_id:'21',name:'changed',acreage:'3',photo:[{name:'x'}]},{baserow_id:'23',name:'new field',acreage:'6',photo:[]}]],
    ['field_billing_entities',[{field_id:'new:fields:23',billing_entity_id:'new:billing_entities:11',position:0}]],
  ]);
  const tables=[...desired].map(([t,rows])=>compareTable(t,rows,before.get(t),schema,rows.length,t==='field_billing_entities'?()=>true:undefined));
  const issues=[];checkFinalLinks(schema,before,tables,issues);assert.deepEqual(issues,[]);
  return {before,desired,tables,schema,issues,approval:'approved',destinationFingerprint:dataFingerprint(before)};
}
test('isolated Postgres apply changes only deltas, remaps new IDs, removes old edges, keeps native rows, and is repeatable',async()=>{
  const {db,d,calls}=await fixture();try{
    const p=await planFor(d);await applyPlan(d,p,'approved',true,async()=>{});
    const after=await readDestination(d,schema);
    assert.equal(after.get('fields').length,4);assert(after.get('fields').some(r=>r.baserow_id===null));
    assert.equal(after.get('fields').find(r=>r.baserow_id==='21').name,'changed');
    const field=after.get('fields').find(r=>r.baserow_id==='23'), entity=after.get('billing_entities').find(r=>r.baserow_id==='11');
    assert.deepEqual(after.get('field_billing_entities').map(r=>[r.field_id,r.billing_entity_id]),[[field.id,entity.id]]);
    assert.equal(calls.filter(sql=>sql.startsWith('UPDATE public."fields"')).length,1);
    const repeat={...p,before:after,destinationFingerprint:dataFingerprint(after),tables:p.tables.map(t=>({...t,added:[],changed:[],deleted:[],destination:after.get(t.table).length}))};
    const start=calls.length;await applyPlan(d,repeat,'approved',false,async()=>{});
    assert(!calls.slice(start).some(sql=>/^(INSERT|UPDATE|DELETE)/.test(sql)));
  } finally{await db.close();}
});
test('concurrent destination change aborts before database writes',async()=>{
  const {db,d}=await fixture();try{const p=await planFor(d);await db.exec("UPDATE fields SET name='concurrent' WHERE baserow_id=20");await assert.rejects(applyPlan(d,p,'approved',true,async()=>{}),/Destination changed/);assert.equal((await db.query('SELECT count(*)::int n FROM billing_entities')).rows[0].n,1);}finally{await db.close();}
});
test('SQL failure rolls back all table deltas; file failure prevents transaction',async()=>{
  const {db,d}=await fixture();try{
    const p=await planFor(d), before=p.destinationFingerprint;
    await assert.rejects(applyPlan(d,p,'approved',true,async()=>{throw new Error('fixture file failure');}),/file failure/);
    p.tables.find(t=>t.table==='fields').added[0].after.name=null;
    await assert.rejects(applyPlan(d,p,'approved',true,async()=>{}));
    assert.equal(dataFingerprint(await readDestination(d,schema)),before);
  }finally{await db.close();}
});

function sourceFixture(full) {
  let id=100;
  const s={fields:new Map(),rows:new Map()};
  for(const [table] of TABLES) {
    s.rows.set(table,[]);
    s.fields.set(table,full.tables.get(table).filter(c=>!['id','baserow_id','field_unit_rate','field_quantity'].includes(c.name)).map(c=>({id:++id,name:c.target&&c.name.endsWith('_id')?c.name.slice(0,-3):c.name,type:c.target?c.target.endsWith('_options')?'single_select':'link_row':c.type==='jsonb'?'file':'text',...(c.target?.endsWith('_options')?{select_options:[]}:{}),...(c.target&&!c.target.endsWith('_options')?{link_row_table_id:TABLES.find(([t])=>t===c.target)[1]}:{})})));
  }
  for(const join of JOINS) if(!s.fields.get(join.source).some(f=>f.name===join.field))s.fields.get(join.source).push({id:++id,name:join.field,type:join.target.endsWith('_options')?'multiple_select':'link_row',...(join.target.endsWith('_options')?{select_options:[]}:{link_row_table_id:TABLES.find(([t])=>t===join.target)[1]})});
  return s;
}
function sourceRow(s,table,id,values) {
  const row={id};for(const [name,value]of Object.entries(values))row['field_'+s.fields.get(table).find(f=>f.name===name).id]=value;
  s.rows.get(table).push(row);return row;
}
test('full planner covers all 65 tables and preserves every field billing entity through the join',async()=>{
  const full=await loadCurrentSchema(),s=sourceFixture(full),before=new Map([...full.tables.keys()].map(t=>[t,[]]));
  sourceRow(s,'billing_entities',10,{name:'A'});sourceRow(s,'billing_entities',11,{name:'B'});
  sourceRow(s,'fields',20,{name:'Shared',billing_entity:[{id:10},{id:11}]});
  const copier=new FileCopier(undefined,{version:1,project:PROJECT,database:DATABASE,files:{}},async()=>assert.fail('No dry-run manifest writes'));
  const plan=await makePlan(s,full,before,copier);
  assert.deepEqual(plan.issues,[]);assert.equal(plan.tables.length,65);
  assert.equal(plan.tables.find(t=>t.table==='field_billing_entities').added.length,2);
  assert.equal(plan.desired.get('fields')[0].billing_entity_id,null);
  assert.equal(plan.files.objects_to_copy,0);
});
test('failed files/missing links block changes; skipped rack rows are not treated as source deletions',async()=>{
  const full=await loadCurrentSchema(),s=sourceFixture(full),before=new Map([...full.tables.keys()].map(t=>[t,[]]));
  sourceRow(s,'fields',20,{name:'Shared',billing_entity:[{id:999}]});
  sourceRow(s,'probe_rack',4,{rack:'',rack_slot:2});
  before.set('probe_rack',[{id:'14',baserow_id:'4',rack:'A',rack_slot:'2',probe_id:null}]);
  const fileField=s.fields.get('documents').find(f=>f.type==='file');assert(fileField);
  sourceRow(s,'documents',5,{[fileField.name]:[{name:'bad',url:'https://untrusted.invalid/file'}]});
  const copier=new FileCopier(undefined,{version:1,project:PROJECT,database:DATABASE,files:{}},async()=>assert.fail('No dry-run writes'));
  const plan=await makePlan(s,full,before,copier);
  assert(plan.issues.some(i=>i.kind==='file'&&i.blocking));assert(plan.issues.some(i=>i.kind==='missing_link'&&i.blocking));
  assert.equal(plan.tables.find(t=>t.table==='probe_rack').deleted.length,0);
  assert(plan.issues.some(i=>i.kind==='skipped_row'&&i.row==='4'));
});
test('delta inserts only bcrypt installer PINs and leaves an equal PIN hash untouched on comparison',async()=>{
  const {db,d}=await fixture();try{
    await db.exec("CREATE TABLE installers(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,baserow_id bigint UNIQUE,name text,pin text CHECK(pin IS NULL OR pin LIKE '$2%'))");
    const pinSchema={tables:new Map([['installers',[col('id','bigint'),col('baserow_id','bigint'),col('name'),col('pin')]]]),catalogs:[]};
    const before=await readDestination(d,pinSchema);
    const row={baserow_id:'1',name:'Fixture installer',pin:'001234'};
    const delta=compareTable('installers',[row],[],pinSchema);
    const plan={tables:[delta],schema:pinSchema,before,issues:[],approval:'pin-fixture',destinationFingerprint:dataFingerprint(before)};
    await applyPlan(d,plan,'pin-fixture',false,async()=>{});
    const stored=(await db.query('SELECT * FROM installers')).rows[0];
    assert.notEqual(stored.pin,row.pin);assert(await bcrypt.compare('001234',stored.pin));
    const wanted={...row};await protectDestination('installers',wanted,stored,{},[]);
    assert.equal(compareTable('installers',[wanted],[{...stored,baserow_id:'1'}],pinSchema).changed.length,0);
  }finally{await db.close();}
});
