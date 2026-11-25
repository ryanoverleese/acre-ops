const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const sample = f.load('lib/terrain/sample-elev.ts');
const scale = f.load('lib/terrain/color-scale.ts');
const buffer = f.load('lib/terrain/field-buffer.ts');
const gesture = f.load('lib/terrain/elev-pin-gesture.ts');

/** 2x2 grid in mercator around lon -99.37, lat 40.44. */
function gridAround(lat, lng, values) {
  const [cx, cy] = sample.lngLatToMercator(lng, lat);
  const half = 20;
  const elev = Float32Array.from(values);
  return {
    elev,
    width: 2,
    height: 2,
    bbox: [cx - half, cy - half, cx + half, cy + half],
  };
}

function mercToLngLat(x, y) {
  const R = 6378137;
  const lng = (x / R) * (180 / Math.PI);
  const lat = (Math.atan(Math.sinh(y / R)) * 180) / Math.PI;
  return [lat, lng];
}

test('bilinear sample at pixel centers returns the stored meters', () => {
  const lat = 40.44;
  const lng = -99.37;
  const [cx, cy] = sample.lngLatToMercator(lng, lat);
  const half = 20;
  // pixel centers of a 2x2: col 0 is west, row 0 is north
  const elev = Float32Array.from([700, 710, 720, 730]);
  const grid = { elev, width: 2, height: 2, bbox: [cx - half, cy - half, cx + half, cy + half] };
  function at(col, row) {
    const x = (cx - half) + ((col + 0.5) / 2) * (2 * half);
    const y = (cy + half) - ((row + 0.5) / 2) * (2 * half);
    const [plat, plng] = mercToLngLat(x, y);
    return sample.sampleElevFromGrid(grid, plat, plng);
  }
  assert.ok(Math.abs(at(0, 0) - 700) < 1e-6);
  assert.ok(Math.abs(at(1, 0) - 710) < 1e-6);
  assert.ok(Math.abs(at(0, 1) - 720) < 1e-6);
  assert.ok(Math.abs(at(1, 1) - 730) < 1e-6);
  const mid = at(0.5, 0.5);
  assert.ok(Math.abs(mid - 715) < 1e-6);
});

test('a point outside the raster, or no-data, returns null', () => {
  const grid = gridAround(40.44, -99.37, [700, 710, 720, 730]);
  assert.equal(sample.sampleElevFromGrid(grid, 41, -99.37), null);
  const empty = gridAround(40.44, -99.37, [0, 0, 0, 0]);
  assert.equal(sample.sampleElevFromGrid(empty, 40.44, -99.37), null);
});

test('pin labels are tenths of a foot with no A/B prefix', () => {
  const meters = 710.594604492;
  assert.equal(sample.formatPointFeet(meters), `${(meters * scale.METERS_TO_FEET).toFixed(1)} ft`);
  assert.equal(sample.formatPointFeet(677.4517822265625), '2222.6 ft');
});

test('haversine of a short north-south step is about 111 m per 0.001 deg', () => {
  const m = sample.haversineMeters(40.44, -99.37, 40.441, -99.37);
  assert.ok(m > 110 && m < 113, m);
});

