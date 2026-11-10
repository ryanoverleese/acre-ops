// Grower read lock: farm A cannot read farm B through grower_* views.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const f = require('./harness.cjs');

process.env.DATABASE_URL_GROWER =
  'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';

const a = f.load('lib/supabase/adapter.ts');
const { withGrowerOperation, growerQuery, growerDatabaseConfig } =
  f.load('lib/supabase/grower.ts');
const { DataError } = f.load('lib/supabase/registry.ts');

function polygon() {
  return {
    type: 'Polygon',
    coordinates: [[
      [-99.1, 40.1], [-99.1, 40.2], [-99.0, 40.2], [-99.0, 40.1], [-99.1, 40.1],
    ]],
  };
}

function geometrySha(geom) {
  return crypto.createHash('sha256').update(JSON.stringify(geom)).digest('hex');
}

let opA, opB, beA, beB, fieldA, fieldB, fieldShared, fieldTrap, seasonA, seasonB, seasonShared;

test.before(async () => {
  await f.initialize();
  const { registry } = f.load('lib/supabase/registry.ts');
  for (const catalog of registry.catalogs) {
    await f.db.query(
      `INSERT INTO public."${catalog.name}" (value, color) VALUES ('Fixture', 'blue')`,
    );
  }
  await f.db.exec(`
    INSERT INTO assignment_probe_status_options (value) VALUES ('Installed');
    INSERT INTO contact_customer_type_options (value) VALUES ('Current Customer'), ('Past Customer');
  `);

  opA = await a.createRow('operations', { name: 'Farm A' });
  opB = await a.createRow('operations', { name: 'Farm B' });
  beA = await a.createRow('billing_entities', { name: 'Bill A' });
  beB = await a.createRow('billing_entities', { name: 'Bill B' });

  const contactA = await a.createRow('contacts', {
    name: 'Contact A',
    email: 'a@example.invalid',
    operations: [opA.id],
    billing_entity: [beA.id],
    customer_type: ['Current Customer'],
  });
  const contactB = await a.createRow('contacts', {
    name: 'Contact B',
    email: 'b@example.invalid',
    operations: [opB.id],
    billing_entity: [beB.id],
    customer_type: ['Current Customer'],
  });
  assert.ok(contactA.id && contactB.id);

  fieldA = await a.createRow('fields', {
    name: 'Field A Only',
    billing_entity: [beA.id],
    lat: 40.11,
    lng: -99.11,
    elevation: 2100,
    soil_type: 'Holdrege (Hs)',
  });
  fieldB = await a.createRow('fields', {
    name: 'Field B Only',
    billing_entity: [beB.id],
    lat: 40.22,
    lng: -99.22,
  });
  fieldShared = await a.createRow('fields', {
    name: 'Shared Field',
    billing_entity: [beA.id, beB.id],
  });
  // Join says B only; deprecated scalar points at A — grower lock must ignore the scalar.
  fieldTrap = await a.createRow('fields', {
    name: 'Trap Field',
    billing_entity: [beB.id],
  });
  await f.db.query(
    'UPDATE public.fields SET billing_entity_id = $1 WHERE id = $2',
    [beA.id, fieldTrap.id],
  );

  seasonA = await a.createRow('field_seasons', { field: [fieldA.id], season: 2026 });
  seasonB = await a.createRow('field_seasons', { field: [fieldB.id], season: 2026 });
  seasonShared = await a.createRow('field_seasons', { field: [fieldShared.id], season: 2026 });

  const probe = await a.createRow('probes', {
    serial_number: 'SN-A-1',
    year_new: 2024,
  });
  await a.createRow('probe_assignments', {
    field_season: [seasonA.id],
    probe: [probe.id],
    probe_number: 1,
    label: 'NE',
    probe_status: 'Installed',
    install_date: '2026-04-01T12:00:00.000Z',
    install_lat: 40.111,
    install_lng: -99.111,
  });
  await a.createRow('water_recs', {
    field_season: [seasonA.id],
    date: '2026-06-01',
    recommendation: 'Hold water',
    suggested_water_day: 'Wednesday',
    report_type: 'full',
  });
  await a.createRow('water_recs', {
    field_season: [seasonB.id],
    date: '2026-06-01',
    recommendation: 'B only secret',
    report_type: 'full',
  });

  const geom = polygon();
  await f.db.query(
    `INSERT INTO public.field_boundaries
      (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source, source_observed_at)
     VALUES ($1, $2, $3::jsonb, $4, 'EPSG:4326', 'lonlat', 'cropx', now())`,
    [
      fieldA.id,
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      JSON.stringify(geom),
      geometrySha(geom),
    ],
  );
});

