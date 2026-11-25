const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const sample = f.load('lib/terrain/sample-elev.ts');
const scale = f.load('lib/terrain/color-scale.ts');
const buffer = f.load('lib/terrain/field-buffer.ts');

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

test('pin labels use tenths of a foot and the agreed difference phrase', () => {
  const meters = 710.594604492;
  assert.equal(sample.formatPointFeet(meters), `${(meters * scale.METERS_TO_FEET).toFixed(1)} ft`);
  assert.equal(sample.formatPinDiff(100, 100 + 3.2 / scale.METERS_TO_FEET), 'B is 3.2 ft higher than A');
  assert.equal(sample.formatPinDiff(100, 100 - 3.2 / scale.METERS_TO_FEET), 'B is 3.2 ft lower than A');
  assert.equal(sample.formatPinDiff(100, 100), 'B is even with A');
  const a = { lat: 40.44, lng: -99.37, meters: 710.594604492 };
  const b = { lat: 40.441, lng: -99.37, meters: 709.5 };
  const line = sample.formatPinStrip(a, b);
  assert.match(line, /B is \d+\.\d ft lower than A · /);
  assert.match(line, / ft$/);
  assert.equal(sample.formatPinStrip(a, null), `A ${sample.formatPointFeet(a.meters)}`);
});

test('haversine of a short north-south step is about 111 m per 0.001 deg', () => {
  const m = sample.haversineMeters(40.44, -99.37, 40.441, -99.37);
  assert.ok(m > 110 && m < 113, m);
});

test('grower field map samples the client LERC grid and keeps the strip off the map', () => {
  const map = fs.readFileSync(path.join(__dirname, '../components/fields/FieldMapBlock.tsx'), 'utf8');
  const pins = fs.readFileSync(path.join(__dirname, '../components/fields/ElevationPins.tsx'), 'utf8');
  const grid = fs.readFileSync(path.join(__dirname, '../lib/terrain/elev-grid.ts'), 'utf8');
  const overlay = fs.readFileSync(path.join(__dirname, '../components/ElevationOverlay.tsx'), 'utf8');
  const gestures = fs.readFileSync(path.join(__dirname, '../components/fields/CooperativeGestures.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(map, /ElevationPins/);
  assert.match(map, /map-elev-pins-strip/);
  assert.match(map, /formatPinStrip/);
  assert.match(map, /enabled=\{mode !== 'off'\}/);
  assert.equal(map.includes('epqs.nationalmap.gov'), false);
  assert.match(pins, /LONG_PRESS_MS = 450/);
  assert.match(pins, /is-elev-pin-drag/);
  assert.match(pins, /requestAnimationFrame/);
  assert.match(grid, /sampleElevation/);
  assert.match(grid, /sampleElevFromGrid/);
  assert.match(overlay, /samplerRef/);
  assert.match(gestures, /is-elev-pin-drag/);
  assert.match(css, /\.map-elev-pins-strip \{/);
  assert.match(css, /touch-action: none/);
});

function mercToLngLat(x, y) {
  const R = 6378137;
  const lng = (x / R) * (180 / Math.PI);
  const lat = (Math.atan(Math.sinh(y / R)) * 180) / Math.PI;
  return [lat, lng];
}

test('removing A promotes B; removing B leaves A; x on the label is a 44px target', () => {
  const a = { lat: 40.44, lng: -99.37, meters: 710 };
  const b = { lat: 40.441, lng: -99.37, meters: 709 };
  assert.deepEqual(buffer.removeElevPin({ a, b }, 'A'), { a: b, b: null });
  assert.deepEqual(buffer.removeElevPin({ a, b }, 'B'), { a, b: null });
  assert.deepEqual(buffer.removeElevPin({ a, b: null }, 'A'), { a: null, b: null });
  const pins = fs.readFileSync(path.join(__dirname, '../components/fields/ElevationPins.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(pins, /elev-pin-remove/);
  assert.match(pins, /removeElevPin/);
  assert.match(css, /\.elev-pin-remove \{[^}]*width: 44px;[^}]*height: 44px;/);
});

test('outside-field buffer expands a square by 200 ft and the toggle sits under the legend', () => {
  assert.equal(buffer.OUTSIDE_FIELD_BUFFER_FT, 200);
  const meters = buffer.OUTSIDE_FIELD_BUFFER_M;
  // 400 m square in mercator space around Holdrege
  const sampleMod = sample;
  const half = 200;
  const [cx, cy] = sampleMod.lngLatToMercator(-99.37, 40.44);
  function ll(x, y) {
    const R = 6378137;
    return [(x / R) * (180 / Math.PI), (Math.atan(Math.sinh(y / R)) * 180) / Math.PI];
  }
  // ring is lng,lat; CCW: SW, SE, NE, NW
  const sw = ll(cx - half, cy - half);
  const se = ll(cx + half, cy - half);
  const ne = ll(cx + half, cy + half);
  const nw = ll(cx - half, cy + half);
  const ring = [sw, se, ne, nw, sw];
  const out = buffer.bufferRing(ring, meters);
  assert.ok(out.length >= 4);
  // mid-south edge should move south by about the buffer
  // find the south-most point of the buffer (min mercator y)
  let minY = Infinity;
  for (const [lng, lat] of out) {
    const [, y] = sampleMod.lngLatToMercator(lng, lat);
    if (y < minY) minY = y;
  }
  const moved = (cy - half) - minY;
  assert.ok(Math.abs(moved - meters) < 8, `south offset ${moved} vs ${meters}`);
  const map = fs.readFileSync(path.join(__dirname, '../components/fields/FieldMapBlock.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(map, /Show outside field/);
  assert.match(map, /map-elev-buffer-strip/);
  assert.match(map, /scaleTo=\{boundaries\}/);
  // Toggle is declared immediately after the elevation legend, not in map-controls
  const legendEnd = map.indexOf('map-legend-source');
  const toggleAt = map.indexOf('map-elev-buffer-strip');
  const controlsAt = map.indexOf('className="map-controls"');
  assert.ok(toggleAt > legendEnd && legendEnd > 0);
  assert.ok(toggleAt > controlsAt);
  assert.ok(!map.slice(controlsAt, legendEnd).includes('Show outside field'));
  assert.match(css, /\.map-elev-buffer-strip \{/);
});
