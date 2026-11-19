// Locked pivot snapshot saved with a water rec. Synthetic data, PGlite only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');

process.env.DATABASE_URL_GROWER =
  'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';

const a = f.load('lib/supabase/adapter.ts');
const lock = f.load('lib/valley/pivot-lock.ts');
const { getGrowerFieldDetail, growerCurrentSeasonYear } = f.load('lib/supabase/grower-fields.ts');
const root = path.join(__dirname, '..');
const year = growerCurrentSeasonYear();
const DATE = `${year}-07-14`;

let admin, opA, opB, fieldA, fieldB, seasonA, seasonB;
const reading = (over = {}) => ({
  serial: '4401', name: 'QA', angle: 135, power: 'ON', direction: 'FWD', isLateral: false,
  reportedLocalTime: null, observedAt: new Date(Date.now() - 10 * 60000).toISOString(), behind: false, ...over,
});

test.before(async () => {
  await f.initialize();
  const { registry } = f.load('lib/supabase/registry.ts');
  for (const catalog of registry.catalogs) {
    await f.db.query(`INSERT INTO public."${catalog.name}" (value, color) VALUES ('Fixture', 'blue')`);
  }
  await f.db.exec("INSERT INTO user_role_options(value) VALUES('admin');");
  admin = await a.createRow('users', { email: 'lock-qa@example.invalid', name: 'QA Admin', password_hash: 'fixture-hash', active: true, role: 'admin' });
  f.session = { user: { id: String(admin.id) } };
  opA = await a.createRow('operations', { name: 'Farm A' });
  opB = await a.createRow('operations', { name: 'Farm B' });
  const beA = await a.createRow('billing_entities', { name: 'Bill A' });
  const beB = await a.createRow('billing_entities', { name: 'Bill B' });
  await a.createRow('contacts', { name: 'A', operations: [opA.id], billing_entity: [beA.id] });
  await a.createRow('contacts', { name: 'B', operations: [opB.id], billing_entity: [beB.id] });
  fieldA = await a.createRow('fields', { name: 'Alpha', acres: 120, billing_entity: [beA.id] });
  fieldB = await a.createRow('fields', { name: 'Bravo', billing_entity: [beB.id] });
  seasonA = await a.createRow('field_seasons', { field: [fieldA.id], season: year });
  seasonB = await a.createRow('field_seasons', { field: [fieldB.id], season: year });
  await f.db.query('INSERT INTO field_valley_pivots(field_id,valley_username,serial) VALUES($1,$2,$3)', [fieldA.id, 'fixture-grower', '4401']);
  Object.assign(process.env, { VALLEY_READ_ONLY_ENABLED: 'true' });
});
test.after(async () => { await f.db?.close(); });

const bulk = (records, reportType = 'full') =>
  f.load('app/api/water-recs/bulk/route.ts').POST(f.request('/api/water-recs/bulk', { records, scopeFieldSeasons: records.map(r => r.field_season), reportType }));
const rec = (fsId, extra = {}) => ({ field_season: fsId, date: DATE, recommendation: 'Hold water', suggested_water_day: 'Friday', priority: false, report_type: 'full', ...extra });

test('migration: RLS on, no browser or grower grants on the table, grower view is SELECT-only', async () => {
  assert.equal((await f.db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.water_rec_pivot_snapshots'::regclass")).rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated', 'acre_grower']) {
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.equal((await f.db.query('SELECT has_table_privilege($1,$2,$3) AS ok', [role, 'public.water_rec_pivot_snapshots', priv])).rows[0].ok, false, `${role} ${priv}`);
    }
  }
  const view = (await f.db.query("SELECT has_table_privilege('acre_grower','public.grower_water_rec_pivot_snapshots','SELECT') AS r, has_table_privilege('acre_grower','public.grower_water_rec_pivot_snapshots','INSERT') AS w")).rows[0];
  assert.deepEqual(view, { r: true, w: false });
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await f.db.query("SELECT has_table_privilege($1,'public.grower_water_rec_pivot_snapshots','SELECT') AS ok", [role])).rows[0].ok, false);
  }
  const cols = (await f.db.query("SELECT column_name FROM information_schema.columns WHERE table_name='water_rec_pivot_snapshots' ORDER BY ordinal_position")).rows.map(r => r.column_name);
  assert.deepEqual(cols, ['water_rec_id', 'pivot_serial', 'arm_angle', 'pivot_on', 'captured_at', 'created_at']);
});

