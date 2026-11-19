const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const fade = f.load('lib/terrain/elev-fade.ts');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('elevation tiles fade in over 300-500ms, not Leaflet\'s 200ms snap', () => {
  assert.equal(fade.ELEV_TILE_FADE_MS >= 300, true);
  assert.equal(fade.ELEV_TILE_FADE_MS <= 500, true);
  assert.equal(fade.ELEV_TILE_PRUNE_DELAY_MS, fade.ELEV_TILE_FADE_MS + 50);
  assert.equal(fade.elevTileFadeProgress(-10), 0);
  assert.equal(fade.elevTileFadeProgress(0), 0);
  assert.equal(fade.elevTileFadeProgress(fade.ELEV_TILE_FADE_MS / 2), 0.5);
  assert.equal(fade.elevTileFadeProgress(fade.ELEV_TILE_FADE_MS), 1);
  assert.equal(fade.elevTileFadeProgress(fade.ELEV_TILE_FADE_MS + 80), 1);
});

test('staff and grower elevation layers share the grid fade; soils are unchanged', () => {
  const grid = read('lib/terrain/elev-grid.ts');
  const staff = read('app/map/elevation-layer.ts');
  const grower = read('components/ElevationOverlay.tsx');
  assert.match(grid, /elevTileFadeProgress/);
  assert.match(grid, /ELEV_TILE_PRUNE_DELAY_MS/);
  assert.match(grid, /keepBuffer: 2/);
  assert.match(grid, /updateWhenZooming: false/);
  // Hold done() until the canvas is painted so a blank tile does not flash in.
  assert.match(grid, /tile\._done = done/);
  assert.match(grid, /if \(el\._done\)/);
  // Failed tiles still complete, so they cannot sit invisible and hide old tiles.
  assert.match(grid, /finish\(false\)/);
  assert.match(staff, /createElevGridLayer/);
  assert.match(grower, /createElevGridLayer/);
  assert.doesNotMatch(read('app/map/soils-layer.ts'), /ELEV_TILE_FADE_MS/);
  assert.doesNotMatch(read('app/map/soils-wide-layer.ts'), /ELEV_TILE_FADE_MS/);
  assert.doesNotMatch(read('components/SoilsOverlay.tsx'), /ELEV_TILE_FADE_MS/);
});
