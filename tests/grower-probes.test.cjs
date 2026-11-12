const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const f = require('./supabase/harness.cjs');
const probes = f.load('lib/grower-probes.ts');
const thumbs = f.load('lib/field-thumb.ts');

const installed = {
  id: 1, fieldId: 10, fieldName: 'Dahl Substation', serial: '412959', status: 'Installed',
  installDate: '2025-12-09', removalDate: null, ageSeasons: 2, elevation: 2200, lat: 40.5, lng: -99.1,
};
const removed = (id, fieldId, fieldName, serial) => ({
  id, fieldId, fieldName, serial, status: 'Removed',
  installDate: '2026-05-15', removalDate: '2026-09-17', ageSeasons: 1,
  elevation: null, lat: null, lng: null,
});

test('probe rows label age and do not show elevation', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app/grower/hardware/GrowerHardwareList.tsx'), 'utf8');
  assert.match(src, /Age: \$\{formatProbeAge/);
  assert.match(src, /Owned by: /);
  assert.match(src, /probe\.brand/);
  assert.equal(src.includes('elevation'), false);
});

test('probe dates keep one form and the year once when it matches', () => {
  assert.equal(probes.formatProbeListDates('2026-05-15', '2026-09-17'), 'May 15 – Sep 17, 2026');
  assert.equal(probes.formatProbeListDates('2025-12-09', '2026-09-18'), 'Dec 9, 2025 – Sep 18, 2026');
  assert.equal(probes.formatProbeListDates('2025-12-09', null), 'Installed Dec 9, 2025');
  assert.equal(probes.formatProbeListDates(null, '2026-09-17'), 'Sep 17, 2026');
  assert.equal(probes.formatProbeListDates(null, null), null);
});

test('removed probes collapse only when an active row remains', () => {
  const items = [installed, removed(2, 11, "Bill's", '412684'), removed(3, 11, "Bill's", '417527')];
  assert.equal(probes.canCollapseRemoved(items), true);
  assert.equal(probes.removedCount(items), 2);
  assert.equal(probes.probeStatusesMixed(items), true);
  assert.equal(probes.uniformStatusLabel(items), null);
  const collapsed = probes.groupProbes(items, false);
  assert.deepEqual(collapsed.map((group) => [group.fieldName, group.probes.length]), [
    ['Dahl Substation', 1],
  ]);
  const open = probes.groupProbes(items, true);
  assert.deepEqual(open.map((group) => `${group.fieldName} · ${group.probes.length}`), [
    'Dahl Substation · 1',
    "Bill's · 2",
  ]);
  const allRemoved = [removed(2, 11, "Bill's", '1'), removed(3, 12, 'Boston North', '2')];
  assert.equal(probes.canCollapseRemoved(allRemoved), false);
  assert.equal(probes.uniformStatusLabel(allRemoved), 'Removed');
  assert.equal(probes.probesSubline(2026, 35, 'Removed'), '2026 season · 35 probes · Removed');
  assert.equal(probes.probesSubline(2026, 1, null), '2026 season · 1 probe');
});

test('field thumb fits the boundary with a short pad and uses the field map tiles', () => {
  const ring = [
    [-99.16095, 40.51773],
    [-99.15151, 40.51765],
    [-99.15147, 40.51044],
    [-99.16099, 40.51051],
  ];
  const layout = thumbs.layoutFieldThumb([ring], 48);
  assert.ok(layout);
  assert.ok(layout.tiles.length >= 1 && layout.tiles.length <= 4);
  assert.match(layout.tiles[0].url, /^https:\/\/mt1\.google\.com\/vt\/lyrs=y&x=\d+&y=\d+&z=\d+$/);
  const map = fs.readFileSync(path.join(__dirname, '../components/fields/FieldMapBlock.tsx'), 'utf8');
  assert.match(map, /mt1\.google\.com\/vt\/lyrs=y/);
  assert.equal(thumbs.layoutFieldThumb([], 48), null);
  const css = fs.readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');
  assert.match(css, /\.field-thumb \{[^}]*width: 48px;[^}]*background: #E6E2DA/);
  assert.match(css, /\.field-thumb \{[^}]*width: 56px/);
  assert.match(css, /stroke: #fff;\s*stroke-width: 1\.5/);
});
