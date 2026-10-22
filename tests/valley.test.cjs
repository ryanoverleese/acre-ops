const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const Rijndael=require('rijndael-js');
const f=require('./supabase/harness.cjs');
const p=f.load('lib/valley/protocol.ts');
const c=f.load('lib/valley/client.ts');
const s=f.load('lib/valley/service.ts');
const t=f.load('lib/valley/types.ts');
// Public package test vectors and synthetic credentials only.
const credentials={apid:'fixture-api',key:'Lorem ipsum dolor sit amet, cons',iv:'Ut enim ad minim veniam, quis no',username:'fixture-login',password:'fixture-password'};
const at=Date.parse('2026-10-15T15:00:00Z');
const payload=(reading={})=>({device:{type:'pivot',dtype:'IconLink',serial:'12345',name:'QA Pivot',lateral:0,reading:[{angle:'90',power:'ON',direction:'FWD',unit_date:'10/15/2026 10:00:00',zone_offset:-5,behind:0,...reading}]}});
let admin,field;
test.before(async()=>{
  await f.initialize();
  const a=f.load('lib/supabase/adapter.ts');
  await f.db.exec("INSERT INTO user_role_options(value) VALUES('admin');");
  admin=await a.createRow('users',{email:'valley-qa@example.invalid',name:'QA Admin',password_hash:'fixture-hash',active:true,role:'admin'});
  field=await a.createRow('fields',{name:'QA Field'});
  f.session={user:{id:String(admin.id)}};
  Object.assign(process.env,{VALLEY_READ_ONLY_ENABLED:'true',VALLEY_APID:credentials.apid,VALLEY_API_KEY:credentials.key,VALLEY_API_IV:credentials.iv,AGSENSE365_USERNAME:credentials.username,AGSENSE365_PASSWORD:credentials.password});
});
test.after(async()=>{await f.db?.close();});

