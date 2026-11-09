const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./supabase/harness.cjs');
const ramp = f.load('lib/terrain/ramp.ts');
const modes = f.load('lib/terrain/modes.ts');

test('CutSheetRX LUT is 256 RGB entries from blue low to red high', () => {
  const lut = ramp.buildElevationLut();
  assert.equal(lut.length, 256 * 3);
  const [r0, g0, b0] = ramp.CUTSHEET_STOPS[0][1];
  assert.equal(lut[0], r0);
  assert.equal(lut[1], g0);
  assert.equal(lut[2], b0);
  const last = ramp.CUTSHEET_STOPS[ramp.CUTSHEET_STOPS.length - 1][1];
  const hi = 255 * 3;
  assert.equal(lut[hi], last[0]);
  assert.equal(lut[hi + 1], last[1]);
  assert.equal(lut[hi + 2], last[2]);
});

test('CSS gradient includes CutSheetRX endpoints', () => {
  const css = ramp.elevationCssGradient();
  assert.match(css, /^linear-gradient\(90deg,/);
  assert.match(css, /rgb\(33,64,154\)/);
  assert.match(css, /rgb\(165,0,38\)/);
});

test('default terrain mode is colorshade', () => {
  assert.equal(modes.DEFAULT_TERRAIN_MODE, 'colorshade');
  assert.ok(modes.TERRAIN_OPTIONS.includes('colorshade'));
});
