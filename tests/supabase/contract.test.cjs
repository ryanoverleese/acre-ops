const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./harness.cjs');
const a = f.load('lib/supabase/adapter.ts');
const d = f.load('lib/supabase/database.ts');
const {registry} = f.load('lib/supabase/registry.ts');
let be1, be2, field, season, user;
test.before(async () => {
  await f.initialize();
  for (const catalog of registry.catalogs)
    await f.db.query(`INSERT INTO public."${catalog.name}" (value,color) VALUES ('Fixture','blue')`);
  await f.db.exec("INSERT INTO invoice_status_options(value) VALUES ('Draft'),('Paid'); INSERT INTO user_role_options(value) VALUES ('admin');");
  user = await a.createRow('users',{email:'qa@example.invalid',password_hash:'private-test-hash',name:'QA Admin',active:true,role:'admin'});
  f.session = {user:{id:String(user.id)}};
  be1 = await a.createRow('billing_entities',{name:'Partner A'});
  be2 = await a.createRow('billing_entities',{name:'Partner B'});
  field = await a.createRow('fields',{name:'Shared Field',billing_entity:[be1.id,be2.id]});
  season = await a.createRow('field_seasons',{field:[field.id],season:2026});
});
test.after(async () => { await f.db?.close(); });

test('all 22 table projections execute against the actual migrations', async () => {
  for (const table of registry.sourceNames) assert.ok(Array.isArray(await a.getRows(table)),table);
});
test('every dropdown catalog has metadata and the ID/value/color shape', async () => {
  let count=0;
  for (const table of registry.sourceNames) for (const options of Object.values(await a.getTableFieldOptions(table))) {
    assert.equal(typeof options[0].id,'number'); assert.equal(typeof options[0].value,'string'); assert.equal(typeof options[0].color,'string'); count++;
  }
  assert.equal(count,35);
});
test('billing uses all join links, omitted links survive, and explicit [] clears', async () => {
  assert.deepEqual(field.billing_entity.map(link=>link.id),[be1.id,be2.id]);
  await f.db.query('UPDATE fields SET billing_entity_id=$1 WHERE id=$2',[be2.id,field.id]);
  assert.deepEqual((await a.updateRow('fields',field.id,{name:'Shared Field'})).billing_entity.map(link=>link.id),[be1.id,be2.id]);
  const temporary = await a.createRow('fields',{name:'Clear test',billing_entity:[be1.id]});
  assert.deepEqual((await a.updateRow('fields',temporary.id,{billing_entity:[]})).billing_entity,[]);
  await assert.rejects(a.updateRow('fields',field.id,{billing_entity_id:be2.id}),/not writable/);
});
test('field-detail saves preserve every billing link and reject legacy scalar replacement', async () => {
  const {PATCH}=f.load('app/api/fields/[id]/route.ts');
  const target=await a.createRow('fields',{name:'Detail save fixture',billing_entity:[be1.id,be2.id]});
  const context={params:Promise.resolve({id:String(target.id)})};
  const saved=await PATCH(f.request(`/api/fields/${target.id}`,{notes:'Unrelated detail edit',billing_entity:[be1.id,be2.id]},'PATCH'),context);
  assert.equal(saved.status,200);
  assert.deepEqual((await saved.json()).billing_entity.map(link=>link.id),[be1.id,be2.id]);
  const persisted=await a.getRow('fields',target.id);
  assert.equal(persisted.notes,'Unrelated detail edit');
  assert.deepEqual(persisted.billing_entity.map(link=>link.id),[be1.id,be2.id]);
  const rejected=await PATCH(f.request(`/api/fields/${target.id}`,{notes:'Must not save',billing_entity:be1.id},'PATCH'),context);
  assert.equal(rejected.status,409);
  assert.deepEqual(await a.getRow('fields',target.id),persisted);
  for (const ids of [[be2.id],[]]) {
    const changed=await PATCH(f.request(`/api/fields/${target.id}`,{billing_entity:ids},'PATCH'),context);
    assert.equal(changed.status,200);
    assert.deepEqual((await changed.json()).billing_entity.map(link=>link.id),ids);
  }
});
test('blank text/serials become null; credentials never appear in public DTOs', async () => {
  const probe = await a.createRow('probes',{serial_number:'   ',notes:''});
  assert.equal(probe.serial_number,null); assert.equal(probe.notes,null);
  const installer = await a.createRow('installers',{name:'Crew QA',pin:require('bcryptjs').hashSync('1234',4)});
  assert.equal(installer.pinSet,true); assert.equal(installer.pin,undefined);
  assert.equal(user.password_hash,undefined); assert.equal((await a.getRow('users',user.id,true)).password_hash,'private-test-hash');
});
test('50/50 allocation creates one charge per entity, preserves total, and retries update', async () => {
  const {POST} = f.load('app/api/billing/enroll/route.ts');
  const payload = {season:2026,field_season_id:season.id,rate:100,quantity:3,service_type:'Probe service',billing_entity_id:be1.id};
  const first = await POST(f.request('/api/billing/enroll',payload));
  assert.equal(first.status,200,JSON.stringify(await first.clone().json()));
  const result = await first.json();
  assert.equal(result.charges.length,2);
  assert.deepEqual(result.charges.map(c=>[c.rate,c.quantity]),[[150,1],[150,1]]);
  const second = await POST(f.request('/api/billing/enroll',payload));
  assert.equal(second.status,200);
  assert.deepEqual((await second.json()).charges.map(c=>c.invoiceLine.id),result.charges.map(c=>c.invoiceLine.id));
  assert.equal((await a.getRows('invoice_lines')).length,2);
  assert.equal((await a.getRows('invoices')).reduce((sum,inv)=>sum+inv.amount,0),300);
});
test('thirds and odd pennies retain the exact field total deterministically', async () => {
  const {allocateFieldCharge} = f.load('lib/billing-allocation.ts');
  assert.deepEqual(allocateFieldCharge(100,1,[30,10,20]).map(c=>[c.billingEntityId,c.rate]),[[10,33.34],[20,33.33],[30,33.33]]);
  assert.deepEqual(allocateFieldCharge(100.01,3,[1,2]).map(c=>c.rate),[150.02,150.01]);
  assert.deepEqual(allocateFieldCharge(0,0,[1,2]).map(c=>c.rate),[0,0]);
});

