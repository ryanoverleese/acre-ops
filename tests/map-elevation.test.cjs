const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const scale = f.load('lib/terrain/viewport-scale.ts');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('elevation button says Color or Gray when on, and Elevation when off', () => {
  assert.equal(scale.elevationButtonLabel('off'), 'Elevation');
  assert.equal(scale.elevationButtonLabel('colorshade'), 'Elevation · Color');
  assert.equal(scale.elevationButtonLabel('color'), 'Elevation · Color');
  assert.equal(scale.elevationButtonLabel('shade'), 'Elevation · Gray');
  assert.equal(scale.elevationButtonLabel('contours'), 'Elevation');
});

test('viewport sample is padded, stays put for a small pan, and tightens after a zoom-in', () => {
  const view = { w: -99.55, s: 40.38, e: -98.85, n: 40.65 };
  const sample = scale.padBox(view, 0.25);
  assert.ok(sample.w < view.w && sample.e > view.e && sample.s < view.s && sample.n > view.n);
  assert.ok(Math.abs((sample.e - sample.w) - (view.e - view.w) * 1.5) < 1e-12);
  assert.ok(Math.abs((sample.n - sample.s) - (view.n - view.s) * 1.5) < 1e-12);
  assert.equal(scale.needsNewElevSample(null, view), true);
  assert.equal(scale.needsNewElevSample(sample, view), false);
  const nudged = { w: view.w + 0.02, s: view.s + 0.01, e: view.e + 0.02, n: view.n + 0.01 };
  assert.equal(scale.needsNewElevSample(sample, nudged), false);
  const offEast = { ...view, w: view.w + 0.3, e: view.e + 0.3 };
  assert.equal(scale.needsNewElevSample(sample, offEast), true);
  const zoomedOut = scale.padBox(view, 1);
  assert.equal(scale.needsNewElevSample(sample, zoomedOut), true);
  const mid = { w: (view.w + view.e) / 2, s: (view.s + view.n) / 2 };
  const zoomedIn = {
    w: mid.w - (view.e - view.w) / 6,
    s: mid.s - (view.n - view.s) / 6,
    e: mid.w + (view.e - view.w) / 6,
    n: mid.s + (view.n - view.s) / 6,
  };
  assert.equal(scale.needsNewElevSample(sample, zoomedIn), true);
});

test('staff map Elevation reuses the field DEM path, sits under soils, and does not steal taps', () => {
  const client = read('app/map/MapClient.tsx');
  const map = read('app/map/UnifiedMap.tsx');
  const layer = read('app/map/elevation-layer.ts');
  const soils = read('app/map/soils-layer.ts');
  const grid = read('lib/terrain/elev-grid.ts');

  assert.match(client, /useState<TerrainMode>\('off'\)/);
  assert.match(client, /elevationButtonLabel/);
  assert.match(client, /\n\s*Color\n/);
  assert.match(client, /\n\s*Gray\n/);
  assert.match(client, /pick\('colorshade'\)/);
  assert.match(client, /pick\('shade'\)/);

  assert.match(map, /attachStaffElevation/);
  assert.match(map, /elevationMode/);
  assert.equal(map.includes('clipPath'), false);

  assert.match(layer, /createElevGridLayer/);
  assert.match(layer, /ELEVATION_PANE_Z = '350'/);
  assert.match(layer, /pointerEvents = 'none'/);
  assert.match(layer, /setFieldBounds/);
  assert.match(layer, /colorshade: 0\.65/);
  assert.match(layer, /shade: 0\.75/);
  assert.match(soils, /SOILS_PANE_Z = '390'/);
  assert.ok(Number(layer.match(/ELEVATION_PANE_Z = '(\d+)'/)[1]) < Number(soils.match(/SOILS_PANE_Z = '(\d+)'/)[1]));

  assert.match(grid, /elevationRequestPath/);
  const req = read('lib/terrain/elevation-request.ts');
  assert.match(req, /\/api\/usgs-elevation/);
  const proxy = read('app/api/usgs-elevation/[[...path]]/route.ts');
  assert.match(proxy, /elevation\.nationalmap\.gov/);
});

test('staff map Color mode has range controls, Spread, Auto, and a corner logo', () => {
  const client = read('app/map/MapClient.tsx');
  const controls = read('app/map/ElevColorControls.tsx');
  const prefs = f.load('lib/terrain/elev-color-prefs.ts');

  assert.match(client, /ElevColorControls/);
  assert.match(client, /ELEV_COLOR_PREFS_KEY/);
  assert.match(client, /acre-insights-logo-footer\.png/);
  assert.match(client, /pointerEvents: 'none'/);
  assert.match(client, /clamp\(88px, 22vw, 140px\)/);
  assert.match(client, /acre-insights-logo-footer[\s\S]{0,400}boxShadow: 'none'/);
  assert.match(controls, /Auto/);
  assert.match(controls, /Spread/);
  assert.match(controls, /elevationCssGradient/);
  assert.match(controls, /Low elevation, feet/);
  assert.match(controls, /High elevation, feet/);
  assert.equal(prefs.ELEV_COLOR_PREFS_KEY, 'acre-ops-map-elev-color');
  const stored = prefs.parseElevColorPrefs(prefs.serializeElevColorPrefs({ auto: false, spread: true, loFt: 2100, hiFt: 2350, relief: 50 }));
  assert.deepEqual(stored, { auto: false, spread: true, loFt: 2100, hiFt: 2350, relief: 50 });
  const auto = prefs.parseElevColorPrefs('{"auto":true,"spread":false,"loFt":null,"hiFt":null}');
  assert.equal(auto.auto, true);
  assert.equal(auto.spread, false);
  assert.equal(auto.relief, 50);
  const strong = prefs.parseElevColorPrefs(prefs.serializeElevColorPrefs({ auto: true, spread: false, loFt: null, hiFt: null, relief: 100 }));
  assert.equal(strong.relief, 100);
  assert.match(controls, /aria-label="Relief"/);
  assert.match(controls, />Low</);
  assert.match(controls, />Relief</);
  assert.match(controls, />High</);
  assert.match(client, /onRelief/);
  assert.match(client, /elevOn/);
  assert.match(client, /showColor=\{colorOn\}/);
});

test('elevation tiles share one color stretch, a 1-px hillshade halo, and no per-tile scale', () => {
  const grid = read('lib/terrain/elev-grid.ts');
  const paint = read('lib/terrain/paint-elev.ts');
  assert.match(paint, /TILE_HALO = 1/);
  assert.match(paint, /ELEV_GRID = TILE \+ TILE_HALO \* 2/);
  assert.match(paint, /mercatorPixelMeters/);
  assert.match(paint, /tileRowLatRad/);
  assert.match(paint, /reliefLight/);
  assert.match(grid, /paintElevationTile/);
  assert.match(grid, /setColorOptions/);
  assert.match(grid, /buildSpreadMap/);
  assert.equal(grid.includes('tile._range'), false);
  assert.equal(grid.includes('_range'), false);
});
