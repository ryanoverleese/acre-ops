const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const dismiss = f.load('app/map/soil-tap-dismiss.ts');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const soilHtml = '<div class="soil-popup"><div class="soil-popup-name">Holdrege silt loam</div></div>';
const canalHtml = '<div class="canal-popup"><div class="canal-popup-name">Elwood Canal</div></div>';
const fieldHtml = '<b>North 80</b><br>Olsen<br>80 ac';

function mockMap() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    off(type, fn) {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== fn));
    },
    fire(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn(event);
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

function mockPopup(content, { open = true } = {}) {
  return { getContent: () => content, isOpen: () => open };
}

test('isSoilPopupContent matches soil HTML only, not field or canal popups', () => {
  assert.equal(dismiss.isSoilPopupContent(soilHtml), true);
  assert.equal(dismiss.isSoilPopupContent("<div class='soil-popup'></div>"), true);
  assert.equal(dismiss.isSoilPopupContent(canalHtml), false);
  assert.equal(dismiss.isSoilPopupContent(fieldHtml), false);
  assert.equal(dismiss.isSoilPopupContent(''), false);
  const el = { classList: { contains: (name) => name === 'soil-popup' } };
  assert.equal(dismiss.isSoilPopupContent(el), true);
});

test('second tap after a soil popup is open only dismisses; the tap after that can open again', () => {
  const map = mockMap();
  const detach = dismiss.attachSoilTapDismiss(map);
  const popup = mockPopup(soilHtml);

  // First tap opens (no dismiss armed yet).
  assert.equal(dismiss.consumeSoilTapDismiss(map), false);
  map.fire('popupopen', { popup });

  // Second tap: preclick sees the open soil popup, click should not reopen.
  map.fire('preclick');
  map.fire('popupclose', { popup }); // Leaflet closes on preclick
  assert.equal(dismiss.consumeSoilTapDismiss(map), true);
  assert.equal(dismiss.consumeSoilTapDismiss(map), false); // flag is one-shot

  // Third tap: nothing open, so it may open a soil popup again.
  map.fire('preclick');
  assert.equal(dismiss.consumeSoilTapDismiss(map), false);

  detach();
  assert.equal(map.listenerCount('preclick'), 0);
  assert.equal(map.listenerCount('popupopen'), 0);
});

test('an open field or canal popup does not swallow the next soil tap', () => {
  const map = mockMap();
  const detach = dismiss.attachSoilTapDismiss(map);
  map.fire('popupopen', { popup: mockPopup(canalHtml) });
  map.fire('preclick');
  assert.equal(dismiss.consumeSoilTapDismiss(map), false);

  map.fire('popupopen', { popup: mockPopup(fieldHtml) });
  map.fire('preclick');
  assert.equal(dismiss.consumeSoilTapDismiss(map), false);
  detach();
});

test('a closed soil popup does not arm dismiss', () => {
  const map = mockMap();
  const detach = dismiss.attachSoilTapDismiss(map);
  const popup = mockPopup(soilHtml, { open: false });
  map.fire('popupopen', { popup });
  map.fire('preclick');
  assert.equal(dismiss.consumeSoilTapDismiss(map), false);
  detach();
});

test('staff map wires second-tap close into wide and detailed soil popups, and keeps field and canal bindPopup', () => {
  const unified = read('app/map/UnifiedMap.tsx');
  const detailed = read('app/map/soils-layer.ts');
  const canals = read('app/map/staff-canals.ts');
  assert.match(unified, /attachSoilTapDismiss\(map\)/);
  assert.match(unified, /consumeSoilTapDismiss\(map\)/);
  assert.match(unified, /if \(dismiss\) return/);
  assert.match(unified, /layer\.bindPopup\(fieldPopupHtml/);
  assert.match(detailed, /consumeSoilTapDismiss\(map\)/);
  assert.match(detailed, /fill\.off\('click'\)/);
  assert.match(detailed, /fill\.openPopup\(event\.latlng\)/);
  assert.match(canals, /layer\.bindPopup\(canalPopupHtml/);
});

test('grower and office soils map: second tap closes the soil popup; canal popups stay on bindPopup', () => {
  const overlay = read('components/SoilsOverlay.tsx');
  const canals = read('components/CanalsOverlay.tsx');
  assert.match(overlay, /attachSoilTapDismiss\(map\)/);
  assert.match(overlay, /consumeSoilTapDismiss\(map\)/);
  assert.match(overlay, /line\.off\('click'\)/);
  assert.match(overlay, /line\.openPopup\(event\.latlng\)/);
  assert.match(canals, /path\.bindPopup/);
  assert.doesNotMatch(canals, /consumeSoilTapDismiss/);
});

