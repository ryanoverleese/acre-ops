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
  assert.match(unified, /closeOpenSoilPopup\(map\)/);
  assert.match(unified, /L\.popup\(SOIL_POPUP_OPTIONS\)/);
  assert.match(unified, /layer\.bindPopup\(fieldPopupHtml/);
  assert.match(detailed, /consumeSoilTapDismiss\(map\)/);
  assert.match(detailed, /closeOpenSoilPopup\(map\)/);
  assert.match(detailed, /fill\.bindPopup\(popupHtml\(unit\), SOIL_POPUP_OPTIONS\)/);
  assert.match(detailed, /fill\.off\('click'\)/);
  assert.match(detailed, /fill\.openPopup\(event\.latlng\)/);
  assert.match(canals, /layer\.bindPopup\(canalPopupHtml/);
  assert.match(canals, /closeButton: false/);
});

test('grower and office soils map: second tap closes the soil popup; canal popups stay on bindPopup', () => {
  const overlay = read('components/SoilsOverlay.tsx');
  const canals = read('components/CanalsOverlay.tsx');
  assert.match(overlay, /attachSoilTapDismiss\(map\)/);
  assert.match(overlay, /consumeSoilTapDismiss\(map\)/);
  assert.match(overlay, /closeOpenSoilPopup\(map\)/);
  assert.match(overlay, /SOIL_POPUP_OPTIONS/);
  assert.match(overlay, /line\.off\('click'\)/);
  assert.match(overlay, /line\.openPopup\(event\.latlng\)/);
  assert.match(canals, /path\.bindPopup/);
  assert.doesNotMatch(canals, /consumeSoilTapDismiss/);
});

test('soil popups share a visible, phone-tappable X close button', () => {
  const opts = dismiss.SOIL_POPUP_OPTIONS;
  assert.equal(opts.closeButton, true);
  assert.match(opts.className, /soil-popup-wrap/);
  assert.match(opts.className, /canal-popup-wrap/);
  const css = read('app/globals.css');
  assert.match(css, /\.soil-popup-wrap \.leaflet-popup-content/);
  assert.match(css, /margin: 8px 36px 8px 10px/);
  assert.match(css, /\.leaflet-container \.soil-popup-wrap a\.leaflet-popup-close-button/);
  assert.match(css, /width: 36px/);
  assert.match(css, /height: 36px/);
  assert.match(css, /font-family: Inter, system-ui/);
  // Canal popups stay without a close button.
  const canals = read('app/map/staff-canals.ts');
  assert.match(canals, /closeButton: false/);
  assert.doesNotMatch(canals, /SOIL_POPUP_OPTIONS/);
});

function outsideTarget() {
  return { closest: () => null };
}

function popupTarget() {
  return { closest: (sel) => (sel === '.leaflet-popup' ? {} : null) };
}

function mockMapWithClose() {
  const map = mockMap();
  map.closed = 0;
  map.containerListeners = [];
  map.container = {
    addEventListener(type, fn, options) {
      map.containerListeners.push({ type, fn, options });
    },
    removeEventListener(type, fn, options) {
      map.containerListeners = map.containerListeners.filter(
        (item) => !(item.type === type && item.fn === fn && item.options === options),
      );
    },
  };
  map.getContainer = () => map.container;
  map.closePopup = function closePopup() {
    map.closed += 1;
    const open = map._openPopup;
    if (open) {
      map._openPopup = null;
      map.fire('popupclose', { popup: open });
    }
  };
  map.trackOpen = (popup) => { map._openPopup = popup; };
  return map;
}

test('pointerdown outside an open soil popup arms dismiss and closes it', () => {
  const map = mockMapWithClose();
  const detach = dismiss.attachSoilTapDismiss(map);
  const popup = mockPopup(soilHtml);
  map.trackOpen(popup);
  map.fire('popupopen', { popup });

  assert.equal(dismiss.shouldArmDismissFromPointer(map, outsideTarget()), true);
  assert.equal(dismiss.shouldArmDismissFromPointer(map, popupTarget()), false);
  assert.equal(dismiss.pointerIsOnSoilPopup(popupTarget()), true);
  assert.equal(dismiss.pointerIsOnSoilPopup(outsideTarget()), false);

  map.fire('mousedown', { originalEvent: { target: outsideTarget() } });
  assert.equal(map.closed, 1);
  // Leaflet may still fire preclick after our close; the flag must stay set.
  map.fire('preclick');
  assert.equal(dismiss.consumeSoilTapDismiss(map), true);
  assert.equal(dismiss.consumeSoilTapDismiss(map), false);
  detach();
  assert.equal(map.listenerCount('mousedown'), 0);
  assert.equal(map.listenerCount('touchstart'), 0);
  assert.equal(map.containerListeners.length, 0);
});

test('touchstart and capture pointerdown also close an open soil popup', () => {
  const map = mockMapWithClose();
  const detach = dismiss.attachSoilTapDismiss(map);
  const popup = mockPopup(soilHtml);
  map.trackOpen(popup);
  map.fire('popupopen', { popup });
  map.fire('touchstart', { originalEvent: { target: outsideTarget() } });
  assert.equal(map.closed, 1);
  assert.equal(dismiss.consumeSoilTapDismiss(map), true);

  const popup2 = mockPopup(soilHtml);
  map.trackOpen(popup2);
  map.fire('popupopen', { popup: popup2 });
  const capture = map.containerListeners.find((item) => item.type === 'pointerdown' && item.options === true);
  assert.ok(capture, 'capture pointerdown should be attached to the map container');
  capture.fn({ target: outsideTarget() });
  assert.equal(map.closed, 2);
  assert.equal(dismiss.consumeSoilTapDismiss(map), true);
  detach();
});

test('a tap on the soil popup itself (including the X) does not arm dismiss', () => {
  const map = mockMapWithClose();
  const detach = dismiss.attachSoilTapDismiss(map);
  const popup = mockPopup(soilHtml);
  map.trackOpen(popup);
  map.fire('popupopen', { popup });
  map.fire('mousedown', { originalEvent: { target: popupTarget() } });
  assert.equal(map.closed, 0);
  assert.equal(dismiss.consumeSoilTapDismiss(map), false);
  detach();
});

test('armSoilTapDismiss is sticky after Leaflet closes the popup mid-gesture', () => {
  const map = mockMap();
  const detach = dismiss.attachSoilTapDismiss(map);
  const popup = mockPopup(soilHtml);
  map.fire('popupopen', { popup });
  map.fire('preclick');
  map.fire('popupclose', { popup });
  // A second preclick after close must not clear the already-armed flag.
  map.fire('preclick');
  assert.equal(dismiss.consumeSoilTapDismiss(map), true);
  detach();
});

