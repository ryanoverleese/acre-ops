const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const wide = f.load('lib/soils/wide.ts');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('wide tile keys: 0.1° grid, round-trip, reject bad keys', () => {
  assert.deepEqual(wide.parseWideTileKey('-99.2,40.4'), { w: -99.2, s: 40.4, e: -99.1, n: 40.5 });
  assert.equal(wide.parseWideTileKey('-99.25,40.4'), null);
  assert.equal(wide.parseWideTileKey('-99.2,40.4);DROP'), null);
  assert.equal(wide.parseWideTileKey('-181.0,40.4'), null);
  // ~20 x 14 miles around Axtell: 4 x 2 tiles.
  const keys = wide.wideTileKeysForView({ w: -99.33, s: 40.38, e: -98.93, n: 40.58 });
  assert.equal(keys.length, 5 * 3);
  assert.ok(keys.includes('-99.2,40.4'));
  for (const k of keys) assert.ok(wide.parseWideTileKey(k), k);
  // Exact grid edges do not add an extra row/column.
  assert.deepEqual(wide.wideTileKeysForView({ w: -99.2, s: 40.4, e: -99.1, n: 40.5 }), ['-99.2,40.4']);
  // Whole-state view is too many tiles.
  assert.equal(wide.wideTileKeysForView({ w: -104, s: 40, e: -95.3, n: 43 }), null);
});

test('soil family and series names and stable colors', () => {
  assert.equal(wide.soilFamilyName('Holdrege silt loam, 1 to 3 percent slopes'), 'Holdrege silt loam');
  assert.equal(wide.soilFamilyName('Anselmo fine sandy loam, hummocky, eroded'), 'Anselmo fine sandy loam');
  assert.equal(wide.soilFamilyName(''), 'Unnamed map unit');
  assert.equal(wide.soilSeriesName('Coly-Kenesaw silt loams, 6 to 11 percent slopes'), 'Coly');
  assert.equal(wide.soilSeriesName('Kenesaw and Coly silt loams'), 'Kenesaw');
  assert.equal(wide.soilSeriesName('Miscellaneous water'), 'Water');
  assert.equal(wide.soilSeriesColor('Holdrege silt loam, 0 to 1 percent slopes'), wide.soilSeriesColor('Holdrege silty clay loam'));
  assert.notEqual(wide.soilSeriesColor('Holdrege silt loam'), wide.soilSeriesColor('Butler silt loam'));
  assert.notEqual(wide.soilSeriesColor('Holdrege silt loam'), wide.soilSeriesColor('Coly silt loam'));
  assert.match(wide.soilSeriesColor('Zzyzx loam'), /^#[0-9A-F]{6}$/i);
});

test('wide fetch pages the FPAC service with simplification and clips to the tile', async () => {
  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u);
    const offset = Number(u.searchParams.get('resultOffset'));
    const ring = [[-99.25, 40.45], [-99.05, 40.45], [-99.05, 40.48], [-99.25, 40.48], [-99.25, 40.45]];
    const feature = { type: 'Feature', properties: { mukey: String(100 + offset), musym: '3820', muname: 'Holdrege silt loam, 1 to 3 percent slopes' }, geometry: { type: 'Polygon', coordinates: [ring] } };
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature], properties: offset === 0 ? { exceededTransferLimit: true } : {} }) };
  };
  try {
    const { fetchWideSoils, fetchFpacSoils } = f.load('lib/soils/fetch-ssurgo.ts');
    const map = await fetchWideSoils({ w: -99.2, s: 40.4, e: -99.1, n: 40.5 });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].searchParams.get('maxAllowableOffset'), '0.0003');
    assert.equal(calls[0].searchParams.get('resultOffset'), '0');
    assert.equal(calls[1].searchParams.get('resultOffset'), '2000');
    assert.equal(calls[0].searchParams.get('orderByFields'), 'objectid');
    assert.equal(map.source, 'fpac');
    assert.equal(map.units.length, 2);
    const xs = map.features.flatMap((ft) => ft.polygons[0][0].map((p) => p[0]));
    assert.ok(Math.min(...xs) >= -99.2 && Math.max(...xs) <= -99.1);
    // The detailed backup request is unchanged: one call, no paging or simplification.
    calls.length = 0;
    await fetchFpacSoils({ w: -99.15, s: 40.46, e: -99.12, n: 40.48 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].searchParams.get('maxAllowableOffset'), null);
    assert.equal(calls[0].searchParams.get('resultOffset'), null);
    assert.equal(calls[0].searchParams.get('geometryPrecision'), '6');
  } finally {
    global.fetch = realFetch;
  }
});

test('staff map: zoomed-out Soils uses wide tiles, map-click lookup, and keeps the detailed view at z14+', () => {
  const unified = read('app/map/UnifiedMap.tsx');
  const client = read('app/map/MapClient.tsx');
  const layer = read('app/map/soils-wide-layer.ts');
  const route = read('app/api/soil-map-wide/[tile]/route.ts');
  assert.match(unified, /zoomLevel >= SOILS_MIN_ZOOM \? soilBboxKeysForView/);
  assert.match(unified, /zoomLevel >= WIDE_MIN_ZOOM \? wideTileKeysForView/);
  assert.match(unified, /loadWideSoilMap/);
  assert.match(unified, /map\.on\('click', onClick\)/);
  assert.match(unified, /map\.off\('click', onClick\)/);
  assert.match(unified, /leaflet-interactive/); // field / probe taps win
  assert.match(unified, /attachSoilTapDismiss\(map\)/);
  assert.match(unified, /consumeSoilTapDismiss\(map\)/); // second tap closes, third tap can open
  assert.match(client, /SoilFamiliesNote/);
  assert.match(client, /soilsStatus === 'wide'/);
  assert.match(layer, /L\.canvas\(/);
  assert.match(layer, /interactive: false/);
  assert.match(layer, /pointerEvents = 'none'/);
  assert.match(route, /parseWideTileKey/);
  assert.equal(wide.WIDE_MIN_ZOOM, 11);
  const css = read('app/globals.css');
  const block = css.slice(css.indexOf('.soil-wide-label span'));
  assert.doesNotMatch(block.slice(0, block.indexOf('}')), /text-shadow|gradient/);
});
