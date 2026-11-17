const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./supabase/harness.cjs');
const paint = f.load('lib/terrain/paint-elev.ts');
const scale = f.load('lib/terrain/color-scale.ts');

const TILE = 256;
const N = 258;

function planeElev(tileX, tileY, z, originMeters) {
  // Continuous west-high plane plus a gentle north-south sine, in meters.
  const elev = new Float32Array(N * N);
  const world = 40075016.68557849;
  const size = world / Math.pow(2, z);
  const px = size / TILE;
  const minX = -world / 2 + tileX * size - px;
  const maxY = world / 2 - tileY * size + px;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const x = minX + (col + 0.5) * px;
      const y = maxY - (row + 0.5) * px;
      const e = originMeters + (x / 200) + Math.sin(y / 400) * 8;
      elev[row * N + col] = e;
    }
  }
  return elev;
}

function paintTile(tileX, tileY, z, fieldScale, spreadMap) {
  const elev = planeElev(tileX, tileY, z, 700);
  const out = new Uint8ClampedArray(TILE * TILE * 4);
  paint.paintElevationTile(out, elev, {
    mode: 'colorshade',
    fieldScale,
    spreadMap: spreadMap || null,
    z,
    tileY,
  });
  return { elev, out };
}

function pixel(out, x, y) {
  const o = (y * TILE + x) * 4;
  return [out[o], out[o + 1], out[o + 2], out[o + 3]];
}

