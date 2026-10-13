// Production Next server, in-memory Postgres, synthetic fixtures. Never live data.
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), Module=require('node:module');
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
if(process.env.ACRE_SUPABASE_BROWSER!=='1') throw Error('Explicit isolated browser test environment required');
const mode=process.env.ACRE_REMOVAL_TEST==='1'?'removal':'equipment';
const inventory=require('../../lib/supabase/registry.json');
const ids={817294:'contacts',817295:'operations',817297:'billing_entities',817298:'fields',817299:'probes',817300:'field_seasons',817301:'water_recs',817302:'repairs',817303:'invoices',817304:'invoice_lines',819350:'probe_assignments',827222:'inventory',831050:'weather_stations',934076:'probe_rack'};
// Reuse the historical synthetic records ONLY, not the retired Baserow transport.
const source=fs.readFileSync(path.join(root,`tests/${mode}/baserow-fixture.cjs`),'utf8');
const start=source.indexOf('const year ='), end=source.indexOf(mode==='removal'?'const writes =':'let nextId =',start);
const fixture=vm.runInNewContext(source.slice(start,end)+';tables',{Date});
const db=new PGlite({extensions:{pgcrypto}}); const writes=[],webhooks=[];
let initialized=false, adapter;
process.env.SUPABASE_URL='https://junawlttpyztjlnbmvcb.supabase.co';
process.env.DATABASE_URL='postgresql://postgres:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';
delete process.env.DATABASE_URL_ALT;
process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_fixture_only';
process.env.REMOVAL_WEBHOOK_DRY_RUN='true';
const rawLoad=Module._load;
async function persist() {
  if(!process.env.ACRE_REMOVAL_TEST_STATE) return;
  const tables={};
  for(const [id,table] of Object.entries(ids)) {
    const rows=(await db.query(`SELECT ${adapter.readProjection(table)} FROM public."${inventory.tables[table].read}" r ORDER BY r.id`)).rows;
    tables[id]=rows.map(row=>adapter.serialize(table,row));
  }
  fs.writeFileSync(process.env.ACRE_REMOVAL_TEST_STATE,JSON.stringify({tables,writes,webhooks}),{mode:0o600});
}
class Pool {
  on() {}
  async query(sql,values) {
    await ready;
    const result=await db.query(sql,values);
    if(initialized) {
      const update=sql.match(/^UPDATE public\."(\w+)" SET (.+) WHERE id =/);
      if(update) {
        const table=Number(Object.keys(ids).find(key=>ids[key]===update[1]));
        if(table) writes.push({table,id:Number(values.at(-1)),patch:Object.fromEntries([...update[2].matchAll(/"(\w+)" = \$(\d+)/g)].map(match=>[match[1],values[Number(match[2])-1]]))});
      }
      if(sql==='COMMIT') await persist();
    }
    return result;
  }
  async connect() { await ready; return {query:this.query.bind(this),release(){}}; }
  async end() {}
}
// pg's ESM entry re-exports the CommonJS object. Patch that object as well as
// require('pg') so production Turbopack's import('pg') uses the isolated pool.
rawLoad.call(Module, 'pg', module, false).Pool = Pool;
Module._load=function(name,parent,main) {
  if(name==='pg')return {Pool,types:{setTypeParser(){}}};
  if(name==='server-only')return {};
  if(name.startsWith('@/'))name=path.join(root,name.slice(2));
  if((name.startsWith('.')||name.startsWith(root))&&!path.extname(name)) {
    const file=path.resolve(parent?.filename?path.dirname(parent.filename):root,name)+'.ts';if(fs.existsSync(file))name=file;
  }
  return rawLoad.call(this,name,parent,main);
};
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);
const originalFetch=global.fetch;
global.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(['127.0.0.1','localhost','::1'].includes(url.hostname))return originalFetch(input,init);
  if(url.href==='https://removal-webhook.example.invalid/removal') {
    webhooks.push(JSON.parse(init.body));await persist();return Response.json({ok:true});
  }
  throw Error('External network forbidden in Supabase browser tests');
};
async function option(table,value) {
  const label=String(value?.value??value);
  await db.query(`INSERT INTO "${table}"(value,color) VALUES($1,'blue') ON CONFLICT(value) DO NOTHING`,[label]);
  return (await db.query(`SELECT id FROM "${table}" WHERE value=$1`,[label])).rows[0].id;
}
const ready=(async()=>{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for(const name of fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>name.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
  for(const catalog of inventory.catalogs) await option(catalog.name,'Fixture');
  for(const value of ['Installed','In Stock','RMA','On Order','On Order - Trade','Trade Ordered','Lost']) await option('probe_status_options',value);
  for(const value of ['Installed','Removed','Assigned','Unassigned']) await option('assignment_probe_status_options',value);
  for(const value of ['Draft','Paid']) await option('invoice_status_options',value);
  await option('user_role_options','admin');
  const adminRole=(await db.query("SELECT id FROM user_role_options WHERE value='admin'")).rows[0].id;
  await db.query('INSERT INTO users(id,email,password_hash,name,role_id,active) OVERRIDING SYSTEM VALUE VALUES(1,$1,$2,$3,$4,true)',['qa@example.invalid','fixture-no-password','QA Admin',adminRole]);
  const joins=[];
  const sourceOrder=['operations','billing_entities','contacts','fields','field_seasons','probes','probe_assignments','probe_rack','inventory','weather_stations'];
  for(const table of sourceOrder) {
    const tableId=Object.keys(ids).find(id=>ids[id]===table);
    for(const row of fixture[tableId]||[]) {
      const columns={id:row.id};
      for(const c of inventory.tables[table].columns) {
        if(c.identity||c.name==='baserow_id'||table==='fields'&&c.name==='billing_entity_id')continue;
        const key=c.target?c.name.replace(/_id$/,''):c.name;
        const value=row[key];if(value===undefined)continue;
        columns[c.name]=c.target?(c.target.endsWith('_options')?await option(c.target,value):Number(value[0]?.id)||null):value;
      }
      const keys=Object.keys(columns);
      await db.query(`INSERT INTO "${table}"(${keys.map(k=>'"'+k+'"').join(',')}) OVERRIDING SYSTEM VALUE VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(columns));
      for(const j of inventory.joins.filter(j=>j.source===table)) (row[j.field]||[]).forEach((link,index)=>joins.push({j,left:row.id,right:link.id,index}));
    }
  }
  for(const {j,left,right,index} of joins)await db.query(`INSERT INTO "${j.name}"("${j.left}","${j.right}",position) VALUES($1,$2,$3)`,[left,right,index]);
  for(const table of inventory.sourceNames)await db.query(`SELECT setval(pg_get_serial_sequence('public.${table}','id'),greatest(coalesce(max(id),0),899),true) FROM "${table}"`);
  adapter=require('../../lib/supabase/adapter.ts');
  initialized=true;await persist();
})();
ready.catch(error=>{console.error('Isolated PostgreSQL fixture failed:',error.message);process.exitCode=1;});
