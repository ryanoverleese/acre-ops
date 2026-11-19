const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./supabase/harness.cjs');
const ls = f.load('lib/terrain/lowspots.ts');

// Plane falling 1 cm per cell to the east, 1 m cells, with an optional round pit.
function grid(w, h, pit) {
  const elev = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let z = 700 - 0.01 * x + 0.001 * Math.abs(y - h / 2);
      if (pit) {
        const r = Math.hypot(x - pit.x, y - pit.y);
        if (r < pit.r) z -= pit.depth * (1 - r / pit.r);
      }
      elev[y * w + x] = z;
    }
  }
  return elev;
}

test('a plain slope has no low spots and drains east', () => {
  const w = 200;
  const h = 120;
  const r = ls.computeLowSpots({ elev: grid(w, h), width: w, height: h, cellM: 1 }, { flowAreaM2: 2000 });
  assert.equal(r.ponds, 0);
  assert.equal(r.maxDepthM, 0);
  assert.ok(r.lines.length > 0, 'flow lines drawn');
  for (const line of r.lines) {
    const a = line.pts[0];
    const b = line.pts[line.pts.length - 1];
    assert.ok(b[0] >= a[0], 'flow does not run uphill');
  }
});

test('a pit fills to its spill height and reports depth', () => {
  const w = 200;
  const h = 120;
  const pit = { x: 100, y: 60, r: 20, depth: 0.6 };
  const r = ls.computeLowSpots({ elev: grid(w, h, pit), width: w, height: h, cellM: 1 });
  assert.equal(r.ponds, 1);
  const center = r.depth[60 * w + 100];
  // Spill is on the low (east) rim, so the fill is shallower than the cut.
  assert.ok(center > 0.3 && center <= 0.6, `center depth ${center}`);
  assert.equal(r.depth[60 * w + 20], 0, 'dry upslope');
  assert.equal(r.depth[5 * w + 100], 0, 'dry off to the side');
});

test('tiny and shallow pits are dropped', () => {
  const w = 120;
  const h = 80;
  const r = ls.computeLowSpots(
    { elev: grid(w, h, { x: 60, y: 40, r: 3, depth: 0.03 }), width: w, height: h, cellM: 1 },
  );
  assert.equal(r.ponds, 0);
});

test('no-data cells act as outlets and never get depth', () => {
  const w = 100;
  const h = 100;
  const elev = grid(w, h, { x: 50, y: 50, r: 15, depth: 0.5 });
  for (let i = 0; i < w * 10; i++) elev[i] = NaN;
  const r = ls.computeLowSpots({ elev, width: w, height: h, cellM: 1 });
  for (let i = 0; i < w * 10; i++) assert.equal(r.depth[i], 0);
  assert.equal(r.ponds, 1);
});

test('flow-line threshold scales with cell size', () => {
  assert.equal(ls.defaultFlowAreaM2(1), 10000);
  assert.equal(ls.defaultFlowAreaM2(7), 800 * 49);
});