test('grower field map uses one pin, samples the client LERC grid, and works on Satellite', () => {
  const map = fs.readFileSync(path.join(__dirname, '../components/fields/FieldMapBlock.tsx'), 'utf8');
  const pins = fs.readFileSync(path.join(__dirname, '../components/fields/ElevationPins.tsx'), 'utf8');
  const grid = fs.readFileSync(path.join(__dirname, '../lib/terrain/elev-grid.ts'), 'utf8');
  const overlay = fs.readFileSync(path.join(__dirname, '../components/ElevationOverlay.tsx'), 'utf8');
  const gestures = fs.readFileSync(path.join(__dirname, '../components/fields/CooperativeGestures.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(map, /ElevationPins/);
  assert.match(map, /enabled=\{elevPinOn\}/);
  assert.equal(map.includes('map-elev-pins-strip'), false);
  assert.equal(map.includes('formatPinStrip'), false);
  assert.equal(map.includes('B is'), false);
  assert.equal(map.includes("enabled={mode !== 'off'}"), false);
  assert.equal(map.includes('epqs.nationalmap.gov'), false);
  assert.match(pins, /LONG_PRESS_MS/);
  assert.match(pins, /is-elev-pin-drag/);
  assert.match(pins, /requestAnimationFrame/);
  assert.match(pins, /formatPointFeet/);
  assert.match(pins, /setLatLng/);
  assert.match(pins, /paintPin/);
  assert.equal(pins.includes('A 2222') || pins.includes('${id}'), false);
  assert.equal(pins.includes('B is'), false);
  assert.match(grid, /sampleElevation/);
  assert.match(grid, /sampleElevFromGrid/);
  assert.match(overlay, /samplerRef/);
  assert.match(overlay, /resolved === 'off' \? 0/);
  assert.match(overlay, /colorshade: 0\.9/);
  assert.match(overlay, /shade: 0\.9/);
  assert.match(gestures, /is-elev-pin-drag/);
  assert.match(css, /touch-action: none/);
});

test('a long-press hold is not cancelled by finger jitter, and a short tap removes the pin', () => {
  const g = gesture.startElevPinGesture(0, 0);
  assert.equal(gesture.LONG_PRESS_MS, 400);
  assert.equal(gesture.shouldCancelHoldOnMove(g, 16, 16), false);
  assert.equal(gesture.isElevPinTap(g, 3, 3), true);
  assert.equal(gesture.isElevPinTap(g, 20, 0), false);
  g.armed = true;
  assert.equal(gesture.isElevPinTap(g, 0, 0), false);
  const pins = fs.readFileSync(path.join(__dirname, '../components/fields/ElevationPins.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(pins, /elev-pin-remove/);
  assert.match(pins, /endPinDrag\(null\)/);
  assert.match(pins, /elev-pin-chip/);
  assert.match(css, /\.elev-pin-chip \{/);
  assert.match(css, /\.elev-pin-remove::before \{[^}]*width: 44px;[^}]*height: 44px;/);
  assert.equal(/\.elev-pin-remove \{[^}]*flex: 0 0 44px/.test(css), false);
});

test('two-finger pan and pinch are never preventDefaulted or touch-action-blocked on the map', () => {
  const pins = fs.readFileSync(path.join(__dirname, '../components/fields/ElevationPins.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(pins, /touches\.length >= 2/);
  assert.match(pins, /addEventListener\('touchstart', onTouchStart, \{ passive: true \}/);
  assert.equal(pins.includes("container.addEventListener('touchmove'"), false);
  assert.equal(/html\.elev-pin-scroll-lock[^{]*\{[^}]*touch-action:\s*none/.test(css), false);
  assert.equal(/\.leaflet-container\.is-elev-pin-mode[^{]*\{[^}]*touch-action:\s*none/.test(css), false);
  assert.equal(/\.leaflet-container\.is-elev-pin-drag \{[^}]*touch-action:\s*none/.test(css), false);
  assert.match(css, /\.elev-pin-hit \{[^}]*touch-action: none/);
});

test('elevation pin and outside-field switches sit under the legend; pin defaults off and locks page scroll', () => {
  assert.equal(buffer.OUTSIDE_FIELD_BUFFER_FRACTION, 0.25);
  const half = 200;
  const [cx, cy] = sample.lngLatToMercator(-99.37, 40.44);
  function ll(x, y) {
    const R = 6378137;
    return [(x / R) * (180 / Math.PI), (Math.atan(Math.sinh(y / R)) * 180) / Math.PI];
  }
  const sw = ll(cx - half, cy - half);
  const se2 = ll(cx + half, cy - half);
  const ne = ll(cx + half, cy + half);
  const nw = ll(cx - half, cy + half);
  const ring = [sw, se2, ne, nw, sw];
  const collection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } }],
  };
  const side = buffer.fieldLongerSideMeters(collection);
  assert.ok(Math.abs(side - 400) < 1, side);
  const meters = buffer.bufferMetersForCollection(collection);
  assert.ok(Math.abs(meters - 100) < 0.5, meters);
  const out = buffer.bufferRing(ring, meters);
  assert.ok(out.length >= 4);
  let minY = Infinity;
  for (const [lng, lat] of out) {
    const [, y] = sample.lngLatToMercator(lng, lat);
    if (y < minY) minY = y;
  }
  const moved = (cy - half) - minY;
  assert.ok(Math.abs(moved - meters) < 8, `south offset ${moved} vs ${meters}`);
  const map = fs.readFileSync(path.join(__dirname, '../components/fields/FieldMapBlock.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  const helper = fs.readFileSync(path.join(__dirname, '../lib/terrain/elev-pin-gesture.ts'), 'utf8');
  assert.match(map, /Elevation pin/);
  assert.match(map, /Show outside field/);
  assert.match(map, /map-elev-buffer-strip/);
  assert.match(map, /role="switch"/);
  assert.match(map, /\[elevPinOn, setElevPinOn\] = useState\(false\)/);
  assert.match(map, /lockPageScroll/);
  assert.match(map, /scrollIntoView/);
  assert.match(map, /bufferCollectionToFieldFraction/);
  assert.match(map, /scaleTo=\{boundaries\}/);
  assert.equal(map.includes('type="checkbox"'), false);
  const legendEnd = map.indexOf('map-legend-source');
  const toggleAt = map.indexOf('map-elev-buffer-strip');
  const controlsAt = map.indexOf('className="map-controls"');
  assert.ok(toggleAt > legendEnd && legendEnd > 0);
  assert.ok(toggleAt > controlsAt);
  assert.ok(!map.slice(controlsAt, legendEnd).includes('Show outside field'));
  assert.ok(!map.slice(controlsAt, legendEnd).includes('Elevation pin'));
  assert.match(css, /\.map-elev-buffer-strip \{/);
  assert.match(css, /\.map-ios-switch \{/);
  assert.match(css, /html\.elev-pin-scroll-lock/);
  assert.match(helper, /position:fixed|style\.top/);
});
