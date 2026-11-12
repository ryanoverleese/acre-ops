// Grower activity: acre_grower can append its own farm only, and office staff can read it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./harness.cjs');

process.env.DATABASE_URL_GROWER =
  'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';
process.env.AUTH_SECRET = 'fixture-only-not-production';
delete process.env.GROWER_PILOT_OPERATION_IDS;
delete process.env.GROWER_PILOT_FARM_NAMES;

const display = f.load('lib/grower-activity-display.ts');

test('page labels and Central time stay readable', () => {
  assert.equal(display.normalizeGrowerActivityPath('/grower/fields/12/?x=1'), '/grower/fields/12');
  assert.equal(display.normalizeGrowerActivityPath('https://evil.example/grower/fields'), null);
  assert.equal(display.normalizeGrowerActivityPath('/grower/login'), '/grower/login');
  assert.equal(display.isGrowerPageViewPath('/grower/fields'), true);
  assert.equal(display.isGrowerPageViewPath('/grower/hardware'), true);
  assert.equal(display.isGrowerPageViewPath('/grower/recommendations'), true);
  assert.equal(display.isGrowerPageViewPath('/grower/fields/9'), true);
  assert.equal(display.isGrowerPageViewPath('/grower/login'), false);
  assert.equal(display.fieldIdFromGrowerPath('/grower/fields/42'), 42);
  assert.equal(display.isPrefetchRequestHeaders((name) => (
    name === 'next-router-prefetch' ? '1' : null
  )), true);
  assert.equal(display.isPrefetchRequestHeaders(() => null), false);
  assert.equal(
    display.formatChicagoTime('2026-01-15T18:04:00.000Z'),
    'Jan 15, 2026, 12:04 PM CST',
  );
  assert.equal(display.describeGrowerActivity({
    eventType: 'page_view',
    path: '/grower/fields/7',
    fieldName: 'North Forty',
    fieldId: 7,
  }), 'Field · North Forty');
  assert.equal(display.describeGrowerActivity({
    eventType: 'page_view',
    path: '/grower/hardware',
    fieldName: null,
    fieldId: null,
  }), 'Probes');
  assert.equal(display.describeGrowerActivity({
    eventType: 'login',
    path: '/grower/login',
    fieldName: null,
    fieldId: null,
  }), 'Signed in');
  assert.equal(display.growerAccessPhrase(true, true), 'Pilot · PIN set');
  assert.equal(display.growerActivityCounts(1, 2), '1 sign-in · 2 page views');
  assert.equal(display.lastSignInPhrase(null), 'Has not signed in');
});

test('grower pages and the activity route are known, and prefetch is not the visit', () => {
  const root = path.resolve(__dirname, '../..');
  const middleware = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8');
  const chrome = fs.readFileSync(path.join(root, 'components/grower/GrowerChrome.tsx'), 'utf8');
  const beacon = fs.readFileSync(path.join(root, 'components/grower/GrowerActivityBeacon.tsx'), 'utf8');
  assert.match(middleware, /pathname === '\/api\/grower-activity'/);
  assert.match(chrome, /GrowerActivityBeacon/);
  assert.match(beacon, /keepalive:\s*true/);
  assert.equal(chrome.includes('GrowerActivityBeacon') && chrome.indexOf('grower/login') < chrome.indexOf('<GrowerActivityBeacon'), true);
});

