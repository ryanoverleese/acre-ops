import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { recordProbeRemoval, RemovalError } from '../lib/probe-removal.ts';

const link = id => [{ id, value: String(id) }];
const today = () => new Date().toISOString().slice(0, 10);
function fixture() {
  const assignments = [
    { id: 201, probe: link(11), field_season: link(101), probe_status: { value: 'Installed' }, install_date: '2026-05-01', planned_remover: 'Carter' },
    { id: 202, probe: link(12), field_season: link(101), probe_status: { value: 'Installed' }, install_date: '2026-05-01', planned_remover: 'Ryan' },
  ];
  const probes = [{ id: 11, status: 'Installed' }, { id: 12, status: 'Installed' }];
  const writes = [], notifications = [], uploads = [];
  const store = {
    async getAssignment(id) { const row = assignments.find(row => row.id === id); if (!row) throw new RemovalError('Not found', 404); return structuredClone(row); },
    async listAssignments() { return structuredClone(assignments); },
    async saveAssignment(id, patch) { writes.push(['assignment', id, structuredClone(patch)]); const row = assignments.find(row => row.id === id); Object.assign(row, patch); return structuredClone(row); },
    async saveProbe(id, patch) { writes.push(['probe', id, structuredClone(patch)]); Object.assign(probes.find(row => row.id === id), patch); },
    async uploadPhoto(photo) { uploads.push(photo.name); return { name: photo.name }; },
    notify(row) { notifications.push(structuredClone(row)); },
  };
  return { assignments, probes, writes, notifications, uploads, store };
}
const input = { source: 'crew', assignmentId: 201, removedBy: ' Brandon ', removalDate: '2026-10-11', notes: ' End of season ' };

test('only the selected assignment and its linked probe change; planned remover and sibling probe stay intact', async () => {
  const f = fixture(); const sibling = structuredClone(f.assignments[1]);
  const result = await recordProbeRemoval(input, f.store);
  assert.deepEqual(f.writes, [
    ['assignment', 201, { probe_status: 'Removed', removal_date: '2026-10-11', removed_by: 'Brandon', removal_notes: 'End of season' }],
    ['probe', 11, { status: 'In Stock' }],
  ]);
  assert.equal(f.assignments[0].planned_remover, 'Carter');
  assert.deepEqual(f.assignments[1], sibling);
  assert.deepEqual(f.probes[1], { id: 12, status: 'Installed' });
  assert.equal(result.removed_by, 'Brandon'); assert.equal(result.removal_date, '2026-10-11');
  assert.equal(f.notifications.length, 1);
});

test('crew default date and Workflows explicit date use identical writes', async () => {
  const crew = fixture(), workflow = fixture();
  await recordProbeRemoval({ source: 'crew', assignmentId: 201, removedBy: 'Ryan' }, crew.store);
  await recordProbeRemoval({ source: 'workflows', assignmentId: 201, removedBy: 'Ryan', removalDate: today() }, workflow.store);
  assert.deepEqual(crew.writes, workflow.writes);
  assert.equal(crew.notifications.length, 1);
  assert.equal(workflow.notifications.length, 0);
});

test('Workflows removal sends no webhook, including after an inventory failure and retry', async () => {
  const f = fixture(); const saveProbe = f.store.saveProbe;
  f.store.notify = () => assert.fail('Workflows must never notify CropX');
  f.store.saveProbe = async () => { throw Error('inventory unavailable'); };
  const workflowInput = { ...input, source: 'workflows' };
  await assert.rejects(recordProbeRemoval(workflowInput, f.store), error => error.status === 502);
  assert.equal(f.assignments[0].probe_status, 'Removed');
  assert.deepEqual(f.notifications, []);
  f.store.saveProbe = saveProbe;
  assert.equal((await recordProbeRemoval(workflowInput, f.store)).alreadyRemoved, true);
  assert.equal(f.probes[0].status, 'In Stock');
  assert.deepEqual(f.notifications, []);
});

test('missing or invalid shared removal source fails before reads, writes or notification', async () => {
  for (const source of [undefined, null, '', 'workflow', 'unknown']) {
    const f = fixture(); f.store.getAssignment = () => assert.fail('Must reject before reading');
    await assert.rejects(recordProbeRemoval({ ...input, source }, f.store), error => error.status === 400);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.notifications, []);
  }
});

test('invalid assignment IDs and blank actual remover fail before reading or writing', async () => {
  for (const change of [{ assignmentId: 0 }, { assignmentId: -1 }, { assignmentId: NaN }, { assignmentId: 1.5 }, { removedBy: '  ' }]) {
    const f = fixture(); f.store.getAssignment = () => assert.fail('Must reject before reading');
    await assert.rejects(recordProbeRemoval({ ...input, ...change }, f.store), error => error.status === 400);
    assert.deepEqual(f.writes, []);
  }
});

test('invalid calendar dates fail without mutation; a valid leap day is accepted', async () => {
  for (const date of ['', '2026-02-30', '2026-02-29', '2026-13-01', '10/12/2026', '2026-10-12T01:00:00Z']) {
    const f = fixture();
    await assert.rejects(recordProbeRemoval({ ...input, removalDate: date }, f.store), error => error.status === 400);
    assert.deepEqual(f.writes, []);
  }
  const f = fixture(); await recordProbeRemoval({ ...input, removalDate: '2024-02-29' }, f.store);
  assert.equal(f.assignments[0].removal_date, '2024-02-29');
});

test('missing and ambiguous probe links reject the entire action', async () => {
  for (const probe of [[], undefined, [...link(11), ...link(12)], link(-2)]) {
    const f = fixture(); f.assignments[0].probe = probe;
    await assert.rejects(recordProbeRemoval(input, f.store), error => error.status === 409);
    assert.deepEqual(f.writes, []);
  }
});

