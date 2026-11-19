const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('staff map Layers panel collapses, remembers the choice, and leaves layers on', () => {
  const client = read('app/map/MapClient.tsx');
  const css = read('app/globals.css');

  assert.match(client, /LAYERS_PANEL_KEY = 'acre-ops-map-layers-open'/);
  assert.match(client, /LAYERS_PANEL_NARROW = '\(max-width: 768px\)'/);
  assert.match(client, /readStoredLayersOpen/);
  assert.match(client, /localStorage\.setItem\(LAYERS_PANEL_KEY, next \? 'open' : 'closed'\)/);
  assert.match(client, /toggleLayersPanel/);
  assert.match(client, /staff-layers-panel/);
  assert.match(client, /staff-layers-toggle/);
  assert.match(client, /aria-expanded=\{layersOpen \?\? undefined\}/);
  assert.match(client, /aria-controls="staff-layers-body"/);
  assert.match(client, /staff-layers-chevron/);
  // Body is hidden with CSS, not unmounted, so layer state stays put.
  assert.match(client, /id="staff-layers-body"/);
  assert.match(client, /className="staff-layers-body"/);
  assert.equal(client.includes('layersOpen && ('), false);
  assert.equal(client.includes('layersOpen ? ('), false);
  // UnifiedMap still receives the live layer state whether the panel is open or not.
  const mapIdx = client.indexOf('<UnifiedMap');
  const panelIdx = client.indexOf('staff-layers-panel');
  const layersPropIdx = client.indexOf('layers={layers}');
  assert.ok(mapIdx > 0 && panelIdx > mapIdx);
  assert.ok(layersPropIdx > mapIdx && layersPropIdx < panelIdx);

  assert.match(css, /\.staff-layers-panel/);
  assert.match(css, /\.staff-layers-toggle/);
  assert.match(css, /\.staff-layers-panel\.is-closed \.staff-layers-body \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /\.staff-layers-panel:not\(\.is-open\) \.staff-layers-body \{ display: none; \}/);
  assert.match(css, /\.staff-layers-panel\.is-open \.staff-layers-body \{ display: block; \}/);
});

test('grower field map has no staff Layers panel; its low-spots strip is unchanged', () => {
  const grower = read('app/grower/GrowerFieldMap.tsx');
  assert.equal(grower.includes('staff-layers-panel'), false);
  assert.equal(grower.includes('toggleLayersPanel'), false);
  assert.match(grower, /lowspots-strip/);
  assert.match(grower, /Low spots/);
});
