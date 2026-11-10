// Grower field list: current-year fields for the signed-in farm only.
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./harness.cjs');

process.env.DATABASE_URL_GROWER =
  'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';

const a = f.load('lib/supabase/adapter.ts');
const {
  listGrowerFieldsForSeason,
  getGrowerFieldDetail,
  growerCurrentSeasonYear,
} = f.load('lib/supabase/grower-fields.ts');
const { formatProbeAge, probeAgeSeasons } = f.load('lib/grower-display.ts');

let opA, opB, fieldA, fieldB, fieldShared, fieldNoSeason;

test.before(async () => {
  await f.initialize();
  const { registry } = f.load('lib/supabase/registry.ts');
  for (const catalog of registry.catalogs) {
    await f.db.query(
      `INSERT INTO public."${catalog.name}" (value, color) VALUES ('Fixture', 'blue')`,
    );
  }

  opA = await a.createRow('operations', { name: 'Farm A' });
  opB = await a.createRow('operations', { name: 'Farm B' });
  const beA = await a.createRow('billing_entities', { name: 'Bill A' });
  const beB = await a.createRow('billing_entities', { name: 'Bill B' });
  await a.createRow('contacts', {
    name: 'A',
    operations: [opA.id],
    billing_entity: [beA.id],
  });
  await a.createRow('contacts', {
    name: 'B',
    operations: [opB.id],
    billing_entity: [beB.id],
  });

  fieldA = await a.createRow('fields', {
    name: 'Alpha',
    acres: 80,
    billing_entity: [beA.id],
  });
  fieldB = await a.createRow('fields', {
    name: 'Bravo',
    billing_entity: [beB.id],
  });
  fieldShared = await a.createRow('fields', {
    name: 'Shared',
    acres: 40,
    billing_entity: [beA.id, beB.id],
  });
  fieldNoSeason = await a.createRow('fields', {
    name: 'No Season',
    billing_entity: [beA.id],
  });

  const year = growerCurrentSeasonYear();
  await a.createRow('field_seasons', { field: [fieldA.id], season: year });
  await a.createRow('field_seasons', { field: [fieldB.id], season: year });
  await a.createRow('field_seasons', { field: [fieldShared.id], season: year });
  await a.createRow('field_seasons', { field: [fieldA.id], season: year - 1 });

  await f.db.exec(`INSERT INTO assignment_probe_status_options (value) VALUES ('Installed')`);
  const probe = await a.createRow('probes', { serial_number: 'SN-ALPHA', year_new: year - 2 });
  const seasonA = (await f.db.query(
    'SELECT id FROM public.field_seasons WHERE field_id=$1 AND season=$2',
    [fieldA.id, year],
  )).rows[0];
  await a.createRow('probe_assignments', {
    field_season: [seasonA.id],
    probe: [probe.id],
    probe_number: 1,
    label: 'NE',
    probe_status: 'Installed',
    install_date: `${year}-04-01T12:00:00.000Z`,
    install_lat: 40.5,
    install_lng: -99.5,
    elevation: 2200,
    soil_type: 'Holdrege (Hs)',
  });
  const geom = {
    type: 'Polygon',
    coordinates: [[[-99.51, 40.49], [-99.51, 40.51], [-99.49, 40.51], [-99.49, 40.49], [-99.51, 40.49]]],
  };
  await f.db.query(
    `INSERT INTO public.field_boundaries
      (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source, source_observed_at)
     VALUES ($1, $2, $3::jsonb, $4, 'EPSG:4326', 'lonlat', 'cropx', now())`,
    [
      fieldA.id,
      '11111111-2222-3333-4444-555555555555',
      JSON.stringify(geom),
      'a'.repeat(64),
    ],
  );
  await a.createRow('water_recs', {
    field_season: [seasonA.id],
    date: `${year}-06-10`,
    recommendation: 'Hold water',
    suggested_water_day: 'Wednesday',
    report_type: 'full',
  });
  await a.createRow('water_recs', {
    field_season: [seasonA.id],
    date: `${year}-06-12`,
    recommendation: 'Updated to Friday',
    suggested_water_day: 'Friday',
    report_type: 'update',
  });
  await a.createRow('water_recs', {
    field_season: [seasonA.id],
    date: `${year}-06-11`,
    recommendation: 'Hidden overview',
    report_type: 'overview',
  });
});

test.after(async () => {
  await f.db?.close();
});

test('lists only this year’s fields for farm A', async () => {
  const year = growerCurrentSeasonYear();
  const rows = await listGrowerFieldsForSeason(opA.id, year);
  assert.deepEqual(
    rows.map((row) => row.name),
    ['Alpha', 'Shared'],
  );
  assert.ok(rows.every((row) => row.season === year));
  assert.ok(!rows.some((row) => row.id === fieldNoSeason.id));
  assert.ok(!rows.some((row) => row.id === fieldB.id));
});

test('farm B does not see farm A-only fields', async () => {
  const year = growerCurrentSeasonYear();
  const rows = await listGrowerFieldsForSeason(opB.id, year);
  assert.deepEqual(
    rows.map((row) => row.name),
    ['Bravo', 'Shared'],
  );
});

test('field detail includes boundary, probe pin, age, elevation, and soil', async () => {
  const year = growerCurrentSeasonYear();
  assert.equal(probeAgeSeasons(year - 2, year), 3);
  assert.equal(formatProbeAge(3), '3 seasons');

  const detail = await getGrowerFieldDetail(opA.id, fieldA.id, year);
  assert.equal(detail.name, 'Alpha');
  assert.equal(detail.boundaries.features.length, 1);
  assert.equal(detail.probes.length, 1);
  assert.equal(detail.probes[0].serial, 'SN-ALPHA');
  assert.equal(detail.probes[0].ageSeasons, 3);
  assert.equal(detail.probes[0].elevation, 2200);
  assert.equal(detail.probes[0].soilType, 'Holdrege (Hs)');
  assert.equal(detail.probes[0].lat, 40.5);
  assert.deepEqual(
    detail.waterRecs.map((rec) => rec.reportType),
    ['update', 'full'],
  );
  assert.equal(detail.waterRecs[0].recommendation, 'Updated to Friday');

  const denied = await getGrowerFieldDetail(opB.id, fieldA.id, year);
  assert.equal(denied, null);
});
