// Grower login: farm name + PIN. Past customers and wrong PINs stay out.
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./harness.cjs');

process.env.DATABASE_URL_GROWER =
  'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';
process.env.AUTH_SECRET = 'fixture-only-not-production';
// Local QA shells may export GROWER_PILOT_*; keep fixture defaults deterministic.
delete process.env.GROWER_PILOT_OPERATION_IDS;
delete process.env.GROWER_PILOT_FARM_NAMES;

const a = f.load('lib/supabase/adapter.ts');
const {
  findGrowerFarmByName,
  hashGrowerPin,
  isGrowerPilotFarm,
  lookupGrowerLogin,
  verifyGrowerPin,
} = f.load('lib/supabase/grower-auth.ts');
const { __resetGrowerPoolForTests } = f.load('lib/supabase/grower.ts');
const { authorizeActor } = f.load('lib/supabase/api.ts');
const { DataError } = f.load('lib/supabase/registry.ts');
const { createGrowerSession, readGrowerSession } = f.load('lib/grower-session.ts');

let currentFarm, pastFarm, otherFarm, dupA, dupB;

test.before(async () => {
  await f.initialize();
  const { registry } = f.load('lib/supabase/registry.ts');
  for (const catalog of registry.catalogs) {
    await f.db.query(
      `INSERT INTO public."${catalog.name}" (value, color) VALUES ('Fixture', 'blue')`,
    );
  }
  await f.db.exec(`
    INSERT INTO contact_customer_type_options (value)
    VALUES ('Current Customer'), ('Past Customer');
  `);

  currentFarm = await a.createRow('operations', { name: 'Fishell Farms' });
  pastFarm = await a.createRow('operations', { name: 'Past Only Farm' });
  otherFarm = await a.createRow('operations', { name: 'Other Current Farm' });
  dupA = await a.createRow('operations', { name: 'Twin Farm' });
  dupB = await a.createRow('operations', { name: 'twin farm' });

  const pinHash = await hashGrowerPin('4242');
  await a.updateRow('operations', currentFarm.id, { grower_pin: pinHash });
  await a.updateRow('operations', pastFarm.id, { grower_pin: pinHash });
  await a.updateRow('operations', otherFarm.id, { grower_pin: pinHash });
  await a.updateRow('operations', dupA.id, { grower_pin: pinHash });
  await a.updateRow('operations', dupB.id, { grower_pin: pinHash });

  const be = await a.createRow('billing_entities', { name: 'Bill Current' });
  const beOther = await a.createRow('billing_entities', { name: 'Bill Other' });
  await a.createRow('contacts', {
    name: 'Current Contact',
    email: 'current@example.invalid',
    operations: [currentFarm.id],
    billing_entity: [be.id],
    customer_type: ['Current Customer'],
  });
  await a.createRow('contacts', {
    name: 'Past Contact',
    email: 'past@example.invalid',
    operations: [pastFarm.id],
    billing_entity: [be.id],
    customer_type: ['Past Customer'],
  });
  await a.createRow('contacts', {
    name: 'Other Contact',
    email: 'other@example.invalid',
    operations: [otherFarm.id],
    billing_entity: [beOther.id],
    customer_type: ['Current Customer'],
  });

  // Public DTO must not leak the hash.
  const publicOp = await a.getRow('operations', currentFarm.id);
  assert.equal(publicOp.grower_pin, undefined);
  assert.equal(publicOp.growerPinSet, true);
});

test.after(async () => {
  await f.db?.close();
});

test('correct farm name and PIN verify; wrong PIN fails', async () => {
  const farm = await lookupGrowerLogin('  fishell farms ');
  assert.equal(farm.id, currentFarm.id);
  assert.equal(farm.is_current_customer, true);
  assert.equal(await verifyGrowerPin(farm.grower_pin, '4242'), true);
  assert.equal(await verifyGrowerPin(farm.grower_pin, '0000'), false);
});

test('past-customer-only farm is refused even with the right PIN', async () => {
  const farm = await lookupGrowerLogin('Past Only Farm');
  assert.ok(farm);
  assert.equal(farm.is_current_customer, false);
  assert.equal(await verifyGrowerPin(farm.grower_pin, '4242'), true);
});

