const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('staff map: Canals is a view-only layer toggle that reuses the field-map canal asset', () => {
  const client = read('app/map/MapClient.tsx');
  const unified = read('app/map/UnifiedMap.tsx');
  const layer = read('app/map/staff-canals.ts');
  assert.match(client, /canals: 'Canals'/);
  assert.match(client, /canals: false/); // off by default
  assert.match(unified, /canals: boolean/);
  assert.match(unified, /attachStaffCanals\(map\)/);
  assert.match(unified, /\[layers\.canals\]/);
  assert.match(layer, /CANALS_URL/);
  assert.match(layer, /STAFF_CANALS_PANE_Z = '410'/);
  assert.match(layer, /pointerEvents = 'none'/);
  // No correction tools on the staff map.
  for (const src of [client, unified, layer]) {
    assert.doesNotMatch(src, /Not there|canal-popup-flag|canal-fix|Mark missing/i);
  }
  const asset = JSON.parse(read('public/overlays/canals-kearney-phelps.geojson'));
  assert.ok(asset.features.length > 100);
});
