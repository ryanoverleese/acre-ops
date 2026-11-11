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
});
