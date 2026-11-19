const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const { buildStaffMapFields, hasMapCoords } = f.load('app/map/staff-map-fields.ts');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const fields = [
  {
    id: 62,
    name: 'Adullam Pivot',
    lat: 40.637322,
    lng: -99.587759,
    acres: 158.17,
    billing_entity: [{ id: 1, value: '37 Ag, Inc.' }],
  },
  {
    id: 10,
    name: 'Current Season',
    lat: 40.7,
    lng: -99.2,
    acres: 80,
    billing_entity: [{ id: 1, value: '37 Ag, Inc.' }],
  },
  {
    id: 11,
    name: 'Season No Coords',
    acres: 40,
    billing_entity: [{ id: 2, value: 'Other' }],
  },
  {
    id: 12,
    name: 'Bounded No Coords',
    acres: 20,
    billing_entity: [{ id: 1, value: '37 Ag, Inc.' }],
  },
  {
    id: 13,
    name: 'No Season No Boundary',
    lat: 40.1,
    lng: -99.1,
    billing_entity: [{ id: 1, value: '37 Ag, Inc.' }],
  },
  {
    id: 14,
    name: 'Season And Boundary',
    lat: 40.8,
    lng: -99.3,
    acres: 90,
    billing_entity: [{ id: 3, value: 'Fishell Farms' }],
  },
];

const fieldSeasons = [
  { field: [{ id: 10, value: 'Current Season' }], crop: { id: 1, value: 'Corn' } },
  { field: [{ id: 11, value: 'Season No Coords' }], crop: { id: 2, value: 'Soybeans' } },
  { field: [{ id: 14, value: 'Season And Boundary' }], crop: { id: 1, value: 'Corn' } },
  { field: [{ id: 14, value: 'Season And Boundary' }], crop: { id: 3, value: 'Duplicate' } },
];

test('hasMapCoords rejects missing, zero, and non-numeric values', () => {
  assert.equal(hasMapCoords(40.6, -99.5), true);
  assert.equal(hasMapCoords('40.6', '-99.5'), true);
  assert.equal(hasMapCoords(0, -99.5), false);
  assert.equal(hasMapCoords(40.6, null), false);
  assert.equal(hasMapCoords(undefined, undefined), false);
  assert.equal(hasMapCoords('x', 'y'), false);
});

test('staff map includes every bounded field, including those with no current season', () => {
  const rows = buildStaffMapFields({
    fields,
    fieldSeasons,
    boundedFieldIds: [62, 12, 14],
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  assert.deepEqual([...byId.keys()].sort((a, b) => a - b), [10, 12, 14, 62]);

  const current = byId.get(10);
  assert.equal(current.name, 'Current Season');
  assert.equal(current.operation, '37 Ag, Inc.');
  assert.equal(current.crop, 'Corn');
  assert.equal(current.lat, 40.7);
  assert.equal(current.lng, -99.2);
  assert.equal(current.showPlacementPin, true);

  const adullam = byId.get(62);
  assert.equal(adullam.name, 'Adullam Pivot');
  assert.equal(adullam.operation, '37 Ag, Inc.');
  assert.equal(adullam.crop, undefined);
  assert.equal(adullam.lat, 40.637322);
  assert.equal(adullam.lng, -99.587759);
  assert.equal(adullam.showPlacementPin, false);
  assert.equal(adullam.acres, 158.17);

  const noCoords = byId.get(12);
  assert.equal(noCoords.name, 'Bounded No Coords');
  assert.equal(noCoords.lat, undefined);
  assert.equal(noCoords.lng, undefined);
  assert.equal(noCoords.showPlacementPin, false);

  const both = byId.get(14);
  assert.equal(both.crop, 'Corn'); // first season wins, same as before
  assert.equal(both.showPlacementPin, true);
  assert.equal(both.operation, 'Fishell Farms');

  assert.equal(byId.has(11), false); // season but no coords and no boundary
  assert.equal(byId.has(13), false); // no season, no boundary
});

test('staff map page loads all boundary field ids and draws them regardless of season', () => {
  const page = read('app/map/page.tsx');
  const client = read('app/map/MapClient.tsx');
  const unified = read('app/map/UnifiedMap.tsx');
  assert.match(page, /loadBoundedFieldIds/);
  assert.match(page, /boundedFieldIds=\{boundedFieldIds\}/);
  assert.match(client, /buildStaffMapFields/);
  assert.match(client, /boundedFieldIds/);
  assert.match(unified, /showPlacementPin === false/);
  assert.match(unified, /useFieldBoundaries\(fields\.map\(field => field\.id\)\)/);
});