test.describe('grower activity log', { concurrency: 1 }, () => {
  const a = f.load('lib/supabase/adapter.ts');
  const { withGrowerOperation, withGrowerRole, growerQuery } = f.load('lib/supabase/grower.ts');
  const { hashGrowerPin } = f.load('lib/supabase/grower-auth.ts');
  const { createGrowerSession } = f.load('lib/grower-session.ts');
  const { DataError } = f.load('lib/supabase/registry.ts');
  const { listGrowerActivityForOffice } = f.load('lib/supabase/grower-activity.ts');
  let farm;
  let other;
  let fieldA;
  let fieldB;

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
      VALUES ('Current Customer');
    `);

    farm = await a.createRow('operations', { name: 'Fishell Farms' });
    other = await a.createRow('operations', { name: 'Other Current Farm' });
    const pin = await hashGrowerPin('4242');
    await a.updateRow('operations', farm.id, { grower_pin: pin });
    await a.updateRow('operations', other.id, { grower_pin: pin });

    const billA = await a.createRow('billing_entities', { name: 'Bill Fishell' });
    const billB = await a.createRow('billing_entities', { name: 'Bill Other' });
    await a.createRow('contacts', {
      name: 'Fishell Contact',
      email: 'fishell@example.invalid',
      operations: [farm.id],
      billing_entity: [billA.id],
      customer_type: ['Current Customer'],
    });
    await a.createRow('contacts', {
      name: 'Other Contact',
      email: 'other@example.invalid',
      operations: [other.id],
      billing_entity: [billB.id],
      customer_type: ['Current Customer'],
    });
    fieldA = await a.createRow('fields', { name: 'North Forty', billing_entity: [billA.id] });
    fieldB = await a.createRow('fields', { name: 'Secret Field', billing_entity: [billB.id] });
  });

  test.after(async () => {
    await f.db?.close();
  });

  test('acre_grower can execute the logger and cannot read or write the table', async () => {
    const roles = ['anon', 'authenticated', 'service_role', 'acre_grower'];
    for (const role of roles) {
      const row = (await f.db.query(
        `SELECT has_table_privilege($1, 'public.grower_activity_log', 'SELECT') AS read,
                has_table_privilege($1, 'public.grower_activity_log', 'INSERT') AS insert,
                has_table_privilege($1, 'public.grower_activity_log', 'UPDATE') AS update,
                has_table_privilege($1, 'public.grower_activity_log', 'DELETE') AS delete,
                has_function_privilege($1, 'acre_private.log_grower_activity(text, text)', 'EXECUTE') AS exec,
                has_schema_privilege($1, 'acre_private', 'USAGE') AS usage`,
        [role],
      )).rows[0];
      assert.equal(row.read, false, role);
      assert.equal(row.insert, false, role);
      assert.equal(row.update, false, role);
      assert.equal(row.delete, false, role);
      assert.equal(row.exec, role === 'acre_grower', role);
      assert.equal(row.usage, role === 'acre_grower', role);
    }

    const rls = (await f.db.query(
      `SELECT c.relrowsecurity AS enabled
         FROM pg_class AS c
         JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'grower_activity_log'`,
    )).rows[0];
    assert.equal(rls.enabled, true);

    await assert.rejects(
      () => withGrowerOperation(farm.id, () =>
        growerQuery(
          `INSERT INTO public.grower_activity_log (operation_id, event_type) VALUES ($1, 'login')`,
          [farm.id],
        ),
      ),
      (err) => err instanceof DataError && err.status === 403,
    );
    await assert.rejects(
      () => withGrowerOperation(farm.id, () =>
        growerQuery('SELECT id FROM public.grower_activity_log'),
      ),
      (err) => err instanceof DataError && err.status === 403,
    );
  });

  test('a page view stores the field name only when that farm can see it', async () => {
    await withGrowerOperation(farm.id, () =>
      growerQuery(
        `SELECT acre_private.log_grower_activity('page_view', $1)`,
        [`/grower/fields/${fieldA.id}`],
      ),
    );
    await withGrowerOperation(farm.id, () =>
      growerQuery(
        `SELECT acre_private.log_grower_activity('page_view', $1)`,
        [`/grower/fields/${fieldB.id}`],
      ),
    );

    const rows = (await f.db.query(
      `SELECT operation_id, path, field_id, field_name
         FROM public.grower_activity_log
        WHERE event_type = 'page_view'
        ORDER BY id`,
    )).rows;
    assert.equal(rows.length, 2);
    assert.equal(Number(rows[0].operation_id), farm.id);
    assert.equal(Number(rows[0].field_id), fieldA.id);
    assert.equal(rows[0].field_name, 'North Forty');
    assert.equal(Number(rows[1].operation_id), farm.id);
    assert.equal(rows[1].field_id, null);
    assert.equal(rows[1].field_name, null);
    assert.match(rows[1].path, new RegExp(`/grower/fields/${fieldB.id}$`));
  });

  test('the same visit inside a few seconds is stored once', async () => {
    const before = Number((await f.db.query(
      `SELECT count(*)::int AS n FROM public.grower_activity_log WHERE path = '/grower/hardware'`,
    )).rows[0].n);
    await withGrowerOperation(farm.id, () =>
      growerQuery(`SELECT acre_private.log_grower_activity('page_view', '/grower/hardware')`),
    );
    await withGrowerOperation(farm.id, () =>
      growerQuery(`SELECT acre_private.log_grower_activity('page_view', '/grower/hardware')`),
    );
    const after = Number((await f.db.query(
      `SELECT count(*)::int AS n FROM public.grower_activity_log WHERE path = '/grower/hardware'`,
    )).rows[0].n);
    assert.equal(after - before, 1);
  });

  test('login requires the grower session and a known event', async () => {
    await assert.rejects(
      () => withGrowerRole((client) =>
        client.query(`SELECT acre_private.log_grower_activity('login', '/grower/login')`),
      ),
      (err) => err instanceof DataError && err.status === 403,
    );
    await assert.rejects(
      () => withGrowerOperation(farm.id, () =>
        growerQuery(`SELECT acre_private.log_grower_activity('nope', '/grower/fields')`),
      ),
      (err) => err instanceof DataError && err.status === 400,
    );
  });

  test('successful sign-in and sign-out are logged, and a bad PIN is not', async () => {
    const { POST, DELETE } = f.load('app/api/grower-auth/route.ts');
    const before = Number((await f.db.query(
      `SELECT count(*)::int AS n
         FROM public.grower_activity_log
        WHERE operation_id = $1 AND event_type = 'login'`,
      [farm.id],
    )).rows[0].n);

    const bad = await POST(f.request('/api/grower-auth', { farm: 'Fishell Farms', pin: '0000' }));
    assert.equal(bad.status, 401);
    const still = Number((await f.db.query(
      `SELECT count(*)::int AS n
         FROM public.grower_activity_log
        WHERE operation_id = $1 AND event_type = 'login'`,
      [farm.id],
    )).rows[0].n);
    assert.equal(still, before);

    f.failSql = (sql) => String(sql).includes('log_grower_activity');
    const survived = await POST(f.request('/api/grower-auth', { farm: 'Fishell Farms', pin: '4242' }));
    assert.equal(survived.status, 200);
    f.failSql = null;
    const duringFailure = Number((await f.db.query(
      `SELECT count(*)::int AS n
         FROM public.grower_activity_log
        WHERE operation_id = $1 AND event_type = 'login'`,
      [farm.id],
    )).rows[0].n);
    assert.equal(duringFailure, before);

    const ok = await POST(f.request('/api/grower-auth', { farm: 'Fishell Farms', pin: '4242' }));
    assert.equal(ok.status, 200);
    const logged = (await f.db.query(
      `SELECT path FROM public.grower_activity_log
        WHERE operation_id = $1 AND event_type = 'login'
        ORDER BY id DESC LIMIT 1`,
      [farm.id],
    )).rows[0];
    assert.equal(logged.path, '/grower/login');

    const token = await createGrowerSession(farm.id, 'Fishell Farms');
    f.cookies.set('acre-grower-supabase-v1', token);
    const out = await DELETE(f.request('/api/grower-auth', {}, 'DELETE'));
    assert.equal(out.status, 200);
    const logout = Number((await f.db.query(
      `SELECT count(*)::int AS n
         FROM public.grower_activity_log
        WHERE operation_id = $1 AND event_type = 'logout'`,
      [farm.id],
    )).rows[0].n);
    assert.equal(logout, 1);
  });

  test('a signed-in grower page view is recorded with the field name', async () => {
    const token = await createGrowerSession(farm.id, 'Fishell Farms');
    f.cookies.set('acre-grower-supabase-v1', token);
    const { POST } = f.load('app/api/grower-activity/route.ts');
    const { authorizeActor } = f.load('lib/supabase/api.ts');

    assert.throws(
      () => authorizeActor({ kind: 'public' }, '/api/grower-activity', 'POST'),
      (err) => err instanceof DataError && err.status === 401,
    );
    assert.doesNotThrow(() => authorizeActor(
      { kind: 'grower', operationId: farm.id, name: 'Fishell Farms' },
      '/api/grower-activity',
      'POST',
    ));
    assert.throws(
      () => authorizeActor(
        { kind: 'grower', operationId: farm.id, name: 'Fishell Farms' },
        '/api/fields',
        'GET',
      ),
      (err) => err instanceof DataError && err.status === 403,
    );

    f.cookies.delete('acre-grower-supabase-v1');
    const denied = await POST(f.request('/api/grower-activity', { path: '/grower/recommendations' }));
    assert.equal(denied.status, 401);

    f.cookies.set('acre-grower-supabase-v1', token);
    const prefetched = await POST(new Request('http://localhost/api/grower-activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'next-router-prefetch': '1',
      },
      body: JSON.stringify({ path: '/grower/recommendations' }),
    }));
    assert.equal(prefetched.status, 204);

    const unknown = await POST(f.request('/api/grower-activity', { path: '/grower/login' }));
    assert.equal(unknown.status, 400);

    const seen = await POST(f.request('/api/grower-activity', {
      path: `/grower/fields/${fieldA.id}`,
    }));
    assert.equal(seen.status, 204);

    const recs = Number((await f.db.query(
      `SELECT count(*)::int AS n FROM public.grower_activity_log WHERE path = '/grower/recommendations'`,
    )).rows[0].n);
    assert.equal(recs, 0);

    const report = await listGrowerActivityForOffice();
    const fishell = report.find((row) => row.id === farm.id);
    const outsider = report.find((row) => row.id === other.id);
    assert.equal(fishell.pilot, true);
    assert.equal(fishell.pinSet, true);
    assert.ok(fishell.loginCount >= 1);
    assert.ok(fishell.viewCount >= 1);
    assert.match(fishell.lastLoginLabel, /CST|CDT/);
    assert.ok(fishell.recent.some((event) => event.label === 'Field · North Forty'));
    assert.equal(outsider.pilot, false);
    assert.equal(outsider.pinSet, true);
    assert.equal(outsider.loginCount, 0);
    assert.equal(
      fishell.recent.some((event) => event.fieldName === 'Secret Field'),
      false,
    );
  });
});