test('shared field quantity 2 twice stays 2x, including reload and a catalog rate change', async () => {
  const {POST}=f.load('app/api/billing/enroll/route.ts');
  const {fieldChargeBasis,quantityEditBasis}=f.load('lib/billing-allocation.ts');
  const fs=await a.createRow('field_seasons',{field:[field.id],season:2027});
  const base={season:2027,field_season_id:fs.id,service_type:'Original custom rate'};
  let result=await (await POST(f.request('/api/billing/enroll',{...base,rate:125,quantity:1}))).json();
  for (const quantity of [2,2,3,2]) {
    // Same helper used by BillingClient; rebuild from saved rows as after reload.
    const saved=await a.getRows('invoice_lines',{filters:{field_season:fs.id}});
    const basis=fieldChargeBasis(saved,999);
    assert.equal(basis.fieldUnitRate,125,'Never use the saved total or changed catalog rate');
    result=await (await POST(f.request('/api/billing/enroll',{...base,...quantityEditBasis(basis,quantity)}))).json();
    assert.equal(result.fieldUnitRate,125); assert.equal(result.fieldQuantity,quantity);
    assert.equal(result.charges.reduce((sum,c)=>sum+c.rate*c.quantity,0),125*quantity);
    assert.equal(result.charges.length,2);
  }
  assert.equal((await a.getRows('invoice_lines',{filters:{field_season:fs.id}})).length,2);
  const oldShared=fieldChargeBasis([{rate:125,quantity:1},{rate:125,quantity:1}],999);
  assert.throws(()=>quantityEditBasis(oldShared,2),/original field rate is missing/);
});

