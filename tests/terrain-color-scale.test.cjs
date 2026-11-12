const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const scale = f.load('lib/terrain/color-scale.ts');

// Boston North, measured from USGS 3DEP exportImage on 2026-11-11.
// Zoom-16 tiles 14716,24687 (north) and 14716,24688 (south) share an edge.
// The elevation on that edge agrees within 3 cm. Each tile's own min/max does not.
const FIELD = { lo: 674.1867065429688, hi: 678.5460815429688 };
const NORTH_TILE = { lo: 676.13, hi: 678.5 };
const SOUTH_TILE = { lo: 674.21, hi: 677.7 };
const NORTH_EDGE_M = 676.37;
const SOUTH_EDGE_M = 676.35;

test('adjacent tiles share one field color scale', () => {
  const northScale = scale.colorScaleForTile(NORTH_TILE, FIELD);
  const southScale = scale.colorScaleForTile(SOUTH_TILE, FIELD);
  assert.deepEqual(northScale, { lo: FIELD.lo, hi: FIELD.hi });
  assert.deepEqual(southScale, northScale);

  const northIndex = scale.elevationColorIndex(NORTH_EDGE_M, northScale);
  const southIndex = scale.elevationColorIndex(SOUTH_EDGE_M, southScale);
  assert.ok(
    Math.abs(northIndex - southIndex) <= 2,
    `shared scale still splits the edge: ${northIndex} vs ${southIndex}`,
  );
});

test('per-tile color scales disagree on the same Boston North edge', () => {
  const northIndex = scale.elevationColorIndex(NORTH_EDGE_M, NORTH_TILE);
  const southIndex = scale.elevationColorIndex(SOUTH_EDGE_M, SOUTH_TILE);
  assert.ok(
    Math.abs(northIndex - southIndex) >= 80,
    `fixture no longer shows the per-tile bug (${northIndex} vs ${southIndex})`,
  );
});

test('elevation grid colors tiles with the field scale, not tile._range', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/terrain/elev-grid.ts'), 'utf8');
  assert.match(src, /colorScaleForTile\(/);
  assert.equal(src.includes('tile._range'), false);
  assert.equal(src.includes('_range'), false);
  assert.equal(src.includes('force-cache'), false);
  assert.equal(src.includes('_adoptSharedFallback'), false);
  assert.match(src, /elevationRequestPath\(/);
});

test('a zero or NaN cannot pin the field on the top of the ramp', () => {
  const field = [];
  for (let i = 0; i < 100; i++) field.push(674.2 + (i % 5) * 0.8);
  field.push(0, Number.NaN, -9999, 10000, 500);
  const range = scale.rangeFromSamples(field);
  assert.ok(range, 'expected a range');
  assert.ok(range.lo > 670 && range.lo < 676, `lo ${range.lo}`);
  assert.ok(range.hi > 676 && range.hi < 680, `hi ${range.hi}`);
  const mid = scale.elevationColorIndex(676, range);
  assert.ok(mid > 20 && mid < 250, `676 mapped to ${mid}`);
});

test('field sample keeps points inside the boundary and ignores a zero outside it', () => {
  const req = f.load('lib/terrain/elevation-request.ts');
  const ring = [[-99.160950182, 40.517733809], [-99.151508806, 40.517652248], [-99.151465891, 40.510441846], [-99.160993097, 40.510507102], [-99.160950182, 40.517733809]];
  assert.equal(req.pointInRings(-99.1562, 40.5141, [ring]), true);
  assert.equal(req.pointInRings(-99.2, 40.5141, [ring]), false);

  const R = 6378137;
  const lng = -99.160950182;
  const lat = 40.510507102;
  const x = lng * Math.PI / 180 * R;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R;
  const [lng2, lat2] = req.mercatorToLngLat(x, y);
  assert.ok(Math.abs(lng - lng2) < 1e-8, String(lng2));
  assert.ok(Math.abs(lat - lat2) < 1e-8, String(lat2));

  const toMerc = (lng0, lat0) => {
    const mx = lng0 * Math.PI / 180 * R;
    const my = Math.log(Math.tan(Math.PI / 4 + (lat0 * Math.PI) / 360)) * R;
    return [mx - 20, my - 20, mx + 20, my + 20];
  };
  const inside = req.elevationsInsideField([676.4], 1, 1, toMerc(-99.1562, 40.5141), [ring]);
  assert.deepEqual(inside, [676.4]);
  const outside = req.elevationsInsideField([0], 1, 1, toMerc(-99.2, 40.5141), [ring]);
  assert.deepEqual(outside, []);
  const range = scale.rangeFromSamples([676.4, 677.2, 0, Number.NaN]);
  assert.ok(range.lo > 670 && range.hi < 680, JSON.stringify(range));
});

test('legend feet are meters times 3.28084, rounded, and color math stays in meters', () => {
  assert.equal(scale.METERS_TO_FEET, 3.28084);
  assert.equal(scale.formatElevationFeet(674.1867065429688), '2212 ft');
  assert.equal(scale.formatElevationFeet(678.5460815429688), '2226 ft');
  assert.equal(scale.formatElevationFeet(100), `${Math.round(100 * 3.28084)} ft`);
  assert.equal(scale.formatElevationFeet(Number.NaN), '');
  const index = scale.elevationColorIndex(NORTH_EDGE_M, FIELD);
  assert.equal(index, scale.elevationColorIndex(NORTH_EDGE_M, { lo: FIELD.lo, hi: FIELD.hi }));
});

test('field scale is reported for the legend without a second color path', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/terrain/elev-grid.ts'), 'utf8');
  assert.match(src, /state\.fieldScale = colorScaleForTile\(null, sample\)/);
  assert.match(src, /state\.onFieldScale\?\.\(state\.fieldScale\)/);
  const ui = fs.readFileSync(path.join(__dirname, '../components/TerrainControl.tsx'), 'utf8');
  assert.match(ui, /formatElevationFeet/);
});

test('elevation requests are distinct URLs and the proxy does not cache them together', () => {
  const req = f.load('lib/terrain/elevation-request.ts');
  const field = req.elevationRequestPath([-11038551.258, 4940397.927, -11037490.694, 4941465.657], 96, 96);
  const tile = req.elevationRequestPath([-11040000, 4940000, -11038000, 4942000], 258, 258);
  assert.notEqual(field, tile);
  assert.match(field, /\/exportImage\/.+\/96x96$/);
  assert.equal(req.usgsImageSuffix(['exportImage', '-11038551.258,4940397.927,-11037490.694,4941465.657', '96x96']), 'exportImage');
  assert.equal(req.usgsImageSuffix(['exportImage']), 'exportImage');

  const route = fs.readFileSync(path.join(__dirname, '../app/api/usgs-elevation/[[...path]]/route.ts'), 'utf8');
  assert.equal(route.includes("'public, max-age=900'"), false);
  assert.match(route, /private, max-age=900/);
  assert.match(route, /Netlify-CDN-Cache-Control', 'no-store'/);
});
