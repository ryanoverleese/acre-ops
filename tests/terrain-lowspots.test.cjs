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


test('slider midpoint matches the original default thresholds', () => {
  const mid = ls.optionsFromSliders(50, 50, 1);
  assert.equal(mid.minPondDepthM, 0.06);
  assert.equal(mid.minPondAreaM2, 100);
  assert.equal(mid.minShadeDepthM, 0.03);
  assert.equal(mid.flowAreaM2, 10000);
  assert.equal(ls.optionsFromSliders(50, 50, 7).flowAreaM2, ls.defaultFlowAreaM2(7));
});

test('raising the sliders shows more ponds and more drainage lines', () => {
  const w = 240;
  const h = 160;
  const elev = grid(w, h);
  // Three pits of different size/depth on the same slope.
  const pits = [
    { x: 70, y: 70, r: 32, depth: 0.8 },
    { x: 160, y: 55, r: 14, depth: 0.25 },
    { x: 200, y: 110, r: 5, depth: 0.2 },
  ];
  for (const pit of pits) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = Math.hypot(x - pit.x, y - pit.y);
        if (r < pit.r) elev[y * w + x] -= pit.depth * (1 - r / pit.r);
      }
    }
  }
  const analysis = ls.analyzeLowSpots({ elev, width: w, height: h, cellM: 1 });
  const few = ls.extractLowSpots(analysis, ls.optionsFromSliders(0, 0, 1));
  const mid = ls.extractLowSpots(analysis, ls.optionsFromSliders(50, 50, 1));
  const many = ls.extractLowSpots(analysis, ls.optionsFromSliders(100, 100, 1));
  assert.equal(ls.computeLowSpots({ elev, width: w, height: h, cellM: 1 }).ponds, mid.ponds);
  assert.ok(few.ponds < mid.ponds && mid.ponds < many.ponds, `ponds ${few.ponds} ${mid.ponds} ${many.ponds}`);
  assert.ok(few.lines.length < mid.lines.length && mid.lines.length <= many.lines.length,
    `lines ${few.lines.length} ${mid.lines.length} ${many.lines.length}`);
  assert.ok(few.flowAreaM2 > mid.flowAreaM2 && mid.flowAreaM2 > many.flowAreaM2);
});

test('arrows along a line point toward later points and skip short lines', () => {
  const east = ls.arrowsAlongPolyline([[0, 0], [100, 0]], 25);
  assert.ok(east.length >= 3);
  for (const a of east) {
    assert.ok(Math.abs(a.angle) < 0.05, `angle ${a.angle}`);
    assert.ok(a.x > 0 && a.x < 100);
    assert.equal(a.y, 0);
  }
  const west = ls.arrowsAlongPolyline([[100, 0], [0, 0]], 25);
  for (const a of west) {
    assert.ok(Math.abs(Math.abs(a.angle) - Math.PI) < 0.05, `angle ${a.angle}`);
  }
  assert.deepEqual(ls.arrowsAlongPolyline([[0, 0], [10, 0]], 25), []);
});

test('drainage arrows point downhill along computed flow lines', () => {
  const w = 200;
  const h = 120;
  const elev = grid(w, h);
  const r = ls.computeLowSpots({ elev, width: w, height: h, cellM: 1 }, { flowAreaM2: 2000 });
  let marks = 0;
  for (const line of r.lines) {
    // pts are upstream-first. Tributaries run toward the mid-row valley first,
    // then east; arrows must follow that downhill route, not always point east.
    const arrows = ls.arrowsAlongPolyline(line.pts, 8);
    for (const a of arrows) {
      marks++;
      const aheadX = Math.max(0, Math.min(w - 1, Math.round(a.x + Math.cos(a.angle) * 3)));
      const aheadY = Math.max(0, Math.min(h - 1, Math.round(a.y + Math.sin(a.angle) * 3)));
      const hereX = Math.max(0, Math.min(w - 1, Math.round(a.x)));
      const hereY = Math.max(0, Math.min(h - 1, Math.round(a.y)));
      if (aheadX === hereX && aheadY === hereY) continue;
      const here = elev[hereY * w + hereX];
      const ahead = elev[aheadY * w + aheadX];
      assert.ok(ahead <= here + 0.002, `arrow aimed uphill ${here} -> ${ahead} at ${hereX},${hereY} angle ${a.angle}`);
    }
  }
  assert.ok(marks > 0, 'expected arrows on flow lines');
});