test('installer login accepts only bcrypt, rejects plaintext even before migration, and never returns a PIN', async () => {
  const previous=f.session; f.session=null;
  try {
    const bcrypt=require('bcryptjs');
    // Raw setup bypasses API authorization; these are isolated synthetic rows.
    const hashed=bcrypt.hashSync('0123',4);
    await f.db.query('INSERT INTO installers(name,pin) VALUES($1,$2)',['Hashed auth fixture',hashed]);
    const {POST}=f.load('app/api/installer-auth/route.ts');
    const good=await POST(f.request('/api/installer-auth',{installer:'Hashed auth fixture',pin:'0123'}));
    assert.equal(good.status,200);
    assert.deepEqual(Object.keys(await good.json()).sort(),['id','ok']);
    assert.match(good.headers.get('set-cookie'),/HttpOnly/i);
    assert.equal((await POST(f.request('/api/installer-auth',{installer:'Hashed auth fixture',pin:'9999'}))).status,401);
    await f.db.exec('BEGIN; ALTER TABLE installers DROP CONSTRAINT installers_pin_bcrypt_only;');
    try {
      await f.db.query('INSERT INTO installers(name,pin) VALUES($1,$2)',['Legacy auth fixture','0123']);
      assert.equal((await POST(f.request('/api/installer-auth',{installer:'Legacy auth fixture',pin:'0123'}))).status,401);
    } finally {await f.db.exec('ROLLBACK');}
  } finally {f.session=previous;}
});

test('crew webhook reads dry-run configuration and defaults safely; Workflows remains silent', async () => {
  const originalFetch=global.fetch, originalSetting=process.env.REMOVAL_WEBHOOK_DRY_RUN, originalUrl=process.env.REMOVAL_WEBHOOK_URL;
  const calls=[];process.env.REMOVAL_WEBHOOK_URL='https://webhook.example.invalid/removal';
  global.fetch=async(_url,init)=>{calls.push(JSON.parse(init.body));return Response.json({ok:true});};
  await f.db.exec("INSERT INTO probe_status_options(value) VALUES ('Installed'),('In Stock') ON CONFLICT(value) DO NOTHING; INSERT INTO assignment_probe_status_options(value) VALUES ('Installed'),('Removed') ON CONFLICT(value) DO NOTHING;");
  try {
    for (const [index,setting] of [undefined,'true','false',' FALSE ','', 'garbage'].entries()) {
      if(setting===undefined)delete process.env.REMOVAL_WEBHOOK_DRY_RUN;else process.env.REMOVAL_WEBHOOK_DRY_RUN=setting;
      const probe=await a.createRow('probes',{serial_number:`DRY-${index}`,status:'Installed'});
      const pa=await a.createRow('probe_assignments',{field_season:[season.id],probe:[probe.id],probe_status:'Installed'});
      const form=new FormData();form.set('probeAssignmentId',String(pa.id));form.set('removedBy','QA Admin');form.set('source','crew');
      assert.equal((await f.load('app/api/removal/route.ts').POST(new Request('http://localhost/api/removal',{method:'POST',body:form}))).status,200);
      assert.equal(calls.at(-1).dry_run,setting?.trim().toLowerCase()!=='false');
    }
  } finally {
    global.fetch=originalFetch;
    if(originalSetting===undefined)delete process.env.REMOVAL_WEBHOOK_DRY_RUN;else process.env.REMOVAL_WEBHOOK_DRY_RUN=originalSetting;
    if(originalUrl===undefined)delete process.env.REMOVAL_WEBHOOK_URL;else process.env.REMOVAL_WEBHOOK_URL=originalUrl;
  }
});
test('failure on the second billing recipient rolls back both and sends no cache invalidation', async () => {
  const before = await a.getRows('invoice_lines'); const tags = f.tags.length;
  const {POST} = f.load('app/api/billing/enroll/route.ts');
  let updates=0; f.failSql = sql => sql.startsWith('UPDATE public."invoice_lines"') && ++updates===2;
  try { assert.equal((await POST(f.request('/api/billing/enroll',{season:2026,field_season_id:season.id,rate:80}))).status,400); }
  finally { f.failSql=null; }
  assert.deepEqual(await a.getRows('invoice_lines'),before); assert.equal(f.tags.length,tags);
});
test('row graph failure rolls back the parent and all join writes', async () => {
  const before=(await a.getRows('fields')).length;
  await assert.rejects(d.transaction(async()=>{await a.createRow('fields',{name:'Rollback',billing_entity:[be1.id]});throw new Error('abort');}));
  assert.equal((await a.getRows('fields')).length,before);
});
test('cached projections invalidate every changed base/join table immediately after commit', async () => {
  f.tags.length=0; await a.updateRow('fields',field.id,{billing_entity:[be1.id,be2.id]});
  assert.ok(f.tags.some(([tag])=>tag==='supabase-native-v1-fields'));
  assert.ok(f.tags.some(([tag])=>tag==='supabase-native-v1-field_billing_entities'));
  assert.ok(f.tags.every(([,profile])=>profile.expire===0));
});