test('lock token: only this server, this field season and this date; tamper and age rejected', () => {
  const at = new Date().toISOString();
  const pivots = [{ serial: '4401', angle: 135, on: true }];
  const token = lock.signPivotLock(seasonA.id, DATE, at, pivots);
  assert.deepEqual(lock.verifyPivotLock(token, seasonA.id, DATE), { capturedAt: at, pivots });
  assert.equal(lock.verifyPivotLock(token, seasonB.id, DATE), null);
  assert.equal(lock.verifyPivotLock(token, seasonA.id, `${year}-07-15`), null);
  assert.equal(lock.verifyPivotLock(token, seasonA.id, DATE, Date.now() + 13 * 3600000), null);
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, fs: seasonA.id, d: DATE, at, p: [['4401', 10, false]] })).toString('base64url');
  assert.equal(lock.verifyPivotLock(`${forged}.${mac}`, seasonA.id, DATE), null);
  assert.equal(lock.verifyPivotLock(`${body}.${mac.slice(0, -2)}xx`, seasonA.id, DATE), null);
  assert.equal(lock.verifyPivotLock(lock.signPivotLock(seasonA.id, DATE, at, pivots, { AUTH_SECRET: 'other' }), seasonA.id, DATE), null);
  assert.equal(lock.verifyPivotLock({}, seasonA.id, DATE), null);
});

test('capture keeps only serial, angle and on/off; refuses stale, lateral, unknown-age and failed reads', async () => {
  const preview = await lock.capturePivotLock(seasonA.id, DATE, { read: async () => reading({ angle: 359.96, power: 'IDLE' }) });
  assert.deepEqual(preview.pivots, [{ serial: '4401', angle: 0, on: false }]);
  assert.deepEqual(Object.keys(preview).sort(), ['capturedAt', 'date', 'fieldSeasonId', 'pivots', 'token']);
  assert.ok(lock.verifyPivotLock(preview.token, seasonA.id, DATE));
  const fails = [
    reading({ behind: true }), reading({ observedAt: null }), reading({ isLateral: true }), reading({ angle: null }),
  ];
  for (const r of fails) await assert.rejects(lock.capturePivotLock(seasonA.id, DATE, { read: async () => r }), { status: 409 });
  await assert.rejects(lock.capturePivotLock(seasonA.id, DATE, { read: async () => { throw new Error('down'); } }), { status: 503 });
  await assert.rejects(lock.capturePivotLock(seasonB.id, DATE, { read: async () => reading() }), { status: 404 });
  process.env.VALLEY_READ_ONLY_ENABLED = 'false';
  try { await assert.rejects(lock.capturePivotLock(seasonA.id, DATE, { read: async () => reading() }), { status: 409 }); }
  finally { process.env.VALLEY_READ_ONLY_ENABLED = 'true'; }
});

test('pivot-lock route is POST only, staff only, and writes nothing', async () => {
  const route = f.load('app/api/water-recs/pivot-lock/route.ts');
  assert.equal(route.GET, undefined); assert.equal(route.PATCH, undefined); assert.equal(route.DELETE, undefined);
  f.session = null;
  assert.equal((await route.POST(f.request('/api/water-recs/pivot-lock', { field_season: seasonA.id, date: DATE }))).status, 401);
  f.session = { user: { id: String(admin.id) } };
  assert.throws(() => f.load('lib/supabase/api.ts').authorizeActor({ kind: 'crew', role: 'installer' }, '/api/water-recs/pivot-lock', 'POST'));
  assert.throws(() => f.load('lib/supabase/api.ts').authorizeActor({ kind: 'grower', operationId: 1, name: 'x' }, '/api/water-recs/pivot-lock', 'POST'));
  const src = fs.readFileSync(path.join(root, 'lib/valley/pivot-lock.ts'), 'utf8');
  const capture = src.slice(src.indexOf('export async function capturePivotLock'), src.indexOf('export async function snapshotForRec'));
  assert(!/INSERT|UPDATE|DELETE/.test(capture), 'capture must not write');
});

