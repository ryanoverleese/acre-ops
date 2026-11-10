// Grower field list: current-year fields for the signed-in farm only.
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./harness.cjs');

process.env.DATABASE_URL_GROWER =
  'postgresql://acre_grower:fixture-only@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres';

const a = f.load('lib/supabase/adapter.ts');
const {
  listGrowerFieldsForSeason,
  growerCurrentSeasonYear,
} = f.load('lib/supabase/grower-fields.ts');

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