test('Workflows sends no webhook; crew notifies once after commit with native IDs and dry_run', async () => {
  await f.db.exec("INSERT INTO probe_status_options(value) VALUES ('Installed'),('In Stock'),('RMA') ON CONFLICT(value) DO NOTHING; INSERT INTO assignment_probe_status_options(value) VALUES ('Installed'),('Removed') ON CONFLICT(value) DO NOTHING;");
  const probe=await a.createRow('probes',{serial_number:'QA-1',status:'Installed'});
  const siblingProbe=await a.createRow('probes',{serial_number:'QA-2',status:'Installed'});
  const assignment=await a.createRow('probe_assignments',{field_season:[season.id],probe:[probe.id],probe_status:'Installed',planned_remover:'Fixture',install_date:'2026-05-01'});
  const sibling=await a.createRow('probe_assignments',{field_season:[season.id],probe:[siblingProbe.id],probe_status:'Installed',planned_remover:'Fixture',install_date:'2026-05-01'});
  process.env.REMOVAL_WEBHOOK_URL='https://webhook.example.invalid/removal';
  const calls=[]; const original=global.fetch;
  global.fetch=async(url,init)=>{
    assert.equal(url,process.env.REMOVAL_WEBHOOK_URL);
    const payload=JSON.parse(init.body);
    // Reading with a separate transaction sees committed facts.
    assert.equal((await a.getRow('probe_assignments',payload.assignment_id)).probe_status.value,'Removed');
    calls.push(payload);return Response.json({ok:true});
  };
  const {POST}=f.load('app/api/removal/route.ts');
  const request=(id,source)=>{const form=new FormData();for(const [k,v] of Object.entries({probeAssignmentId:String(id),source,removedBy:'QA Admin',removalDate:'2026-10-11'}))form.set(k,v);return new Request('http://localhost/api/removal',{method:'POST',body:form});};
  try {
    const res=await POST(request(assignment.id,'workflows'));
    assert.equal(res.status,200,JSON.stringify(await res.clone().json())); assert.equal(calls.length,0);
    assert.deepEqual(await a.getRow('probe_assignments',sibling.id),sibling);
    assert.equal((await a.getRow('probe_assignments',assignment.id)).planned_remover,assignment.planned_remover);
    assert.equal((await a.getRow('probes',probe.id)).status.value,'In Stock');
    assert.equal((await POST(request(sibling.id,'crew'))).status,200);
    assert.equal(calls.length,1); assert.equal(calls[0].assignment_id,sibling.id); assert.equal(calls[0].serial,'QA-2'); assert.equal(calls[0].source,'acre-ops'); assert.equal(calls[0].dry_run,true);
    assert.equal((await POST(request(sibling.id,'crew'))).status,200); assert.equal(calls.length,1);
  } finally {global.fetch=original;}
});
test('failed crew inventory write rolls back removal and prevents webhook', async () => {
  const probe=await a.createRow('probes',{serial_number:'QA-failure',status:'Installed'});
  const assignment=await a.createRow('probe_assignments',{field_season:[season.id],probe:[probe.id],probe_status:'Installed'});
  f.failSql=sql=>sql.startsWith('UPDATE public."probes"');
  const form=new FormData(); form.set('probeAssignmentId',String(assignment.id)); form.set('removedBy','QA Admin');
  try {assert.notEqual((await f.load('app/api/removal/route.ts').POST(new Request('http://localhost/api/removal',{method:'POST',body:form}))).status,200);}
  finally {f.failSql=null;}
  assert.deepEqual(await a.getRow('probe_assignments',assignment.id),assignment);
});
test('private files expose stable authorized URLs; Storage accepts both key formats', async () => {
  const ref={bucket:'baserow-import',path:'documents/1/photo.jpg',name:'photo.jpg',size:12,mime:'image/jpeg'};
  const document=await a.createRow('documents',{name:'Photo',file:[ref]});
  assert.deepEqual(document.file[0],{name:'photo.jpg',size:12,mime_type:'image/jpeg',is_image:true,url:`/api/files/documents/${document.id}/file/0`});
  const original=global.fetch; const {signedDownload}=f.load('lib/supabase/storage.ts');
  try {
    for (const key of ['sb_secret_fixture_only','legacy.service.jwt']) {
      process.env.SUPABASE_SERVICE_ROLE_KEY=key;
      global.fetch=async(url,init)=>{
        assert.equal(new URL(url).hostname,'junawlttpyztjlnbmvcb.supabase.co');
        assert.equal(init.headers.apikey,key); assert.equal(init.headers.Authorization,key.startsWith('sb_secret_')?undefined:`Bearer ${key}`);
        return Response.json({signedURL:'/object/sign/baserow-import/documents/1/photo.jpg?token=fixture'});
      };
      assert.match(await signedDownload(ref),/^https:\/\/junawlttpyztjlnbmvcb.supabase.co\/storage\/v1\/object\/sign\//);
    }
  } finally {global.fetch=original;process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_fixture_only';}
});
test('paged reads return all rows, not just the first batch, and search preserves envelope', async () => {
  await f.db.exec("INSERT INTO water_recs(field_season_id,date,recommendation,report_type) SELECT 1,'2026-08-01','page '||g,'Paging Fixture' FROM generate_series(1,1001) g;");
  assert.equal((await a.getRows('water_recs',{size:250,filters:{report_type:'Paging Fixture'}})).length,1001);
  const response=await f.load('lib/supabase/api.ts').dataRequest({table:'water_recs',limit:10,page:2,options:{filters:{report_type:'Paging Fixture'}}});
  const data=await response.json();assert.equal(data.results.length,10);assert.equal(data.count,1001);assert.equal(data.next,'?page=3');assert.equal(data.previous,'?page=1');
});
test('water replacement preserves distinct report types, is idempotent, and empty saves are inert', async () => {
  const {POST}=f.load('app/api/water-recs/bulk/route.ts');
  const record={field_season:season.id,date:'2026-08-02',recommendation:'Review',suggested_water_day:'Monday'};
  for (const type of ['Early Week','early_week']) assert.equal((await POST(f.request('/api/water-recs/bulk',{records:[record],reportType:type}))).status,200);
  const count=(await a.getRows('water_recs')).length;
  assert.equal((await POST(f.request('/api/water-recs/bulk',{records:[],scopeFieldSeasons:[season.id],reportType:'Early Week'}))).status,200);
  assert.equal((await a.getRows('water_recs')).length,count);
  assert.equal((await POST(f.request('/api/water-recs/bulk',{records:[record],reportType:'Early Week'}))).status,200);
  assert.equal((await a.getRows('water_recs')).length,count);
});
test('rack moves reject stale/occupied destinations and undo atomically', async () => {
  const {moveProbe}=f.load('lib/supabase/equipment.ts');
  const p=await a.createRow('probes',{serial_number:'Rack QA'});
  const source=await a.createRow('probe_rack',{rack:'1A',rack_slot:1,probe:[p.id]});
  const dest=await a.createRow('probe_rack',{rack:'1A',rack_slot:2});
  await assert.rejects(moveProbe(p.id,null,dest.id),/location changed/);
  await moveProbe(p.id,source.id,dest.id);
  assert.deepEqual((await a.getRow('probe_rack',source.id)).probe,[]);
  assert.equal((await a.getRow('probe_rack',dest.id)).probe[0].id,p.id);
  await moveProbe(p.id,dest.id,source.id);
  assert.equal((await a.getRow('probe_rack',source.id)).probe[0].id,p.id);
});
test('options retire without clearing historical values, and reject cross-catalog IDs', async () => {
  const meta=await a.getTableFieldOptionsWithMeta('fields');
  const [fieldName,choices]=Object.entries(meta)[0];
  const current=choices.options[0]; await a.updateRow('fields',field.id,{[fieldName]:current.id});
  const updated=await a.saveSelectOptions(choices.fieldId,[{id:0,value:'New choice',color:'green'}]);
  assert.equal(updated.select_options.length,1);
  assert.equal((await a.getRow('fields',field.id))[fieldName].value,current.value);
  await assert.rejects(a.saveSelectOptions(choices.fieldId,[{id:999999,value:'wrong',color:'gray'}]),/different dropdown/);
});
test('authorization rejects public writes, crew admin writes, and foreign customer fields', async () => {
  const {authorizeActor,assertCustomerField}=f.load('lib/supabase/api.ts');
  assert.throws(()=>authorizeActor({kind:'public'},'/api/fields','POST'));
  assert.throws(()=>authorizeActor({kind:'crew',id:1,name:'QA',role:'installer'},'/api/select-options','PATCH'));
  await assert.rejects(assertCustomerField('unrecognized',field.id),/Invalid customer token/);
});
test('wrong-project database configurations are rejected before connecting', () => {
  assert.throws(()=>d.databaseConfig('postgresql://postgres:fixture@db.other.supabase.co/postgres'),/acre-ops/);
  assert.throws(()=>d.databaseConfig('postgresql://postgres:fixture@db.junawlttpyztjlnbmvcb.supabase.co/postgres?sslmode=disable'),/Unsupported/);
});

test('discount pennies use the same deterministic allocation as field charges', () => {
  const {equalShareAmount}=f.load('lib/billing-allocation.ts');
  assert.deepEqual([0,1,2].map(index=>equalShareAmount(25,3,index)),[8.34,8.33,8.33]);
  assert.throws(()=>equalShareAmount(25,0,0));
});

test('contact operation add/remove preserves its public request and response contract', async () => {
  await f.db.exec("INSERT INTO contact_main_contact_options(value) VALUES ('Yes'),('No') ON CONFLICT(value) DO NOTHING;");
  const op=await a.createRow('operations',{name:'Contract operation'});
  const contact=await a.createRow('contacts',{name:'Contract contact'});
  const handlers=f.load('app/api/contacts/[id]/operations/route.ts');
  const context={params:Promise.resolve({id:String(contact.id)})};
  const added=await handlers.POST(f.request(`/api/contacts/${contact.id}/operations`,{operationId:op.id,isMainContact:true}),context);
  assert.equal(added.status,200,JSON.stringify(await added.clone().json()));
  assert.equal((await added.json()).is_main_contact.value,'Yes');
  const removed=await handlers.DELETE(new Request(`http://localhost/api/contacts/${contact.id}/operations?operationId=${op.id}`,{method:'DELETE'}),context);
  assert.equal(removed.status,200);
  assert.deepEqual((await a.getRow('contacts',contact.id)).operations,[]);
});

test('customer ownership follows the second billing link, denies another field and private columns', async () => {
  const op=await a.createRow('operations',{name:'Customer operation',approval_token:'contract-customer-token'});
  await a.createRow('contacts',{name:'Customer contact',billing_entity:[be2.id],operations:[op.id]});
  const api=f.load('lib/supabase/api.ts');
  assert.equal(await api.assertCustomerField('contract-customer-token',field.id,season.id),op.id);
  const foreign=await a.createRow('fields',{name:'Foreign field'});
  await assert.rejects(api.assertCustomerField('contract-customer-token',foreign.id),/does not belong/);
  const pa=await a.createRow('probe_assignments',{field_season:[season.id]});
  await assert.rejects(api.assertAssignmentWrite({kind:'customer',token:'contract-customer-token'},pa.id,{planned_remover:'Changed'}),/cannot change/);
  await api.assertAssignmentWrite({kind:'customer',token:'contract-customer-token'},pa.id,{placement_lat:40});
});

test('cross-origin writes and unauthenticated private-file reads are blocked', async () => {
  const {POST}=f.load('app/api/billing/enroll/route.ts');
  const request=new Request('http://localhost/api/billing/enroll',{method:'POST',headers:{origin:'https://foreign.example',host:'localhost','Content-Type':'application/json'},body:JSON.stringify({})});
  assert.equal((await POST(request)).status,403);
  const previous=f.session;f.session=null;
  try {
    const {GET}=f.load('app/api/files/[table]/[id]/[column]/[index]/route.ts');
    const response=await GET(new Request('http://localhost/api/files/documents/1/file/0'),{params:Promise.resolve({table:'documents',id:'1',column:'file',index:'0'})});
    assert.equal(response.status,401);
  } finally {f.session=previous;}
});

test('fulfillment scopes the exact assignment set, ignores another entity, and retries safely', async () => {
  await f.db.exec("INSERT INTO order_status_options(value) VALUES ('Draft'),('Fulfilled') ON CONFLICT(value) DO NOTHING; INSERT INTO assignment_probe_status_options(value) VALUES ('On Order'),('Ready to Enter Serial') ON CONFLICT(value) DO NOTHING;");
  const entity=await a.createRow('billing_entities',{name:'Fulfillment customer'});
  const field=await a.createRow('fields',{name:'Fulfillment field',billing_entity:[entity.id]});
  const fs=await a.createRow('field_seasons',{field:[field.id],season:2026});
  const pa=await a.createRow('probe_assignments',{field_season:[fs.id],probe_status:'On Order'});
  const extra=await a.createRow('probe_assignments',{field_season:[fs.id],probe_status:'On Order'});
  const unrelated=await a.createRow('probe_assignments',{field_season:[season.id],probe_status:'On Order'});
  const product=await a.createRow('products_services',{service_type:'CropX probe'});
  const order=await a.createRow('orders',{billing_entity:[entity.id],status:'Draft'});
  await a.createRow('order_items',{order_link:[order.id],product:[product.id],quantity:1,unit_price:100});
  const {POST}=f.load('app/api/orders/fulfill/route.ts');
  const payload={orderId:order.id,billingEntityId:entity.id,probeCount:1};
  assert.equal((await POST(f.request('/api/orders/fulfill',payload))).status,409);
  assert.equal((await a.getRow('probe_assignments',pa.id)).probe_status.value,'On Order');
  assert.equal((await POST(f.request('/api/orders/fulfill',{...payload,assignmentIds:[unrelated.id]}))).status,409);
  assert.equal((await POST(f.request('/api/orders/fulfill',{...payload,assignmentIds:[pa.id]}))).status,200);
  assert.equal((await a.getRow('probe_assignments',pa.id)).probe_status.value,'Ready to Enter Serial');
  assert.deepEqual(await a.getRow('probe_assignments',extra.id),extra);
  assert.deepEqual(await a.getRow('probe_assignments',unrelated.id),unrelated);
  assert.equal((await POST(f.request('/api/orders/fulfill',payload))).status,200);
  const supplies=await a.createRow('orders',{billing_entity:[entity.id],status:'Draft'});
  assert.equal((await POST(f.request('/api/orders/fulfill',{orderId:supplies.id,billingEntityId:entity.id}))).status,200);
  assert.deepEqual(await a.getRow('probe_assignments',extra.id),extra);
});