test('save stores the lock with the rec; later saves keep it fixed; bad lock never blocks the rec', async () => {
  const at1 = new Date(Date.now() - 60000).toISOString();
  const t1 = lock.signPivotLock(seasonA.id, DATE, at1, [{ serial: '4401', angle: 135, on: true }]);
  let res = await bulk([rec(seasonA.id, { pivot_lock: t1 })]);
  assert.equal(res.status, 200);
  let data = await res.json();
  assert.equal(data.pivotLocks[seasonA.id].status, 'saved');
  const recId = data.createdIds[0];
  let rows = (await f.db.query('SELECT pivot_serial, arm_angle::float8 AS a, pivot_on, captured_at FROM water_rec_pivot_snapshots WHERE water_rec_id=$1', [recId])).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].a, 135); assert.equal(rows[0].pivot_on, true);
  assert.equal(new Date(rows[0].captured_at).toISOString(), at1);

  // Edit the rec text and send a NEW lock: same rec id, original snapshot kept.
  const t2 = lock.signPivotLock(seasonA.id, DATE, new Date().toISOString(), [{ serial: '4401', angle: 270, on: false }]);
  res = await bulk([rec(seasonA.id, { recommendation: 'Water Friday', pivot_lock: t2 })]);
  data = await res.json();
  assert.equal(data.createdIds[0], recId);
  assert.equal(data.pivotLocks[seasonA.id].status, 'kept');
  assert.deepEqual(data.pivotLocks[seasonA.id].pivots, [{ serial: '4401', angle: 135, on: true }]);
  rows = (await f.db.query('SELECT arm_angle::float8 AS a FROM water_rec_pivot_snapshots WHERE water_rec_id=$1', [recId])).rows;
  assert.deepEqual(rows, [{ a: 135 }]);

  // Plain save without a lock leaves it alone.
  data = await (await bulk([rec(seasonA.id, { recommendation: 'Water Saturday' })])).json();
  assert.equal(data.pivotLocks, undefined);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM water_rec_pivot_snapshots WHERE water_rec_id=$1', [recId])).rows[0].n, 1);

  // Database refuses to change a saved snapshot.
  await assert.rejects(f.db.query('UPDATE water_rec_pivot_snapshots SET arm_angle = 10 WHERE water_rec_id=$1', [recId]));

  // Forged or wrong-field lock: rec saves, lock reported invalid, nothing stored.
  res = await bulk([rec(seasonB.id, { pivot_lock: t1 })]);
  data = await res.json();
  assert.equal(res.status, 200); assert.equal(data.created, 1);
  assert.equal(data.pivotLocks[seasonB.id].status, 'invalid');
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM water_rec_pivot_snapshots WHERE water_rec_id=$1', [data.createdIds[0]])).rows[0].n, 0);

  // Update (late-week) saves never take a lock.
  const t3 = lock.signPivotLock(seasonA.id, DATE, new Date().toISOString(), [{ serial: '4401', angle: 90, on: true }]);
  data = await (await bulk([rec(seasonA.id, { report_type: 'update', recommendation: 'Updated to Friday', pivot_lock: t3 })], 'update')).json();
  assert.equal(data.pivotLocks, undefined);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM water_rec_pivot_snapshots WHERE water_rec_id=$1', [data.createdIds[0]])).rows[0].n, 0);
});

test('grower field page: own farm sees locked icons per rec; other farm sees nothing', async () => {
  const detail = await getGrowerFieldDetail(opA.id, fieldA.id, year);
  const full = detail.waterRecs.find(r => r.reportType === 'full' && r.date === DATE);
  assert.deepEqual(full.pivots, [{ angle: 135, on: true }]);
  const update = detail.waterRecs.find(r => r.reportType === 'update');
  assert.equal(update.pivots, undefined);
  assert.equal(await getGrowerFieldDetail(opB.id, fieldA.id, year), null);
  // Farm B's own field has a rec without a lock: no icon data.
  const other = await getGrowerFieldDetail(opB.id, fieldB.id, year);
  assert.ok(other.waterRecs.length >= 1);
  assert(other.waterRecs.every(r => r.pivots === undefined));
  // Farm B cannot read Farm A snapshots through the grower view.
  const { withGrowerOperation, growerQuery } = f.load('lib/supabase/grower.ts');
  const seen = await withGrowerOperation(opB.id, () => growerQuery('SELECT water_rec_id FROM public.grower_water_rec_pivot_snapshots'));
  assert.deepEqual(seen, []);
  const own = await withGrowerOperation(opA.id, () => growerQuery('SELECT * FROM public.grower_water_rec_pivot_snapshots'));
  assert.equal(own.length, 1);
  assert.deepEqual(Object.keys(own[0]).sort(), ['arm_angle', 'captured_at', 'pivot_index', 'pivot_on', 'water_rec_id']);
});