test('duplicate farm names refuse login lookup', async () => {
  assert.equal(await findGrowerFarmByName('Twin Farm'), null);
  assert.equal(await findGrowerFarmByName('twin farm'), null);
  assert.equal(await lookupGrowerLogin('Twin Farm'), null);
});

test('grower-auth login works with only DATABASE_URL_GROWER and AUTH_SECRET', async () => {
  const prevDb = process.env.DATABASE_URL;
  const prevAlt = process.env.DATABASE_URL_ALT;
  const prevGrower = process.env.DATABASE_URL_GROWER;
  const prevSecret = process.env.AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_ALT;
  process.env.DATABASE_URL_GROWER =
    'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';
  process.env.AUTH_SECRET = 'fixture-only-not-production';
  __resetGrowerPoolForTests();
  // Office pool may still be cached from fixture setup; clear it so login cannot
  // silently fall back through a stale DATABASE_URL connection.
  const dbPath = require.resolve('../../lib/supabase/database.ts');
  delete require.cache[dbPath];
  const growerPath = require.resolve('../../lib/supabase/grower.ts');
  delete require.cache[growerPath];
  const authPath = require.resolve('../../lib/supabase/grower-auth.ts');
  delete require.cache[authPath];
  const routePath = require.resolve('../../app/api/grower-auth/route.ts');
  delete require.cache[routePath];

  const { POST } = f.load('app/api/grower-auth/route.ts');
  const ok = await POST(
    f.request('/api/grower-auth', { farm: 'Fishell Farms', pin: '4242' }),
  );
  assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
  const body = await ok.json();
  assert.equal(body.operationId, currentFarm.id);

  if (prevDb === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = prevDb;
  if (prevAlt === undefined) delete process.env.DATABASE_URL_ALT;
  else process.env.DATABASE_URL_ALT = prevAlt;
  process.env.DATABASE_URL_GROWER = prevGrower;
  process.env.AUTH_SECRET = prevSecret;
  __resetGrowerPoolForTests();
  delete require.cache[dbPath];
  delete require.cache[growerPath];
  delete require.cache[authPath];
  delete require.cache[routePath];
});

test('grower session cookie round-trips; grower cannot call office APIs', async () => {
  const token = await createGrowerSession(currentFarm.id, 'Fishell Farms');
  const session = await readGrowerSession(token);
  assert.equal(session.operationId, currentFarm.id);
  assert.equal(session.name, 'Fishell Farms');

  assert.throws(
    () => authorizeActor(
      { kind: 'grower', operationId: currentFarm.id, name: 'Fishell Farms' },
      '/api/fields',
      'GET',
    ),
    (err) => err instanceof DataError && err.status === 403,
  );
  assert.doesNotThrow(() =>
    authorizeActor({ kind: 'public' }, '/api/grower-auth', 'POST'),
  );
});

test('pilot allow-list defaults to Fishell Farms only', () => {
  // Isolate from shell env (local QA may set GROWER_PILOT_*).
  const prevIds = process.env.GROWER_PILOT_OPERATION_IDS;
  const prevNames = process.env.GROWER_PILOT_FARM_NAMES;
  delete process.env.GROWER_PILOT_OPERATION_IDS;
  delete process.env.GROWER_PILOT_FARM_NAMES;
  try {
    assert.equal(isGrowerPilotFarm(currentFarm.id, 'Fishell Farms'), true);
    assert.equal(isGrowerPilotFarm(otherFarm.id, 'Other Current Farm'), false);
    process.env.GROWER_PILOT_OPERATION_IDS = String(otherFarm.id);
    assert.equal(isGrowerPilotFarm(otherFarm.id, 'Other Current Farm'), true);
    delete process.env.GROWER_PILOT_OPERATION_IDS;
  } finally {
    if (prevIds === undefined) delete process.env.GROWER_PILOT_OPERATION_IDS;
    else process.env.GROWER_PILOT_OPERATION_IDS = prevIds;
    if (prevNames === undefined) delete process.env.GROWER_PILOT_FARM_NAMES;
    else process.env.GROWER_PILOT_FARM_NAMES = prevNames;
  }
});

test('grower-auth route accepts Fishell and rejects past or non-pilot farms', async () => {
  const { POST } = f.load('app/api/grower-auth/route.ts');
  const ok = await POST(
    f.request('/api/grower-auth', { farm: 'Fishell Farms', pin: '4242' }),
  );
  assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
  const body = await ok.json();
  assert.equal(body.operationId, currentFarm.id);
  assert.ok(ok.headers.getSetCookie?.().some((c) => c.startsWith('acre-grower-supabase-v1='))
    || String(ok.headers.get('set-cookie') || '').includes('acre-grower-supabase-v1='));

  const past = await POST(
    f.request('/api/grower-auth', { farm: 'Past Only Farm', pin: '4242' }),
  );
  assert.equal(past.status, 401);

  const other = await POST(
    f.request('/api/grower-auth', { farm: 'Other Current Farm', pin: '4242' }),
  );
  assert.equal(other.status, 401);

  const bad = await POST(
    f.request('/api/grower-auth', { farm: 'Fishell Farms', pin: '9999' }),
  );
  assert.equal(bad.status, 401);
});

test('grower_username is a nullable case-insensitive login alias', async () => {
  const column = await f.db.query(`
    SELECT data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'operations'
       AND column_name = 'grower_username'
  `);
  assert.equal(column.rows.length, 1);
  assert.equal(column.rows[0].data_type, 'text');
  assert.equal(column.rows[0].is_nullable, 'YES');

  const index = await f.db.query(`
    SELECT indexdef
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'operations_grower_username_ci_uidx'
  `);
  assert.equal(index.rows.length, 1);
  assert.match(index.rows[0].indexdef, /UNIQUE/i);
  assert.match(index.rows[0].indexdef, /lower\(btrim\(grower_username\)\)/);
  assert.match(index.rows[0].indexdef, /grower_username IS NOT NULL/);
  assert.match(index.rows[0].indexdef, /btrim\(grower_username\) <> ''/);

  const priv = await f.db.query(`
    SELECT has_function_privilege('acre_grower', 'public.grower_login_lookup(text)', 'EXECUTE') AS grower,
           has_function_privilege('anon', 'public.grower_login_lookup(text)', 'EXECUTE') AS anon,
           has_function_privilege('authenticated', 'public.grower_login_lookup(text)', 'EXECUTE') AS authenticated,
           has_function_privilege('service_role', 'public.grower_login_lookup(text)', 'EXECUTE') AS service_role,
           has_table_privilege('acre_grower', 'public.operations', 'SELECT') AS can_select
  `);
  assert.equal(priv.rows[0].grower, true);
  assert.equal(priv.rows[0].anon, false);
  assert.equal(priv.rows[0].authenticated, false);
  assert.equal(priv.rows[0].service_role, false);
  assert.equal(priv.rows[0].can_select, false);
});

test('Fishell signs in with the username and the session still uses the farm name', async () => {
  await f.db.query(
    `UPDATE public.operations SET grower_username = 'Fishell' WHERE id = $1`,
    [currentFarm.id],
  );
  try {
    const stored = await f.db.query(
      `SELECT name, grower_username FROM public.operations WHERE id = $1`,
      [currentFarm.id],
    );
    assert.equal(stored.rows[0].name, 'Fishell Farms');
    assert.equal(stored.rows[0].grower_username, 'Fishell');

    const farm = await lookupGrowerLogin('  fishell ');
    assert.equal(farm.id, currentFarm.id);
    assert.equal(farm.name, 'Fishell Farms');
    assert.equal(farm.is_current_customer, true);
    assert.equal(await verifyGrowerPin(farm.grower_pin, '4242'), true);
    // A set username replaces the farm name as the login key.
    assert.equal(await lookupGrowerLogin('Fishell Farms'), null);
    assert.equal(isGrowerPilotFarm(farm.id, farm.name), true);

    const { POST } = f.load('app/api/grower-auth/route.ts');
    const ok = await POST(
      f.request('/api/grower-auth', { farm: 'Fishell', pin: '4242' }),
    );
    assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
    const body = await ok.json();
    assert.equal(body.operationId, currentFarm.id);
    assert.equal(body.name, 'Fishell Farms');

    const token = await createGrowerSession(body.operationId, body.name);
    const session = await readGrowerSession(token);
    assert.equal(session.operationId, currentFarm.id);
    assert.equal(session.name, 'Fishell Farms');

    await assert.rejects(
      () => f.db.query(
        `UPDATE public.operations SET grower_username = '  fishell  ' WHERE id = $1`,
        [otherFarm.id],
      ),
      (err) => /unique|duplicate/i.test(String(err && err.message)),
    );

    // Blank usernames do not take a login key and do not collide.
    await f.db.query(
      `UPDATE public.operations SET grower_username = '   ' WHERE id = $1`,
      [pastFarm.id],
    );
    await f.db.query(
      `UPDATE public.operations SET grower_username = '' WHERE id = $1`,
      [otherFarm.id],
    );
    const byName = await lookupGrowerLogin('Past Only Farm');
    assert.equal(byName.id, pastFarm.id);
    assert.equal(byName.name, 'Past Only Farm');

    // The same login key on two farms refuses both.
    await f.db.query(
      `UPDATE public.operations SET grower_username = 'Other Current Farm' WHERE id = $1`,
      [pastFarm.id],
    );
    assert.equal(await lookupGrowerLogin('Other Current Farm'), null);
    assert.equal(await lookupGrowerLogin('Past Only Farm'), null);
  } finally {
    await f.db.query(
      `UPDATE public.operations
          SET grower_username = NULL
        WHERE id IN ($1, $2, $3)`,
      [currentFarm.id, pastFarm.id, otherFarm.id],
    );
  }
});

test('username migration targets Fishell Farms by id or name and keeps grants', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/20261112234500_grower_username.sql'),
    'utf8',
  );
  assert.match(
    sql,
    /lower\(btrim\(coalesce\(nullif\(btrim\(o\.grower_username\), ''\), o\.name\)\)\)/,
  );
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.grower_login_lookup\(text\) TO acre_grower/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.grower_login_lookup\(text\)/);
  assert.match(sql, /WHERE id = 20/);
  assert.match(sql, /lower\(btrim\(name\)\) = 'fishell farms'/);

  await f.db.exec(sql);
  try {
    const named = await f.db.query(
      `SELECT name, grower_username FROM public.operations WHERE id = $1`,
      [currentFarm.id],
    );
    assert.equal(named.rows[0].name, 'Fishell Farms');
    assert.equal(named.rows[0].grower_username, 'Fishell');
    const byUser = await lookupGrowerLogin('Fishell');
    assert.equal(byUser.id, currentFarm.id);
    assert.equal(byUser.name, 'Fishell Farms');
  } finally {
    await f.db.query(
      `UPDATE public.operations SET grower_username = NULL WHERE id = $1`,
      [currentFarm.id],
    );
  }

  await f.db.query(`UPDATE public.operations SET name = 'Fishell Farms hold' WHERE id = $1`, [currentFarm.id]);
  await f.db.query(
    `INSERT INTO public.operations (id, name) OVERRIDING SYSTEM VALUE VALUES (20, 'Fishell Farms')`,
  );
  try {
    await f.db.exec(sql);
    const row = await f.db.query(
      `SELECT name, grower_username FROM public.operations WHERE id = 20`,
    );
    assert.equal(row.rows[0].name, 'Fishell Farms');
    assert.equal(row.rows[0].grower_username, 'Fishell');
    const held = await f.db.query(
      `SELECT name, grower_username FROM public.operations WHERE id = $1`,
      [currentFarm.id],
    );
    assert.equal(held.rows[0].name, 'Fishell Farms hold');
    assert.equal(held.rows[0].grower_username, null);
  } finally {
    await f.db.query(`DELETE FROM public.operations WHERE id = 20`);
    await f.db.query(
      `UPDATE public.operations SET name = 'Fishell Farms', grower_username = NULL WHERE id = $1`,
      [currentFarm.id],
    );
  }

  await f.db.query(
    `INSERT INTO public.operations (id, name) OVERRIDING SYSTEM VALUE VALUES (20, 'Different Farm')`,
  );
  try {
    await assert.rejects(() => f.db.exec(sql), /not Fishell Farms/);
    await f.db.exec('ROLLBACK').catch(() => {});
    const row = await f.db.query(
      `SELECT name, grower_username FROM public.operations WHERE id = 20`,
    );
    assert.equal(row.rows[0].name, 'Different Farm');
    assert.equal(row.rows[0].grower_username, null);
    const still = await lookupGrowerLogin('Fishell Farms');
    assert.equal(still.id, currentFarm.id);
    assert.equal(still.name, 'Fishell Farms');
  } finally {
    await f.db.query(`DELETE FROM public.operations WHERE id = 20`).catch(() => {});
  }
});
