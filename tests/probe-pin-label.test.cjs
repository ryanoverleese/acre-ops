const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('./supabase/harness.cjs');
const labels = f.load('lib/probe-pin-label.ts');

test('list title uses the same probe number the map pin draws', () => {
  assert.equal(labels.probePinText({ probeNumber: 1, label: null }), '1');
  assert.equal(labels.probePinText({ probeNumber: 2, label: '' }), '2');
  assert.equal(labels.probeListTitle({ probeNumber: 1 }), 'Probe 1');
  assert.equal(labels.probeListTitle({ probeNumber: 2 }), 'Probe 2');
  assert.equal(
    labels.probeListTitle({ probeNumber: 2 }).endsWith(labels.probePinText({ probeNumber: 2 })),
    true,
  );
  assert.equal(labels.probePinText({ probeNumber: 2, label: 'NE' }), 'NE');
  assert.equal(labels.probeListTitle({ probeNumber: 2 }), 'Probe 2');
  assert.equal(labels.probePinText({ probeNumber: null, label: null }), 'P');
  assert.equal(labels.probeListTitle({ probeNumber: null }), 'Probe');
});

test('pin order is probe number then id, missing numbers last', () => {
  const rows = [
    { id: 9, probeNumber: 2 },
    { id: 3, probeNumber: null },
    { id: 8, probeNumber: 2 },
    { id: 4, probeNumber: 1 },
  ];
  rows.sort(labels.compareProbePinOrder);
  assert.deepEqual(rows.map((row) => row.id), [4, 8, 9, 3]);
  assert.deepEqual(rows.map((row) => labels.probeListTitle(row)), ['Probe 1', 'Probe 2', 'Probe 2', 'Probe']);
  assert.deepEqual(rows.map((row) => labels.probePinText(row)), ['1', '2', '2', 'P']);
});
