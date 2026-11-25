const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const scale = f.load('lib/terrain/color-scale.ts');
const rows = f.load('lib/probe-row.ts');
const nav = f.load('lib/grower-nav.ts');
const ramp = f.load('lib/terrain/ramp.ts');

test('legend range keeps whole feet and says ft once', () => {
  assert.equal(scale.formatLegendRange(674.1867065429688, 678.5460815429688), '2212–2226 ft');
  assert.equal(scale.formatLegendRange(100, 100), `${Math.round(100 * 3.28084)}–${Math.round(100 * 3.28084)} ft`);
  assert.equal(scale.formatLegendRange(Number.NaN, 10), '');
});

test('legend ramp is the CutSheetRX gradient, not a different scale', () => {
  const css = ramp.elevationCssGradient();
  assert.match(css, /rgb\(33,64,154\)/);
  assert.match(css, /rgb\(216,48,52\)/);
  const map = fs.readFileSync(path.join(__dirname, '../components/fields/FieldMapBlock.tsx'), 'utf8');
  assert.match(map, /elevationCssGradient\(\)/);
  assert.match(map, /useLidarLabel/);
  assert.match(map, /\n\s*Satellite\n/);
  assert.match(map, /Imagery · Google/);
  assert.match(map, /map-legend-kind">Elevation/);
  assert.match(map, /formatElevationStrip/);
  const sheet = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(sheet, /\.map-seg button\.map-seg-sat \{ min-width: 88px; \}/);
  const overlay = fs.readFileSync(path.join(__dirname, '../components/ElevationOverlay.tsx'), 'utf8');
  assert.match(overlay, /colorshade: 0\.9/);
  assert.match(overlay, /shade: 0\.9/);
  assert.match(map, /padding: \[16, 16\]/);
  assert.equal(map.includes('viridis'), false);
});

test('probe dates are not invented', () => {
  assert.equal(rows.formatProbeDates('2026-05-15', '2026-09-17'), 'May 15, 2026 – Sep 17, 2026');
  assert.equal(rows.formatProbeDates(null, '2026-09-17'), 'Out Sep 17, 2026');
  assert.equal(rows.formatProbeDates('2026-05-15', null), 'May 15, 2026');
  assert.equal(rows.formatProbeDates(null, null), null);
  assert.equal(rows.formatProbeDates('', ''), null);
  assert.equal(rows.formatProbeSerial('414036'), '#414036');
  assert.equal(rows.formatProbeSerial('#414036'), '#414036');
  assert.equal(rows.formatProbeSerial(''), null);
});

test('grower pill tabs point at the existing routes and field detail stays on Fields', () => {
  assert.deepEqual(nav.GROWER_TABS.map((tab) => tab.href), [
    '/grower/fields',
    '/grower/hardware',
    '/grower/recommendations',
  ]);
  assert.deepEqual(nav.GROWER_TABS.map((tab) => tab.label), ['Fields', 'Probes', 'Recs']);
  assert.equal(nav.growerTabForPath('/grower/fields/42'), 'fields');
  assert.equal(nav.growerTabForPath('/grower'), 'fields');
  assert.equal(nav.growerTabForPath('/grower/hardware'), 'probes');
  assert.equal(nav.growerTabForPath('/grower/recommendations'), 'recs');
  assert.equal(nav.growerTabForPath('/grower/login'), null);
  const detail = fs.readFileSync(path.join(__dirname, '../app/grower/fields/[id]/FieldDetailClient.tsx'), 'utf8');
  assert.equal(detail.includes('Water recommendations'), false);
  assert.equal(detail.includes('waterRecs'), false);
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  const recsPage = fs.readFileSync(path.join(__dirname, '../app/grower/recommendations/page.tsx'), 'utf8');
  const fieldMap = fs.readFileSync(path.join(__dirname, '../components/fields/FieldMapBlock.tsx'), 'utf8');
  assert.match(recsPage, /listGrowerWaterRecsForSeason/);
  assert.equal(fieldMap.includes('{!expanded && ('), false);
  assert.match(css, /padding-top: env\(safe-area-inset-top/);
  assert.equal(/is-map-expanded \.map-seg,[\s\S]*?display:\s*none/.test(css), false);
  assert.match(css, /\.grower-section-title \{[^}]*font-size: 12px;[^}]*font-weight: 500;[^}]*text-transform: none;[^}]*letter-spacing: 0;/);
  assert.match(css, /\.grower-pill \{[^}]*height: 52px/);
  assert.match(css, /box-shadow: 0 2px 8px rgba\(0, 0, 0, 0\.16\)/);
  assert.match(css, /background: #1A1A1A/);
});
