const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const soils = f.load('lib/soils/ssurgo.ts');

const root = path.join(__dirname, '..');
const square = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];

test('bbox key snaps outward, round-trips, and rejects bad or huge boxes', () => {
  const box = soils.soilBboxForField(square(-99.05, 40.52, -99.04, 40.53), 0.35);
  const key = soils.soilBboxKey(box);
  assert.match(key, /^-99\.05\d,40\.51\d,-99\.03\d,40\.53\d$/);
  const parsed = soils.parseSoilBboxKey(key);
  assert.ok(parsed.w <= box.w && parsed.e >= box.e && parsed.s <= box.s && parsed.n >= box.n);
  assert.equal(soils.parseSoilBboxKey('-99.050,40.510,-99.000,40.500'), null); // inverted
  assert.equal(soils.parseSoilBboxKey('-99.500,40.000,-99.000,40.400'), null); // too large
  assert.equal(soils.parseSoilBboxKey("-99.05,40.51,-99.03,40.53);DROP"), null);
  assert.equal(soils.parseSoilBboxKey('1,2,3,4'), null);
});

test('WKT polygons, multipolygons and collections parse; lines are dropped', () => {
  assert.equal(soils.parseWktPolygons('POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))').length, 1);
  const multi = soils.parseWktPolygons('MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((2 2, 3 2, 3 3, 2 2), (2.1 2.1, 2.2 2.1, 2.2 2.2, 2.1 2.1)))');
  assert.equal(multi.length, 2);
  assert.equal(multi[1].length, 2); // outer + hole
  assert.deepEqual(multi[0][0][1], [1, 0]);
  const gc = soils.parseWktPolygons('GEOMETRYCOLLECTION (LINESTRING (0 0, 1 1), POLYGON ((0 0, 1 0, 1 1, 0 0)))');
  assert.equal(gc.length, 1);
  assert.deepEqual(soils.parseWktPolygons('GEOMETRYCOLLECTION EMPTY'), []);
});

test('ring clipping keeps the part inside the box', () => {
  const ring = soils.clipRingToBox(square(-1, -1, 2, 2)[0], { w: 0, s: 0, e: 1, n: 1 });
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  assert.equal(Math.min(...xs), 0); assert.equal(Math.max(...xs), 1);
  assert.equal(Math.min(...ys), 0); assert.equal(Math.max(...ys), 1);
  assert.deepEqual(soils.clipRingToBox(square(5, 5, 6, 6)[0], { w: 0, s: 0, e: 1, n: 1 }), []);
});

test('field shares follow the soil split inside the field', () => {
  const field = [square(0, 0, 1, 1)];
  const features = [
    { mukey: 'A', polygons: [square(-1, -1, 0.25, 2)] }, // west quarter
    { mukey: 'B', polygons: [square(0.25, -1, 2, 2)] }, // the rest
  ];
  const shares = soils.soilShares(field, features, 80);
  assert.ok(Math.abs(shares.get('A') - 0.25) < 0.02, String(shares.get('A')));
  assert.ok(Math.abs(shares.get('B') - 0.75) < 0.02, String(shares.get('B')));
});

test('label point lands inside the polygon, away from a notch', () => {
  // L-shaped polygon; centroid would fall in the notch.
  const poly = [[[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3], [0, 0]]];
  const at = soils.labelPoint(poly);
  assert.ok(soils.pointInPolygon(at[0], at[1], poly));
});

test('buildSoilMap merges polygons per map unit', () => {
  const map = soils.buildSoilMap('sda', { w: 0, s: 0, e: 3, n: 3 }, [
    { mukey: '1', musym: '3820', muname: 'Holdrege silt loam, 0 to 1 percent slopes', polygons: [square(0, 0, 1, 1)] },
    { mukey: '1', musym: '3820', muname: 'Holdrege silt loam, 0 to 1 percent slopes', polygons: [square(2, 2, 3, 3)] },
    { mukey: '2', musym: '3824', muname: 'Holdrege silt loam, 1 to 3 percent slopes', polygons: [] },
  ]);
  assert.equal(map.units.length, 1);
  assert.equal(map.features[0].polygons.length, 2);
});