test('deleting a rec deletes its snapshot', async () => {
  const day = `${year}-07-20`;
  const t = lock.signPivotLock(seasonA.id, day, new Date().toISOString(), [{ serial: '4401', angle: 45, on: true }]);
  const data = await (await bulk([{ ...rec(seasonA.id, { pivot_lock: t }), date: day }])).json();
  assert.equal(data.pivotLocks[seasonA.id].status, 'saved');
  await a.deleteRow('water_recs', data.createdIds[0]);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM water_rec_pivot_snapshots WHERE water_rec_id=$1', [data.createdIds[0]])).rows[0].n, 0);
});

test('grower views never read live Valley status', () => {
  const files = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p); } };
  walk(path.join(root, 'app/grower'));
  files.push(path.join(root, 'lib/supabase/grower-fields.ts'), path.join(root, 'components/grower/GrowerPivotIcon.tsx'));
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert(!/lib\/valley\/(client|service|pivot-lock)['"]|\/api\/valley\//.test(src), `${path.relative(root, file)} must not reach live Valley`);
  }
  assert(!fs.existsSync(path.join(root, 'lib/valley/grower.ts')));
});

// Last: simulates production before the migration is applied.
test('without the snapshot migration, recs still save and pages still load', async () => {
  await f.db.exec('DROP VIEW public.grower_water_rec_pivot_snapshots; DROP TABLE public.water_rec_pivot_snapshots;');
  const t = lock.signPivotLock(seasonA.id, DATE, new Date().toISOString(), [{ serial: '4401', angle: 45, on: true }]);
  const res = await bulk([rec(seasonA.id, { recommendation: 'Still saves', pivot_lock: t })]);
  const data = await res.json();
  assert.equal(res.status, 200); assert.equal(data.created, 1);
  assert.equal(data.pivotLocks[seasonA.id].status, 'failed');
  assert.equal((await f.db.query('SELECT recommendation FROM water_recs WHERE id=$1', [data.createdIds[0]])).rows[0].recommendation, 'Still saves');
  assert.deepEqual(await lock.loadRecPivotSnapshots(), {});
  const detail = await getGrowerFieldDetail(opA.id, fieldA.id, year);
  assert.ok(detail.waterRecs.length >= 1);
  assert(detail.waterRecs.every(r => r.pivots === undefined));
});

test('step 1 live icon: age label from device report time, and it reuses the cached badge reading', () => {
  const { liveAgeLabel } = f.load('lib/valley/pivot-lock-types.ts');
  const now = Date.parse('2026-11-19T15:00:00Z');
  const ago = m => new Date(now - m * 60000).toISOString();
  assert.equal(liveAgeLabel(ago(0.2), false, now), 'Live, just now');
  assert.equal(liveAgeLabel(ago(4), false, now), 'Live, 4 min ago');
  assert.equal(liveAgeLabel(ago(95), false, now), 'Live, 1 hr 35 min ago (old reading)');
  assert.equal(liveAgeLabel(ago(10), true, now), 'Live, 10 min ago (old reading)');
  assert.equal(liveAgeLabel(null, false, now), 'Live, age unknown');
  assert.equal(liveAgeLabel(ago(4), false, undefined), 'Live, age unknown');
  assert.equal(liveAgeLabel(ago(-30), false, now), 'Live, age unknown');
  const src = fs.readFileSync(path.join(root, 'app/water-recs/WaterRecsClient.tsx'), 'utf8');
  // No new Valley request path: the preview reads valley.fields from useValleyPivots (5-minute server cache).
  assert(!src.includes('/api/valley/'));
  assert(/<LivePivotPreview status=\{valley\.fields\[field\.fieldId\]\} now=\{valley\.now\} \/>/.test(src));
});
