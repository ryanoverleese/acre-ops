// Staff "All operations" view stays admin-only; grower sessions stay on their own farm.
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./harness.cjs');

process.env.DATABASE_URL_GROWER =
  'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';
process.env.AUTH_SECRET = 'fixture-only-not-production';

const a = f.load('lib/supabase/adapter.ts');
const { listGrowerFieldsForSeason, getGrowerFieldDetail, growerCurrentSeasonYear } =
  f.load('lib/supabase/grower-fields.ts');
const { readForGrowerScope } = f.load('lib/supabase/grower-admin.ts');
const { createGrowerSession, readGrowerSession } = f.load('lib/grower-session.ts');
const { fieldOperationFor, isAllOperationsSession } = f.load('lib/grower-scope.ts');

// Sign an arbitrary payload the same way the app does (simulates a forged-but-signed cookie shape).
async function sign(obj) {
  const { webcrypto } = require('node:crypto');
  const enc = new TextEncoder();
  const payload = encodeURIComponent(JSON.stringify(obj));
  const key = await webcrypto.subtle.importKey('raw', enc.encode(process.env.AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = Buffer.from(await webcrypto.subtle.sign('HMAC', key, enc.encode(payload))).toString('hex');
  return `${payload}.${mac}`;
}

let opA, opB, fieldA, fieldB;
const year = growerCurrentSeasonYear();

test.before(async () => {
  await f.initialize();
  const { registry } = f.load('lib/supabase/registry.ts');
  for (const catalog of registry.catalogs) {
    await f.db.query(`INSERT INTO public."${catalog.name}" (value, color) VALUES ('Fixture', 'blue')`);
  }
  await f.db.exec(`INSERT INTO contact_customer_type_options (value) VALUES ('Current Customer')`);
  opA = await a.createRow('operations', { name: 'Farm A' });
  opB = await a.createRow('operations', { name: 'Farm B' });
  const beA = await a.createRow('billing_entities', { name: 'Bill A' });
  const beB = await a.createRow('billing_entities', { name: 'Bill B' });
  const cA = await a.createRow('contacts', { name: 'A', operations: [opA.id], billing_entity: [beA.id] });
  const cB = await a.createRow('contacts', { name: 'B', operations: [opB.id], billing_entity: [beB.id] });
  for (const c of [cA, cB]) {
    await f.db.query(
      `INSERT INTO contact_customer_types (contact_id, customer_type_id)
       SELECT $1, id FROM contact_customer_type_options WHERE value = 'Current Customer'`,
      [c.id],
    );
  }
  fieldA = await a.createRow('fields', { name: 'Alpha', billing_entity: [beA.id] });
  fieldB = await a.createRow('fields', { name: 'Bravo', billing_entity: [beB.id] });
  await a.createRow('field_seasons', { field: [fieldA.id], season: year });
  await a.createRow('field_seasons', { field: [fieldB.id], season: year });
});

test.after(() => f.close?.());

test('all flag is ignored without admin, and operationId 0 needs it', async () => {
  // createGrowerSession drops all without admin.
  const plain = await readGrowerSession(await createGrowerSession(opA.id, 'Farm A', { all: true }));
  assert.equal(plain.operationId, opA.id);
  assert.equal(plain.all, undefined);
  assert.equal(isAllOperationsSession(plain), false);
  // A signed grower payload carrying all: true (no admin) is still a single-farm session.
  const forged = await readGrowerSession(await sign({ operationId: opA.id, name: 'Farm A', all: true, expires: Date.now() + 60000 }));
  assert.equal(forged.all, undefined);
  // operationId 0 without admin+all is not a session at all.
  assert.equal(await readGrowerSession(await sign({ operationId: 0, name: 'x', expires: Date.now() + 60000 })), null);
  assert.equal(await readGrowerSession(await sign({ operationId: 0, name: 'x', all: true, expires: Date.now() + 60000 })), null);
  const staffAll = await readGrowerSession(await createGrowerSession(0, 'All operations', { admin: true, all: true }));
  assert.equal(isAllOperationsSession(staffAll), true);
});

test('grower session cannot reach another farm through ?op or the scope reader', async () => {
  const grower = await readGrowerSession(await createGrowerSession(opA.id, 'Farm A'));
  assert.equal(fieldOperationFor(grower, String(opB.id)), opA.id);
  assert.equal(fieldOperationFor(grower, [String(opB.id)]), opA.id);
  // Field page for Farm B's field, read as the grower's own farm, is not found.
  assert.equal(await getGrowerFieldDetail(fieldOperationFor(grower, String(opB.id)), fieldB.id, year), null);
  assert.ok(await getGrowerFieldDetail(opA.id, fieldA.id, year));

  const scoped = await readForGrowerScope(grower, (op) => listGrowerFieldsForSeason(op, year));
  assert.equal(scoped.parts.length, 1);
  assert.deepEqual(scoped.parts[0].value.map((row) => row.name), ['Alpha']);

  // Single-farm staff view behaves the same.
  const staffOne = await readGrowerSession(await createGrowerSession(opA.id, 'Farm A', { admin: true }));
  assert.equal(fieldOperationFor(staffOne, String(opB.id)), opA.id);
});

test('staff All operations reads every current customer, farm by farm', async () => {
  const staffAll = await readGrowerSession(await createGrowerSession(0, 'All operations', { admin: true, all: true }));
  assert.equal(fieldOperationFor(staffAll, String(opB.id)), opB.id);
  assert.equal(fieldOperationFor(staffAll, 'abc'), null);
  assert.equal(fieldOperationFor(staffAll, undefined), null);
  const scoped = await readForGrowerScope(staffAll, (op) => listGrowerFieldsForSeason(op, year));
  assert.equal(scoped.failed, 0);
  const byFarm = Object.fromEntries(scoped.parts.map((p) => [p.operation.name, p.value.map((row) => row.name)]));
  assert.deepEqual(byFarm, { 'Farm A': ['Alpha'], 'Farm B': ['Bravo'] });
});