test('field map: Soils is its own toggle next to Canals and layers over elevation', () => {
  const src = fs.readFileSync(path.join(root, 'components/fields/FieldMapBlock.tsx'), 'utf8');
  assert.match(src, /map-seg-canals[\s\S]*map-seg-soils/);
  assert.match(src, /setShowSoils\(\(on\) => !on\)/);
  // Elevation mode is untouched by the Soils toggle (separate state).
  assert.doesNotMatch(src, /setShowSoils[^\n]*setMode|setMode[^\n]*setShowSoils/);
  const overlay = fs.readFileSync(path.join(root, 'components/SoilsOverlay.tsx'), 'utf8');
  assert.match(overlay, /zIndex = '400'/); // above elevation pane (350)
  const mw = fs.readFileSync(path.join(root, 'middleware.ts'), 'utf8');
  assert.match(mw, /'\/api\/soil-map'/);
});

test('outline runs skip edges on the clip box', () => {
  const box = { w: 0, s: 0, e: 1, n: 1 };
  // Clipped unit: real boundary is the diagonal-ish line; the rest lies on the box.
  const ring = [[0, 0], [0.6, 0], [0.4, 0.5], [0.6, 1], [0, 1], [0, 0]];
  const runs = soils.boundaryRuns(ring, box);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], [[0.6, 0], [0.4, 0.5], [0.6, 1]]);
  // A ring fully inside the box stays one closed run.
  const inner = [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.2]];
  assert.deepEqual(soils.boundaryRuns(inner, box), [inner]);
});

test('label prefers a spot inside the field', () => {
  const poly = square(0, 0, 4, 1);
  const field = [square(3, 0, 4, 1)];
  const at = soils.labelPoint(poly, 32, field);
  assert.ok(at[0] >= 3, String(at));
});

test('viewport tiling snaps to route-valid boxes and refuses a too-wide view', () => {
  const one = soils.soilBboxKeysForView({ w: -99.130, s: 40.530, e: -99.120, n: 40.540 });
  assert.equal(one.length, 1);
  assert.ok(soils.parseSoilBboxKey(one[0]));
  assert.deepEqual(soils.soilBboxKeysForView({ w: -99.130, s: 40.530, e: -99.120, n: 40.540 }), one);

  const mid = soils.soilBboxKeysForView({ w: -99.16, s: 40.52, e: -99.04, n: 40.58 }, 9);
  assert.ok(mid.length >= 2 && mid.length <= 9);
  assert.equal(new Set(mid).size, mid.length);
  for (const key of mid) {
    const box = soils.parseSoilBboxKey(key);
    assert.ok(box, key);
    assert.ok(box.e - box.w <= soils.SOIL_BBOX_MAX_SPAN + 1e-9);
    assert.ok(box.n - box.s <= soils.SOIL_BBOX_MAX_SPAN + 1e-9);
  }

  // ~0.5° around Kearney is far too large for 9 tiles of 0.06°.
  assert.equal(soils.soilBboxKeysForView({ w: -99.40, s: 40.40, e: -98.80, n: 41.00 }, 9), null);
  assert.equal(soils.soilBboxKeysForView({ w: -99.13, s: 40.53, e: -99.13, n: 40.54 }), null);
});

test('staff map: Soils is a layer toggle that uses the snapped soil-map API', () => {
  const client = fs.readFileSync(path.join(root, 'app/map/MapClient.tsx'), 'utf8');
  const unified = fs.readFileSync(path.join(root, 'app/map/UnifiedMap.tsx'), 'utf8');
  const layer = fs.readFileSync(path.join(root, 'app/map/soils-layer.ts'), 'utf8');
  assert.match(client, /soils: 'Soils'/);
  assert.match(client, /Zoom in to see soils/);
  assert.match(unified, /layers\.soils/);
  assert.match(unified, /soilBboxKeysForView/);
  assert.match(unified, /loadSoilMap/);
  assert.match(unified, /SOILS_MIN_ZOOM/);
  assert.match(layer, /SOILS_MIN_ZOOM = 14/);
  assert.match(layer, /zIndex = SOILS_PANE_Z/);
  assert.match(layer, /SOILS_PANE_Z = '390'/); // below overlay markers (400), above elevation (350)
  // Popup shows symbol and map unit name only; the API has no major components.
  assert.match(layer, /soil-popup-sym/);
  assert.match(layer, /soil-popup-name/);
  assert.doesNotMatch(layer, /component/i);
  assert.doesNotMatch(client, /component/i);
});