test('Rijndael-256 CBC matches the published independent vector, not AES',()=>{
  const cipher=new Rijndael(credentials.key,'cbc');
  assert.equal(Buffer.from(cipher.encrypt('Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do',256,credentials.iv)).toString('base64'),'bmwLDaLiI1k0oUu5wx9dlWs+Uuw3IhIkMYvq0VsVlQY66wAAqS0djh8N+SZJNHsv8wBRfhytRX2p9LJ0GT3sig==');
});
test('auth token contains login, protocol MD5, UTC seconds, zero padding and one URL encode',()=>{
  const token=p.generateToken(credentials,at);
  const bytes=Buffer.from(token.replace(/-/g,'+').replace(/_/g,'/'),'base64');
  const plain=Buffer.from(new Rijndael(credentials.key,'cbc').decrypt(bytes,256,credentials.iv)).toString().replace(/\0+$/,'');
  assert.equal(plain,`${credentials.username},${createHash('md5').update(credentials.password).digest('hex')},${at/1000}`);
  const query=new URLSearchParams({token});
  assert(!query.toString().includes('%253D'));
  assert.equal(query.get('token'),token);
  assert.notEqual(token,p.generateToken(credentials,at+1000));
});
test('configuration is disabled by default and accepts AgSense365 variable names',()=>{
  assert.equal(c.valleyEnabled({}),false);
  assert.equal(c.valleyEnabled({VALLEY_READ_ONLY_ENABLED:'true'}),true);
  const base={VALLEY_APID:credentials.apid,VALLEY_API_KEY:credentials.key,VALLEY_API_IV:credentials.iv};
  assert.deepEqual(c.readCredentials({...base,AGSENSE365_USERNAME:credentials.username,AGSENSE365_PASSWORD:credentials.password}),credentials);
  assert.deepEqual(c.readCredentials({...base,VALLEY_USERNAME:credentials.username,VALLEY_PASSWORD:credentials.password}),credentials);
  assert.throws(()=>c.readCredentials(base),/not configured/);
  assert.throws(()=>c.readCredentials({...base,AGSENSE365_USERNAME:'new-account',VALLEY_PASSWORD:'old-account-password'}),/not configured/);
  assert.throws(()=>p.validateCredentials({...credentials,key:'é'.repeat(32)}),/not configured/);
  assert.throws(()=>p.generateToken({...credentials,username:'bad,login'}),/not configured/);
});
test('only the two documented HTTPS GET endpoints exist; tokens refresh per call',async()=>{
  const calls=[];let now=at;
  const client=c.createValleyClient(credentials,async(url,options)=>{calls.push({url,options});return Response.json(url.pathname.includes('GetDevices')?{devices:[{type:'pivot',serial:12345,name:'QA Pivot'}]}:payload());},()=>{const value=now;now+=1000;return value;});
  await client.listPivots();await client.latestPivot('grower-account','12345');
  assert.deepEqual(Object.keys(client).sort(),['latestPivot','listPivots']);
  for(const {url,options} of calls){assert.equal(url.origin,'https://api.wagnet.net');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);assert(!url.searchParams.has('start'));assert(!url.searchParams.has('stop'));}
  assert.deepEqual(calls.map(call=>call.url.pathname),['/json/GetDevices/pivot/','/json/GetDeviceStatus/']);
  assert.notEqual(calls[0].url.searchParams.get('token'),calls[1].url.searchParams.get('token'));
  assert.equal(calls[1].url.searchParams.get('username'),'grower-account');
  assert.equal(calls[1].url.searchParams.get('serial'),'12345');
});
test('upstream URLs, errors, bodies and credentials never appear in thrown errors',async()=>{
  for(const fetcher of [async()=>{throw Error('SECRET upstream URL');},async()=>new Response('SECRET denied',{status:401}),async()=>new Response('SECRET not JSON'),async()=>new Response('SECRET',{headers:{'content-length':'3000000'}})]) {
    await assert.rejects(c.createValleyClient(credentials,fetcher).latestPivot('grower','12345'),error=>error.message==='Valley readings are unavailable' && !error.cause && !JSON.stringify(error).includes('SECRET'));
  }
  const aborted=AbortSignal.abort();let called=false;
  await assert.rejects(c.createValleyClient(credentials,async()=>{called=true;return Response.json(payload());},Date.now,aborted).latestPivot('grower','12345'));
  assert.equal(called,false);
});
test('status normalization allowlists only required readouts; never exposes raw telemetry or account',()=>{
  const raw=payload();raw.username='private-account';raw.device.reading[0].pressure=55;raw.device.reading[0].token='private-token';
  assert.deepEqual(p.normalizePivotStatus(raw,'12345'),{serial:'12345',name:'QA Pivot',angle:90,power:'ON',direction:'FWD',isLateral:false,reportedLocalTime:'10/15/2026 10:00:00',observedAt:'2026-10-15T15:00:00.000Z',behind:false});
});
test('missing values remain unknown, never north, OFF or inferred from movement',()=>{
  const result=p.normalizePivotStatus(payload({angle:'',power:undefined,direction:'REV',zone_offset:undefined,behind:undefined}),'12345');
  assert.equal(result.angle,null);assert.equal(result.power,null);assert.equal(result.direction,'REV');assert.equal(result.observedAt,null);assert.equal(result.behind,null);
  assert.equal(p.normalizePivotStatus(payload({angle:0,power:'OFF',direction:'IDLE'}),'12345').angle,0);
  assert.equal(p.normalizePivotStatus(payload({angle:360,power:'IDLE'}),'12345').angle,0);
  assert.equal(p.normalizePivotStatus(payload({angle:361}),'12345').angle,null);
});
test('local device timestamps need an explicit offset; invalid dates remain unknown',()=>{
  for(const reading of [{zone_offset:undefined},{zone_offset:''},{unit_date:'02/30/2026 10:00:00'},{unit_date:'10/15/2026 25:00:00'},{zone_offset:20}])assert.equal(p.normalizePivotStatus(payload(reading),'12345').observedAt,null);
});
test('wrong serial, upstream error, unknown device or ambiguous history are rejected',()=>{
  const a=payload();a.device.serial='54321';
  const b=payload();b.device.reading.push({...b.device.reading[0]});
  const d=payload();d.device.type='pump';
  for(const raw of [a,b,d,{...payload(),error:'not authorized'},{},null])assert.throws(()=>p.normalizePivotStatus(raw,'12345'),p.ValleyError);
  const empty=payload();empty.device.reading=[];
  assert.equal(p.normalizePivotStatus(empty,'12345').power,null);
});
test('device lists support explicit list/map/single-device envelopes only',()=>{
  const device={serial:'12345',name:'QA Pivot',type:'pivot'};
  for(const raw of [{devices:[device]},{devices:{1:device}},{device},{device0:device}])assert.deepEqual(p.normalizePivotList(raw),[{serial:'12345',name:'QA Pivot'}]);
  assert.deepEqual(p.normalizePivotList({devices:[]}),[]);
  for(const raw of [{},{error:'denied'},{devices:[{}]},null])assert.throws(()=>p.normalizePivotList(raw),p.ValleyError);
});
test('old, future, unknown and explicitly behind readings cannot appear current',()=>{
  const reading=p.normalizePivotStatus(payload(),'12345');
  assert.equal(t.readingFreshness(reading,at),'recent');
  assert.equal(t.readingFreshness(reading,at+91*60000),'stale');
  assert.equal(t.readingFreshness({...reading,behind:true},at),'stale');
  assert.equal(t.readingFreshness({...reading,observedAt:null},at),'unknown');
  assert.equal(t.readingFreshness(reading,at-6*60000),'unknown');
});
test('position icon uses north at zero, east at 90, south at 180 and west at 270',()=>{
  for(const [angle,x,y] of [[0,20,6],[90,34,20],[180,20,34],[270,6,20]]){const arm=t.pivotArm(angle);assert(Math.abs(arm.x-x)<1e-9);assert(Math.abs(arm.y-y)<1e-9);}
});
test('five-minute cache deduplicates concurrent calls by account AND serial; errors retry',async()=>{
  let calls=0,now=0,fail=false;const cache=new Map();
  const reader=s.cachedReader(async()=>{calls++;if(fail)throw Error('offline');return p.normalizePivotStatus(payload(),'12345');},()=>now,cache);
  await Promise.all([reader('a','12345'),reader('a','12345')]);assert.equal(calls,1);
  await reader('b','12345');assert.equal(calls,2);
  now=300001;await reader('a','12345');assert.equal(calls,3);
  fail=true;now=600002;
  await assert.rejects(reader('a','12345'));await assert.rejects(reader('a','12345'));assert.equal(calls,5);
});
test('multiple pivots stay scoped to linked fields; partial failures never become all-clear',async()=>{
  const links=[{field_id:1,valley_username:'a',serial:'12345'},{field_id:1,valley_username:'a',serial:'9'},{field_id:999,valley_username:'other',serial:'4'}];
  const result=await s.collectFieldPivots([1,2],links,async(user,serial)=>{assert.equal(user,'a');if(serial==='9')throw Error('missing');return p.normalizePivotStatus(payload(),'12345');});
  assert.equal(result[1].state,'unavailable');assert.equal(result[1].pivots.length,1);assert.deepEqual(result[2],{state:'unlinked',pivots:[]});assert.equal(result[999],undefined);
});
test('device fetch fan-out never exceeds four simultaneous requests',async()=>{
  let active=0,peak=0;
  const links=Array.from({length:12},(_,i)=>({field_id:1,valley_username:'a',serial:String(i)}));
  await s.collectFieldPivots([1],links,async()=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,1));active--;return p.normalizePivotStatus(payload(),'12345');});
  assert.equal(peak,4);
});
test('mapping migration has RLS, foreign key integrity and no browser grants',async()=>{
  assert.equal((await f.db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.field_valley_pivots'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']) {
    const result=(await f.db.query("SELECT has_table_privilege($1,'public.field_valley_pivots','SELECT') AS read,has_table_privilege($1,'public.field_valley_pivots','INSERT') AS write",[role])).rows[0];
    assert.deepEqual(result,{read:false,write:false});
  }
  assert.equal((await f.db.query("SELECT has_table_privilege('service_role','public.field_valley_pivots','INSERT') AS allowed")).rows[0].allowed,false);
  await assert.rejects(f.db.query("INSERT INTO field_valley_pivots(field_id,valley_username,serial) VALUES(999999,'a','12345')"));
  await f.db.query('INSERT INTO field_valley_pivots(field_id,valley_username,serial) VALUES($1,$2,$3)',[field.id,'grower','12345']);
  await assert.rejects(f.db.query('INSERT INTO field_valley_pivots(field_id,valley_username,serial) VALUES($1,$2,$3)',[field.id,'grower','12345']));
});
test('mapping permissions remove Supabase default write grants before allowing service reads',async()=>{
  const migrationName=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(name=>name.endsWith('_field_valley_pivots.sql'));
  const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations',migrationName),'utf8');
  const permissions=migration.match(/REVOKE ALL ON public\.field_valley_pivots[^;]+;\s*GRANT SELECT ON public\.field_valley_pivots TO service_role;/)?.[0];
  assert(permissions);
  await f.db.exec('GRANT ALL ON public.field_valley_pivots TO anon, authenticated, service_role;');
  await f.db.exec(permissions);
  for(const role of ['anon','authenticated','service_role']) {
    const row=(await f.db.query("SELECT has_table_privilege($1,'public.field_valley_pivots','SELECT') AS read,has_table_privilege($1,'public.field_valley_pivots','INSERT') AS insert,has_table_privilege($1,'public.field_valley_pivots','UPDATE') AS update,has_table_privilege($1,'public.field_valley_pivots','DELETE') AS delete",[role])).rows[0];
    assert.deepEqual(row,{read:role==='service_role',insert:false,update:false,delete:false});
  }
});
test('status endpoint has GET only and enforces authentication before any Valley access',async()=>{
  const route=f.load('app/api/valley/status/route.ts');
  const {NextRequest}=require('next/server');
  assert.equal(route.POST,undefined);assert.equal(route.PATCH,undefined);assert.equal(route.DELETE,undefined);
  f.session=null;
  assert.equal((await route.GET(new NextRequest('http://localhost/api/valley/status?fields=1'))).status,401);
  f.session={user:{id:String(admin.id)}};
  assert.throws(()=>f.load('lib/supabase/api.ts').authorizeActor({kind:'crew',role:'installer'},'/api/valley/status','GET'));
});
test('disabled endpoint is inert; malformed IDs reject before reaching the integration',async()=>{
  const {GET}=f.load('app/api/valley/status/route.ts');const {NextRequest}=require('next/server');
  process.env.VALLEY_READ_ONLY_ENABLED='false';
  const off=await GET(new NextRequest('http://localhost/api/valley/status?fields=1'));
  assert.deepEqual(await off.json(),{enabled:false,fields:{}});assert.equal(off.headers.get('cache-control'),'private, no-store');
  process.env.VALLEY_READ_ONLY_ENABLED='true';
  for(const ids of ['', '0', '-1', '1.2', '1;DROP', '99999999999999999',Array.from({length:26},(_,i)=>i+1).join(',')])assert.equal((await GET(new NextRequest('http://localhost/api/valley/status?'+new URLSearchParams({fields:ids})))).status,400);
});
test('real status route performs SELECTs only and returns no account information',async()=>{
  const oldFetch=global.fetch;const sql=[];f.failSql=(query)=>{sql.push(query);return false;};
  global.fetch=async()=>Response.json(payload());
  try {
    const {NextRequest}=require('next/server');
    const response=await f.load('app/api/valley/status/route.ts').GET(new NextRequest(`http://localhost/api/valley/status?fields=${field.id}`));
    assert.equal(response.status,200);const data=await response.json();assert.equal(data.fields[field.id].state,'ready');
    assert(!JSON.stringify(data).includes('grower'));assert(!JSON.stringify(data).includes('fixture-password'));
    assert(sql.length>=2);assert(sql.every(query=>/^SELECT\b/i.test(query.trim())));
  } finally {global.fetch=oldFetch;f.failSql=null;}
});
test('copy builders never include the pivot readout and no command path exists',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../app/water-recs/WaterRecsClient.tsx'),'utf8');
  const builders=source.slice(source.indexOf('// Build copy text for Full Report'),source.indexOf('const handleCopyAll'));
  assert(!/valley|PivotStatusIcon/.test(builders));
  for(const name of ['client.ts','service.ts'])assert(!/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/.test(fs.readFileSync(path.join(__dirname,'../lib/valley',name),'utf8')));
});