test('retry keeps original removal date, actual remover, notes and photos', async () => {
  const f = fixture();
  Object.assign(f.assignments[0], { probe_status: { value: 'Removed' }, removal_date: '2026-10-01', removed_by: 'Carter', removal_notes: 'Original', removal_photo: [{ name: 'original.jpg' }] });
  const original = structuredClone(f.assignments[0]);
  const result = await recordProbeRemoval({ ...input, photos: [new File(['new'], 'new.jpg')] }, f.store);
  assert.deepEqual(f.assignments[0], original);
  assert.equal(result.alreadyRemoved, true);
  assert.equal(result.removed_by, 'Carter'); assert.equal(result.removal_date, '2026-10-01');
  assert.deepEqual(f.writes, [['probe', 11, { status: 'In Stock' }]]);
  assert.deepEqual(f.notifications, []); assert.deepEqual(f.uploads, []);
});

test('inventory failure is explicit and retry finishes without overwriting removal history', async () => {
  const f = fixture(); const saveProbe = f.store.saveProbe;
  f.store.saveProbe = async () => { throw Error('private upstream response'); };
  await assert.rejects(recordProbeRemoval(input, f.store), error => error.status === 502 && error.message.includes('Removal recorded') && !error.message.includes('private'));
  const original = structuredClone(f.assignments[0]);
  f.store.saveProbe = saveProbe;
  const result = await recordProbeRemoval({ ...input, removedBy: 'Ryan', removalDate: today() }, f.store);
  assert.equal(result.alreadyRemoved, true); assert.deepEqual(f.assignments[0], original);
  assert.equal(f.probes[0].status, 'In Stock'); assert.equal(f.notifications.length, 1);
  assert.equal(f.writes.filter(([table]) => table === 'assignment').length, 1);
});

test('assignment write failure does not change probe inventory or notify', async () => {
  const f = fixture(); f.store.saveAssignment = async () => { throw Error('upstream failure'); };
  await assert.rejects(recordProbeRemoval(input, f.store), error => error.status === 502);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.notifications, []);
});

test('one failed photo does not prevent removal or other photos from saving', async () => {
  const f = fixture(); f.store.uploadPhoto = async photo => { if (photo.name === 'bad.jpg') throw Error('private upload error'); return { name: photo.name }; };
  const result = await recordProbeRemoval({ ...input, photos: [new File(['a'], 'bad.jpg'), new File(['b'], 'good.jpg')] }, f.store);
  assert.equal(result.photos, 1); assert.deepEqual(result.photoErrors, ['A removal photo could not be uploaded']);
  assert.deepEqual(f.assignments[0].removal_photo, [{ name: 'good.jpg' }]);
  assert.equal(f.probes[0].status, 'In Stock');
});

test('a reinstalled physical probe is not returned to stock by an old removal request', async () => {
  const f = fixture();
  Object.assign(f.assignments[0], { probe_status: { value: 'Removed' }, removal_date: '2026-09-30', removed_by: 'Carter' });
  f.assignments.push({ id: 203, probe: link(11), field_season: link(102), probe_status: { value: 'Installed' } });
  await assert.rejects(recordProbeRemoval(input, f.store), error => error.status === 409);
  assert.deepEqual(f.writes, []); assert.equal(f.probes[0].status, 'Installed');
});

test('an active second assignment for the same device blocks ambiguous removal', async () => {
  const f = fixture();
  f.assignments.push({ id: 203, probe: link(11), field_season: link(102), probe_status: { value: 'Assigned' }, install_date: '2026-05-02' });
  await assert.rejects(recordProbeRemoval(input, f.store), error => error.status === 409);
  assert.deepEqual(f.writes, []);
});

test('missing assignments and failed safety reads never write anything', async () => {
  const f = fixture();
  await assert.rejects(recordProbeRemoval({ ...input, assignmentId: 999 }, f.store), error => error.status === 404);
  f.store.listAssignments = async () => { throw Error('network failure'); };
  await assert.rejects(recordProbeRemoval(input, f.store));
  assert.deepEqual(f.writes, []);
});

test('both screens submit to the same endpoint, which uses shared logic and cache-invalidating Baserow writes', () => {
  const workflow = readFileSync(new URL('../app/workflows/WorkflowsClient.tsx', import.meta.url), 'utf8');
  const submit = workflow.slice(workflow.indexOf('const handleSubmit ='), workflow.indexOf('const handleRegisterSubmit ='));
  assert.match(submit, /fetch\('\/api\/removal'/);
  assert.match(submit, /form.append\('source', 'workflows'\)/);
  assert.match(submit, /form.append\('removedBy', removedBy.trim\(\)\)/);
  assert.match(submit, /form.append\('removalDate', removalDate\)/);
  assert.doesNotMatch(submit, /\/api\/(probes|probe-assignments)|planned_remover|selected\.probeId/);
  const crew = readFileSync(new URL('../app/installer/RemovalsScreen.tsx', import.meta.url), 'utf8');
  assert.match(crew, /fetch\('\/api\/removal'/);
  assert.match(crew, /fd.append\('source', 'crew'\)/);
  const route = readFileSync(new URL('../app/api/removal/route.ts', import.meta.url), 'utf8');
  assert.match(route, /await recordProbeRemoval\(/);
  assert.match(route, /updateRow<ProbeAssignment>\('probe_assignments'/);
  assert.match(route, /updateRow\('probes'/);
  assert.doesNotMatch(route, /planned_remover|supabase/i);
});