test('adjacent tiles share a color scale and their shared edge matches', () => {
  const z = 10;
  const tileX = 238;
  const tileY = 389;
  // Phelps/Kearney-ish mercator tiles at z=10, but the DEM is synthetic.
  const fieldScale = { lo: 680, hi: 760 };
  const west = paintTile(tileX, tileY, z, fieldScale);
  const east = paintTile(tileX + 1, tileY, z, fieldScale);
  const north = paintTile(tileX, tileY, z, fieldScale);
  const south = paintTile(tileX, tileY + 1, z, fieldScale);

  // East edge of west tile vs west edge of east tile: continuous plane, 1px apart.
  // Color+shade should not jump more than a typical interior step.
  let edgeMax = 0;
  let interiorMax = 0;
  for (let y = 1; y < TILE - 1; y++) {
    const a = pixel(west.out, TILE - 1, y);
    const b = pixel(east.out, 0, y);
    edgeMax = Math.max(edgeMax, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const i0 = pixel(west.out, 120, y);
    const i1 = pixel(west.out, 121, y);
    interiorMax = Math.max(interiorMax, Math.abs(i0[0] - i1[0]), Math.abs(i0[1] - i1[1]), Math.abs(i0[2] - i1[2]));
  }
  assert.ok(edgeMax <= interiorMax + 2, `east-west seam ${edgeMax} > interior ${interiorMax}`);

  let nsMax = 0;
  for (let x = 1; x < TILE - 1; x++) {
    const a = pixel(north.out, x, TILE - 1);
    const b = pixel(south.out, x, 0);
    nsMax = Math.max(nsMax, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }
  assert.ok(nsMax <= interiorMax + 3, `north-south seam ${nsMax} > interior ${interiorMax}`);
});

test('hillshade z-factor is continuous across a north-south tile edge', () => {
  const z = 10;
  const tileY = 389;
  const southOfNorth = paint.tileRowLatRad(z, tileY, TILE - 1);
  const northOfSouth = paint.tileRowLatRad(z, tileY + 1, 0);
  const a = paint.mercatorPixelMeters(z, southOfNorth);
  const b = paint.mercatorPixelMeters(z, northOfSouth);
  assert.ok(Math.abs(a - b) / a < 0.0001, `cell step ${a} vs ${b}`);
  // A per-tile center cell would jump by much more than adjacent rows.
  const centerA = paint.mercatorPixelMeters(z, paint.tileRowLatRad(z, tileY, TILE / 2));
  const centerB = paint.mercatorPixelMeters(z, paint.tileRowLatRad(z, tileY + 1, TILE / 2));
  assert.ok(Math.abs(centerA - centerB) > Math.abs(a - b) * 10);
});

test('relief light never clips the high red to a flat 255', () => {
  const red = [216, 48, 52];
  const dark = paint.reliefLight(0);
  const lit = paint.reliefLight(1);
  assert.ok(dark < lit);
  assert.ok(lit <= 1);
  assert.equal(lit, 1);
  assert.ok(dark >= 0.6);
  assert.ok(Math.round(red[0] * lit) < 255);
  assert.ok(Math.round(red[0] * dark) < Math.round(red[0] * lit));
  const mid = paint.reliefLight(0.5);
  assert.notEqual(Math.round(red[0] * mid), Math.round(red[0] * lit));
});

test('gentle plateau slopes still change the high red', () => {
  const red = [216, 48, 52];
  const flat = paint.reliefLight(1);
  const gentle = paint.reliefLight(0.97);
  assert.ok(flat - gentle >= 0.08, `plateau contrast too weak: ${flat} vs ${gentle}`);
  const a = Math.round(red[0] * flat);
  const b = Math.round(red[0] * gentle);
  assert.ok(a - b >= 16, `red channel barely moves on a gentle slope: ${a} vs ${b}`);
  // Floor keeps shaded crimson readable, not near-black.
  assert.ok(Math.round(red[0] * paint.reliefLight(0)) >= 130);
});

test('spread mapping uses land area so a high cluster is not one flat red', () => {
  const values = [];
  for (let i = 0; i < 100; i++) values.push(700 + i * 0.05); // low tail
  for (let i = 0; i < 900; i++) values.push(740 + (i / 900) * 10); // high plateau
  const linear = { lo: 700, hi: 750 };
  const spread = scale.buildSpreadMap(values, linear);
  assert.ok(spread);
  const lowLinear = scale.elevationColorIndex(745, linear);
  const highLinear = scale.elevationColorIndex(749, linear);
  const lowSpread = scale.elevationColorIndexSpread(745, spread);
  const highSpread = scale.elevationColorIndexSpread(749, spread);
  assert.ok(highLinear - lowLinear < 30, `linear already spread? ${lowLinear} ${highLinear}`);
  assert.ok(highSpread - lowSpread > highLinear - lowLinear, `spread ${lowSpread}..${highSpread} vs linear ${lowLinear}..${highLinear}`);
  assert.equal(scale.elevationColorIndexSpread(700, spread), 0);
  assert.equal(scale.elevationColorIndexSpread(750, spread), 255);
});

test('default relief matches the earlier (weaker) exaggeration, high matches the strong look', () => {
  assert.equal(paint.FIELD_RELIEF.exag, 6);
  assert.equal(paint.RELIEF_EXAG_DEFAULT, 6);
  assert.equal(paint.RELIEF_EXAG_HIGH, 12);
  assert.equal(paint.reliefExag(0.5), 6);
  assert.equal(paint.reliefExag(1), 12);
  assert.equal(paint.reliefExag(0), paint.RELIEF_EXAG_LOW);
  assert.equal(paint.reliefExag(), 6);
  const gentle = 0.97;
  const classic = paint.classicReliefLight(gentle);
  const strong = paint.reliefLight(gentle);
  const mid = paint.reliefLightAt(gentle, 0.5);
  const high = paint.reliefLightAt(gentle, 1);
  const implicit = paint.reliefLightAt(gentle);
  assert.equal(mid, classic);
  assert.equal(implicit, classic);
  assert.equal(high, strong);
  // Default lighting should not punch gentle slopes the way the High end does.
  assert.ok(paint.reliefLight(1) - strong >= 0.08);
  assert.ok(paint.classicReliefLight(1) - classic < 0.05);
});

test('high relief contrast is stronger than the default on the same slope', () => {
  const z = 10;
  const tileY = 389;
  const fieldScale = { lo: 680, hi: 760 };
  // Local slope in meters (not mercator x/200, which is far outside real elevations).
  const elev = new Float32Array(N * N);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      elev[row * N + col] = 720 + col * 0.08 + Math.sin(row / 18) * 3;
    }
  }
  function paintWith(relief, mode) {
    const out = new Uint8ClampedArray(TILE * TILE * 4);
    paint.paintElevationTile(out, elev, {
      mode,
      fieldScale,
      spreadMap: null,
      z,
      tileY,
      relief,
    });
    return out;
  }
  const def = paintWith(0.5, 'colorshade');
  const high = paintWith(1, 'colorshade');
  assert.equal(pixel(def, 128, 128)[3], 255);
  let defVar = 0;
  let highVar = 0;
  const mid = pixel(def, 128, 128);
  const hm = pixel(high, 128, 128);
  for (let y = 8; y < TILE; y += 16) {
    for (let x = 8; x < TILE; x += 16) {
      const a = pixel(def, x, y);
      const b = pixel(high, x, y);
      defVar = Math.max(defVar, Math.abs(a[0] - mid[0]), Math.abs(a[1] - mid[1]), Math.abs(a[2] - mid[2]));
      highVar = Math.max(highVar, Math.abs(b[0] - hm[0]), Math.abs(b[1] - hm[1]), Math.abs(b[2] - hm[2]));
    }
  }
  assert.ok(highVar > defVar, `high contrast ${highVar} should exceed default ${defVar}`);

  const grayDef = paintWith(0.5, 'shade');
  const grayHigh = paintWith(1, 'shade');
  let grayDiff = 0;
  for (let i = 0; i < grayDef.length; i += 4) {
    grayDiff = Math.max(grayDiff, Math.abs(grayDef[i] - grayHigh[i]));
  }
  assert.ok(grayDiff > 0, 'Gray mode should also change with the Relief slider');
});