test.after(async () => {
  await f.db?.close();
});

test('growerDatabaseConfig accepts only acre_grower on the acre-ops project', () => {
  const ok = growerDatabaseConfig(
    'postgresql://acre_grower:secret@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres',
  );
  assert.equal(ok.user, 'acre_grower');
  assert.throws(
    () => growerDatabaseConfig(
      'postgresql://postgres:secret@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres',
    ),
    (err) => err instanceof DataError,
  );
});

test('farm A sees only its fields; farm B cannot read farm A by id', async () => {
  const aFields = await withGrowerOperation(opA.id, () =>
    growerQuery('SELECT id, name FROM public.grower_fields ORDER BY id'),
  );
  assert.deepEqual(
    aFields.map((row) => row.name).sort(),
    ['Field A Only', 'Shared Field'],
  );

  const bSeesA = await withGrowerOperation(opB.id, () =>
    growerQuery('SELECT id, name FROM public.grower_fields WHERE id = $1', [fieldA.id]),
  );
  assert.equal(bSeesA.length, 0);

  const bFields = await withGrowerOperation(opB.id, () =>
    growerQuery('SELECT name FROM public.grower_fields ORDER BY name'),
  );
  assert.deepEqual(
    bFields.map((row) => row.name),
    ['Field B Only', 'Shared Field', 'Trap Field'],
  );
});

test('fields.billing_entity_id is ignored; join alone decides visibility', async () => {
  const aTrap = await withGrowerOperation(opA.id, () =>
    growerQuery('SELECT name FROM public.grower_fields WHERE id = $1', [fieldTrap.id]),
  );
  assert.equal(aTrap.length, 0, 'scalar billing_entity_id pointing at A must not grant access');

  const bTrap = await withGrowerOperation(opB.id, () =>
    growerQuery('SELECT name FROM public.grower_fields WHERE id = $1', [fieldTrap.id]),
  );
  assert.equal(bTrap[0]?.name, 'Trap Field');
});

test('shared billing links make a field visible to both farms', async () => {
  for (const op of [opA.id, opB.id]) {
    const rows = await withGrowerOperation(op, () =>
      growerQuery('SELECT name FROM public.grower_fields WHERE id = $1', [fieldShared.id]),
    );
    assert.equal(rows[0]?.name, 'Shared Field');
  }
});

test('farm A cannot read farm B water recs or probe rows', async () => {
  const water = await withGrowerOperation(opA.id, () =>
    growerQuery(
      'SELECT recommendation FROM public.grower_water_recs ORDER BY field_season_id',
    ),
  );
  assert.deepEqual(water.map((row) => row.recommendation), ['Hold water']);

  const probes = await withGrowerOperation(opA.id, () =>
    growerQuery(
      'SELECT probe_serial_number, probe_year_new, label FROM public.grower_probe_assignments',
    ),
  );
  assert.equal(probes.length, 1);
  assert.equal(probes[0].probe_serial_number, 'SN-A-1');
  assert.equal(probes[0].probe_year_new, 2024);
  assert.equal(probes[0].label, 'NE');

  const bWaterAsA = await withGrowerOperation(opA.id, () =>
    growerQuery(
      'SELECT recommendation FROM public.grower_water_recs WHERE field_season_id = $1',
      [seasonB.id],
    ),
  );
  assert.equal(bWaterAsA.length, 0);
});

test('farm A can read its boundary and not farm B base tables', async () => {
  const bounds = await withGrowerOperation(opA.id, () =>
    growerQuery('SELECT field_id FROM public.grower_field_boundaries'),
  );
  assert.deepEqual(bounds.map((row) => Number(row.field_id)), [fieldA.id]);

  await assert.rejects(
    () => withGrowerOperation(opA.id, () =>
      growerQuery('SELECT id FROM public.fields LIMIT 1'),
    ),
    (err) => err instanceof DataError && err.status === 403,
  );
  await assert.rejects(
    () => withGrowerOperation(opA.id, () =>
      growerQuery('SELECT id FROM public.water_recs LIMIT 1'),
    ),
    (err) => err instanceof DataError && err.status === 403,
  );
});

test('unset grower operation id yields no rows even for the owner role path', async () => {
  // Direct view read with no setting — empty. Uses the fixture db as owner.
  const empty = await f.db.query('SELECT id FROM public.grower_fields');
  assert.equal(empty.rows.length, 0);
});
