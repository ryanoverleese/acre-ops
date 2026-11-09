const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const f = require('./supabase/harness.cjs');
const engine = f.load('lib/field-boundaries/engine.ts');

const KNOWN_UUID = '2dbbe0ea-8eee-49a4-8ec8-399c1b628ed2';
const DUP_UUID = 'd2d8c517-f266-4661-af05-f66198b76ccd';
const root = path.resolve(__dirname, '..');

function ring(lon, lat, w, h) {
  return [[lon, lat], [lon + w, lat], [lon + w, lat + h], [lon, lat + h], [lon, lat]];
}
function content(geometry, extra = {}) {
  return { fieldId: 55555, fieldName: '6', geoJsonBoundary: geometry, farm: { id: 7, name: '3W Farms' }, ...extra };
}
function dataset(items) {
  return { source: 'cropx', crs: 'EPSG:4326', axisOrder: 'lonlat', observedAt: '2026-11-05T23:00:00Z', items };
}
function square(lon = -99.5) {
  return { type: 'Polygon', coordinates: [ring(lon, 40.4, 0.02, 0.02)] };
}
const holey = { type: 'Polygon', coordinates: [ring(-99.5, 40.4, 0.02, 0.02), ring(-99.494, 40.406, 0.004, 0.004)] };
const outsideHole = { type: 'Polygon', coordinates: [ring(-99.5, 40.4, 0.02, 0.02), ring(-99.4, 40.4, 0.004, 0.004)] };
const catalog = [
  { id: 18, cropxFieldUuid: KNOWN_UUID },
  { id: 245, cropxFieldUuid: DUP_UUID },
  { id: 249, cropxFieldUuid: DUP_UUID },
  { id: 30, cropxFieldUuid: null },
];

test('geometry accepts polygons and multipolygons with holes and rejects everything else', () => {
  assert.equal(engine.inspectGeometry(square()).ok, true);
  assert.equal(engine.inspectGeometry({ type: 'MultiPolygon', coordinates: [holey.coordinates, [ring(-99.2, 40.2, 0.01, 0.01)]] }).ok, true);
  assert.equal(engine.inspectGeometry(holey).ok, true);
  assert.equal(engine.inspectGeometry(outsideHole).detail, 'A hole is outside its exterior ring');
  assert.equal(engine.inspectGeometry({ type: 'Polygon', coordinates: [ring(-99.5, 40.4, 0.02, 0.02).slice(0, 4)] }).detail, 'Each ring must be closed');
  assert.equal(engine.inspectGeometry({ type: 'Polygon', coordinates: [[[-99.5, 40.4, 0], [-99.48, 40.4, 0], [-99.48, 40.42, 0], [-99.5, 40.42, 0], [-99.5, 40.4, 0]]] }).detail, 'Each position must be longitude and latitude only');
  assert.equal(engine.inspectGeometry({ type: 'LineString', coordinates: ring(-99.5, 40.4, 0.02, 0.02) }).detail, 'Boundary geometry must be a Polygon or MultiPolygon');
  assert.equal(engine.inspectGeometry({ type: 'Polygon', coordinates: [ring(40.4, -99.5, 0.02, 0.02)] }).detail, 'Coordinates are outside EPSG:4326 longitude and latitude ranges');
  assert.throws(() => engine.inspectGeometry({ type: 'Polygon', coordinates: [ring(-99.5, 40.4, 0.02, 0.02)], crs: 'EPSG:3857' }), /unrecognized field/);
});

test('identity uses fields.id and an exact CropX uuid, never a field-season id or CropX fieldId', () => {
  assert.throws(() => engine.parseBoundaryDataset(dataset([
    { cropxFieldUuid: KNOWN_UUID, content: content(square()) },
    { cropxFieldUuid: KNOWN_UUID.toUpperCase(), content: content(square(-99.3)) },
  ])), /repeats/);
  const parsed = engine.parseBoundaryDataset(dataset([
    { cropxFieldUuid: KNOWN_UUID.toUpperCase(), acreFieldId: 18, content: content(square()) },
  ]));
  const rows = engine.classifyBoundaries(engine.parseBoundaryDataset(dataset([
    { cropxFieldUuid: KNOWN_UUID, acreFieldId: 18, content: content(square()) },
    { cropxFieldUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', content: content(square(-99.3), { fieldId: 1623 }) },
    { cropxFieldUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', acreFieldId: 1623, content: content(square(-99.2)) },
    { cropxFieldUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', acreFieldId: 415, content: content(square(-99.1)) },
    { cropxFieldUuid: DUP_UUID, acreFieldId: 245, content: content(square(-98.9)) },
    { cropxFieldUuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', acreFieldId: 30, content: content(square(-98.8)) },
    { cropxFieldUuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', content: content(outsideHole) },
  ])), catalog, []);
  const byUuid = Object.fromEntries(rows.map(row => [row.cropxFieldUuid, row]));
  assert.equal(byUuid[KNOWN_UUID].disposition, 'eligible');
  assert.equal(byUuid[KNOWN_UUID].resolvedFieldId, 18);
  assert.equal(byUuid[KNOWN_UUID].sourceCropxFieldId, '55555');
  assert.notEqual(byUuid[KNOWN_UUID].resolvedFieldId, 1623);
  assert.equal(byUuid['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'].disposition, 'unmatched');
  assert.equal(byUuid['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'].resolvedFieldId, null);
  assert.equal(byUuid['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'].disposition, 'identity_disagreement');
  assert.equal(byUuid['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'].detail, 'acreFieldId is not a fields.id');
  assert.equal(byUuid['cccccccc-cccc-4ccc-8ccc-cccccccccccc'].disposition, 'identity_disagreement');
  assert.equal(byUuid[DUP_UUID].disposition, 'ambiguous');
  assert.equal(byUuid[DUP_UUID].resolvedFieldId, null);
  assert.equal(byUuid['dddddddd-dddd-4ddd-8ddd-dddddddddddd'].disposition, 'unconfirmed_crosswalk');
  assert.equal(byUuid['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'].disposition, 'invalid_geometry');
  assert.equal(byUuid['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'].geometry, null);
  assert.equal(parsed.items[0].cropxFieldUuid, KNOWN_UUID);
  assert.throws(() => engine.parseBoundaryDataset({ ...dataset([]), crs: 'EPSG:3857', items: [{ cropxFieldUuid: KNOWN_UUID, content: content(square()) }] }), /EPSG:4326/);
  assert.throws(() => engine.parseBoundaryDataset({ source: 'cropx', axisOrder: 'lonlat', observedAt: '2026-11-05T23:00:00Z', items: [] }), /required field/);
  assert.throws(() => engine.parseBoundaryDataset(dataset([{ cropxFieldUuid: KNOWN_UUID, content: { ...content(square()), center: [10, 10] } }])), /outside the boundary extent/);
  const same = engine.geometrySha256(square());
  const changed = engine.classifyBoundaries(engine.parseBoundaryDataset(dataset([
    { cropxFieldUuid: KNOWN_UUID, content: content(square()) },
  ])), catalog, [{ fieldId: 18, cropxFieldUuid: KNOWN_UUID, geometrySha256: same, edited: false }]);
  assert.equal(changed[0].disposition, 'unchanged');
  const edited = engine.classifyBoundaries(engine.parseBoundaryDataset(dataset([
    { cropxFieldUuid: KNOWN_UUID, content: content(square(-99.46)) },
  ])), catalog, [{ fieldId: 18, cropxFieldUuid: KNOWN_UUID, geometrySha256: same, edited: true }]);
  assert.equal(edited[0].disposition, 'conflict_edited');
  const conflict = engine.classifyBoundaries(engine.parseBoundaryDataset(dataset([
    { cropxFieldUuid: KNOWN_UUID, content: content(square(-99.46)) },
  ])), catalog, [{ fieldId: 18, cropxFieldUuid: KNOWN_UUID, geometrySha256: same, edited: false }]);
  assert.equal(conflict[0].disposition, 'conflict_changed');
  assert.equal(JSON.stringify(engine.reviewOf(rows)).includes('-99.5'), false);
});

test('offline dry-run writes nothing and does not echo coordinates or secrets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acre-boundaries-'));
  const datasetFile = path.join(dir, 'dataset.json');
  const catalogFile = path.join(dir, 'catalog.json');
  fs.writeFileSync(datasetFile, JSON.stringify(dataset([
    { cropxFieldUuid: KNOWN_UUID, acreFieldId: 18, content: content(square(-99.123456)) },
    { cropxFieldUuid: DUP_UUID, content: content(square(-98.7)) },
    { cropxFieldUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', acreFieldId: 1623, content: content(square(-98.6)) },
  ])));
  fs.writeFileSync(catalogFile, JSON.stringify({ fields: catalog }));
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/import-cropx-boundaries.cjs'), '--dataset', datasetFile, '--catalog', catalogFile], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'postgresql://postgres:super-secret-password@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres', BOUNDARY_IMPORT_APPLY: engine.BOUNDARY_IMPORT_APPLY_VALUE },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.includes('super-secret-password'), false);
  assert.equal(run.stdout.includes('-99.123456'), false);
  const report = JSON.parse(run.stdout);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.writes, 0);
  assert.equal(report.summary.eligible, 1);
  assert.equal(report.summary.ambiguous, 1);
  assert.equal(report.summary.identity_disagreement, 1);
  const refused = spawnSync(process.execPath, [path.join(root, 'scripts/import-cropx-boundaries.cjs'), '--stage', '--dataset', datasetFile, '--catalog', catalogFile], { encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /disabled/);
  assert.equal(refused.stdout.includes('super-secret-password'), false);
});

let admin, crew, field, other;
test('handoff holds duplicates, disagreements, failed fetches, and season-id mixups', () => {
  const polygon = square();
  const fetched = '2026-11-05T17:34:15.528563-06:00';
  const raw = uuid => ({ fetched_at: fetched, http_status: 200, name: null, farmName: null, geoJsonBoundary: polygon });
  const bundle = {
    crs: 'EPSG:4326', axisOrder: 'lonlat', crsDeclaredBy: 'handoff README: lon/lat',
    indexRows: [
      { field_id: 18, field_season_id: 415, br_fs_id: 1623, cropx_field_uuid: KNOWN_UUID, sb_cropx_uuid: KNOWN_UUID },
      { field_id: 245, field_season_id: 349, br_fs_id: 1368, cropx_field_uuid: DUP_UUID, sb_cropx_uuid: DUP_UUID },
      { field_id: 249, field_season_id: 351, br_fs_id: 1370, cropx_field_uuid: DUP_UUID, sb_cropx_uuid: DUP_UUID },
      { field_id: 522, field_season_id: 339, br_fs_id: 1356, cropx_field_uuid: '3971ae01-ebef-4242-8f64-fafd10e80f84', sb_cropx_uuid: '3971ae01-ebef-4242-8f64-fafd10e80f84' },
      { field_id: 77, field_season_id: 9999, br_fs_id: 1891, cropx_field_uuid: '119a4048-69cf-4114-a92d-6cfb99440a02', sb_cropx_uuid: '119a4048-69cf-4114-a92d-6cfb99440a02' },
    ],
    rawByUuid: {
      [KNOWN_UUID]: raw(),
      [DUP_UUID]: raw(),
      '3971ae01-ebef-4242-8f64-fafd10e80f84': { fetched_at: fetched, http_status: 400, geoJsonBoundary: null },
      '119a4048-69cf-4114-a92d-6cfb99440a02': raw(),
    },
    holds: [
      { fieldId: 522, cropxFieldUuid: '3971ae01-ebef-4242-8f64-fafd10e80f84', issue: 'sb_uuid_disagrees_with_workbook' },
      { fieldId: 539, cropxFieldUuid: null, issue: 'workbook_missing_cx_uuid' },
    ],
    duplicateUuids: [DUP_UUID],
    seasonLinks: [
      { brFsId: 1623, fieldSeasonId: 415, fieldId: 18 },
      { brFsId: 1368, fieldSeasonId: 349, fieldId: 245 },
      { brFsId: 1370, fieldSeasonId: 351, fieldId: 249 },
      { brFsId: 1356, fieldSeasonId: 339, fieldId: 522 },
      { brFsId: 1891, fieldSeasonId: 476, fieldId: 77 },
    ],
  };
  const catalog = [
    { id: 18, cropxFieldUuid: KNOWN_UUID },
    { id: 245, cropxFieldUuid: DUP_UUID },
    { id: 249, cropxFieldUuid: DUP_UUID },
    { id: 522, cropxFieldUuid: '3971ae01-ebef-4242-8f64-fafd10e80f84' },
    { id: 77, cropxFieldUuid: '119a4048-69cf-4114-a92d-6cfb99440a02' },
  ];
  const report = engine.reviewHandoff(bundle, catalog, []);
  const byField = Object.fromEntries(report.rows.map(row => [row.acreFieldId, row]));
  assert.equal(byField[18].disposition, 'eligible');
  assert.equal(byField[18].resolvedFieldId, 18);
  assert.equal(byField[18].legacyBrFieldSeasonId, 1623);
  assert.equal(byField[18].sourceFieldSeasonId, 415);
  assert.notEqual(byField[18].resolvedFieldId, 1623);
  assert.notEqual(byField[18].resolvedFieldId, 415);
  assert.equal(byField[245].disposition, 'ambiguous');
  assert.equal(byField[249].disposition, 'ambiguous');
  assert.equal(byField[245].resolvedFieldId, null);
  assert.equal(byField[522].disposition, 'identity_disagreement');
  assert.match(byField[522].detail, /HTTP 400/);
  assert.equal(byField[77].disposition, 'identity_disagreement');
  assert.match(byField[77].detail, /does not join/);
  assert.equal(report.supplemental[0].acreFieldId, 539);
  assert.equal(report.supplemental[0].disposition, 'held_unresolved');
  const counts = engine.countDispositions([...report.rows, ...report.supplemental]);
  assert.equal(counts.eligible, 1);
  assert.equal(counts.ambiguous, 2);
  const gap = engine.reviewHandoff({
    ...bundle,
    indexRows: [{ field_id: 30, field_season_id: 8, br_fs_id: 700, cropx_field_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sb_cropx_uuid: null }],
    rawByUuid: { 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': raw() },
    holds: [], duplicateUuids: [], seasonLinks: undefined,
  }, [{ id: 30, cropxFieldUuid: null }], []);
  assert.equal(gap.rows[0].disposition, 'eligible');
  assert.equal(gap.rows[0].resolvedFieldId, 30);
  assert.match(gap.rows[0].detail, /empty and was not changed/);
  const again = engine.reviewHandoff(bundle, catalog, [{ fieldId: 18, cropxFieldUuid: KNOWN_UUID, geometrySha256: engine.geometrySha256(polygon), edited: false }]);
  assert.equal(again.rows.find(row => row.acreFieldId === 18).disposition, 'unchanged');
  assert.throws(() => engine.reviewHandoff({ ...bundle, crsDeclaredBy: ' ' }, catalog), /CRS declaration/);
});

test.before(async () => {
  await f.initialize();
  const a = f.load('lib/supabase/adapter.ts');
  await f.db.exec("INSERT INTO user_role_options(value) VALUES ('admin'),('installer');");
  admin = await a.createRow('users', { email: 'boundary-admin@example.invalid', name: 'QA Admin', password_hash: 'fixture-hash', active: true, role: 'admin' });
  crew = await a.createRow('users', { email: 'boundary-crew@example.invalid', name: 'QA Crew', password_hash: 'fixture-hash', active: true, role: 'installer' });
  field = await a.createRow('fields', { name: 'QA Boundary', acres: 12.5, lat: 40.41, lng: -99.48 });
  other = await a.createRow('fields', { name: 'QA Other' });
  const big = await a.createRow('fields', { name: 'QA Big' });
  const little = await a.createRow('fields', { name: 'QA Little' });
  await f.db.query('UPDATE public.fields SET cropx_field_uuid = $1 WHERE id = $2', [KNOWN_UUID, field.id]);
  await f.db.query('UPDATE public.fields SET cropx_field_uuid = $1 WHERE id = $2', [DUP_UUID, big.id]);
  await f.db.query('UPDATE public.fields SET cropx_field_uuid = $1 WHERE id = $2', [DUP_UUID, little.id]);
  f.session = { user: { id: String(admin.id) } };
});
test.after(async () => { await f.db?.close(); });

function post(pathname, body) {
  const { NextRequest } = require('next/server');
  return new NextRequest('http://localhost' + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function allow() { process.env.BOUNDARY_IMPORT_APPLY = engine.BOUNDARY_IMPORT_APPLY_VALUE; }
function block() { delete process.env.BOUNDARY_IMPORT_APPLY; }
function bodyFor(uuid, geometry, acreFieldId) {
  const item = { cropxFieldUuid: uuid, content: content(geometry, { center: [geometry.coordinates[0][0][0] + 0.01, geometry.coordinates[0][0][1] + 0.01] }) };
  if (acreFieldId != null) item.acreFieldId = acreFieldId;
  return { dataset: dataset([item]) };
}

test('migration locks the tables down and rejects an invalid shape', async () => {
  for (const table of ['field_boundaries', 'field_boundary_imports', 'field_boundary_import_rows']) {
    assert.equal((await f.db.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public.${table}'::regclass`)).rows[0].relrowsecurity, true);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const row = (await f.db.query(`SELECT has_table_privilege($1,'public.${table}','SELECT') AS read, has_table_privilege($1,'public.${table}','INSERT') AS insert, has_table_privilege($1,'public.${table}','UPDATE') AS update, has_table_privilege($1,'public.${table}','DELETE') AS delete`, [role])).rows[0];
      assert.deepEqual(row, { read: role === 'service_role', insert: false, update: false, delete: false });
    }
  }
  const valid = square();
  await f.db.query(`INSERT INTO public.field_boundaries (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source) VALUES ($1,$2,$3::jsonb,$4,'EPSG:4326','lonlat','cropx')`, [other.id, 'ffffffff-ffff-4fff-8fff-ffffffffffff', JSON.stringify(valid), engine.geometrySha256(valid)]);
  await assert.rejects(f.db.query(`INSERT INTO public.field_boundaries (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source) VALUES ($1,'11111111-1111-4111-8111-111111111111',$2::jsonb,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','EPSG:4326','lonlat','cropx')`, [field.id, JSON.stringify({ type: 'Point', coordinates: [1, 2] })]));
  await f.db.query('DELETE FROM public.field_boundaries WHERE field_id = $1', [other.id]);
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261105233000_field_boundaries.sql'), 'utf8');
  assert.match(migration, /REVOKE ALL ON public\.field_boundaries FROM PUBLIC, anon, authenticated, service_role;/);
  assert.equal(/ALTER TABLE public\.fields\b/.test(migration), false);
  assert.equal(/INSERT INTO public\.field_seasons|FROM public\.field_seasons/.test(migration), false);
  for (const file of ['lib/field-boundaries/engine.ts', 'lib/field-boundaries/store.ts', 'app/api/field-boundaries/route.ts', 'app/api/field-boundaries/import/route.ts']) {
    assert.equal(/field_seasons/.test(fs.readFileSync(path.join(root, file), 'utf8')), false);
  }
});

test('authenticated import is idempotent and will not overwrite an edit or an ambiguous match', async () => {
  const { NextRequest } = require('next/server');
  const read = f.load('app/api/field-boundaries/route.ts');
  const importer = f.load('app/api/field-boundaries/import/route.ts');
  const api = f.load('lib/supabase/api.ts');
  block();
  f.session = null;
  assert.equal((await read.GET(new NextRequest(`http://localhost/api/field-boundaries?fields=${field.id}`))).status, 401);
  assert.throws(() => api.authorizeActor({ kind: 'customer', token: 'x' }, '/api/field-boundaries', 'GET'), /authorized/);
  assert.throws(() => api.authorizeActor({ kind: 'crew', role: 'installer' }, '/api/field-boundaries/import', 'GET'), /Administrator/);
  f.session = { user: { id: String(crew.id) } };
  assert.equal((await importer.POST(post('/api/field-boundaries/import', { action: 'stage', ...bodyFor(KNOWN_UUID, square()) }))).status, 403);
  assert.equal((await read.PATCH(post('/api/field-boundaries', { fieldId: field.id, geometry: square() }))).status, 403);
  f.session = { user: { id: String(admin.id) } };
  const sql = [];
  f.failSql = query => { sql.push(query); return false; };
  const dry = await importer.POST(post('/api/field-boundaries/import', bodyFor(KNOWN_UUID, square(-99.123456))));
  f.failSql = null;
  assert.equal(dry.status, 200);
  const dryBody = await dry.json();
  assert.equal(dryBody.writes, 0);
  assert.equal(dryBody.summary.eligible, 1);
  assert.equal(JSON.stringify(dryBody).includes('-99.123456'), false);
  assert.equal(sql.filter(query => !/^\s*SELECT\b/i.test(query)).length, 0);
  assert.equal((await importer.POST(post('/api/field-boundaries/import', { action: 'stage', ...bodyFor(KNOWN_UUID, square()) }))).status, 403);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM public.field_boundary_imports')).rows[0].n, 0);

  allow();
  const noisy = bodyFor(KNOWN_UUID, square());
  noisy.dataset.noise = true;
  const staged = await importer.POST(post('/api/field-boundaries/import', { action: 'stage', ...noisy }));
  assert.equal(staged.status, 400);
  const good = await importer.POST(post('/api/field-boundaries/import', { action: 'stage', ...bodyFor(KNOWN_UUID, holey) }));
  assert.equal(good.status, 201);
  const stagedBody = await good.json();
  assert.equal(stagedBody.summary.eligible, 1);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM public.field_boundaries')).rows[0].n, 0);
  const applied = await importer.POST(post('/api/field-boundaries/import', { action: 'apply', importId: stagedBody.importId }));
  assert.equal(applied.status, 200);
  assert.deepEqual((await applied.json()).results, { inserted: 1, replaced: 0, skipped_unchanged: 0, blocked: 0 });
  const before = (await f.db.query('SELECT lat, lng, acres, cropx_field_uuid FROM public.fields WHERE id = $1', [field.id])).rows[0];
  await f.db.query(`UPDATE public.field_boundaries SET updated_at = '2020-01-01T00:00:00Z' WHERE field_id = $1`, [field.id]);
  const again = await importer.POST(post('/api/field-boundaries/import', { action: 'stage', ...bodyFor(KNOWN_UUID, holey) }));
  const againBody = await again.json();
  assert.equal(againBody.summary.unchanged, 1);
  await importer.POST(post('/api/field-boundaries/import', { action: 'apply', importId: againBody.importId }));
  const stamp = (await f.db.query('SELECT updated_at, geometry_sha256 FROM public.field_boundaries WHERE field_id = $1', [field.id])).rows[0];
  assert.equal(new Date(stamp.updated_at).toISOString().slice(0, 4), '2020');
  assert.equal(stamp.geometry_sha256, engine.geometrySha256(holey));
  const after = (await f.db.query('SELECT lat, lng, acres, cropx_field_uuid FROM public.fields WHERE id = $1', [field.id])).rows[0];
  assert.deepEqual(after, before);

  const changed = await importer.POST(post('/api/field-boundaries/import', { action: 'stage', ...bodyFor(KNOWN_UUID, square(-99.46)) }));
  const changedBody = await changed.json();
  assert.equal(changedBody.summary.conflict_changed, 1);
  await importer.POST(post('/api/field-boundaries/import', { action: 'apply', importId: changedBody.importId }));
  assert.equal((await f.db.query('SELECT geometry_sha256 FROM public.field_boundaries WHERE field_id = $1', [field.id])).rows[0].geometry_sha256, engine.geometrySha256(holey));
  const review = await importer.GET(new NextRequest(`http://localhost/api/field-boundaries/import?id=${changedBody.importId}`));
  const reviewBody = await review.json();
  assert.equal(JSON.stringify(reviewBody).includes('coordinates'), false);
  const rowId = reviewBody.review[0].rowId;
  assert.equal((await importer.POST(post('/api/field-boundaries/import', { action: 'resolve', rowId }))).status, 200);
  const replaced = await importer.POST(post('/api/field-boundaries/import', { action: 'apply', importId: changedBody.importId }));
  assert.equal((await replaced.json()).results.replaced, 1);
  assert.equal((await f.db.query('SELECT geometry_sha256, edited_at FROM public.field_boundaries WHERE field_id = $1', [field.id])).rows[0].edited_at, null);

  const editedGeometry = square(-99.42);
  assert.equal((await read.PATCH(post('/api/field-boundaries', { fieldId: field.id, geometry: editedGeometry }))).status, 200);
  const third = await importer.POST(post('/api/field-boundaries/import', { action: 'stage', ...bodyFor(KNOWN_UUID, square(-99.3)) }));
  const thirdBody = await third.json();
  assert.equal(thirdBody.summary.conflict_edited, 1);
  assert.equal((await importer.POST(post('/api/field-boundaries/import', { action: 'resolve', rowId: thirdBody.review ? null : 0 }))).status, 400);
  const blockedResolve = await importer.GET(new NextRequest(`http://localhost/api/field-boundaries/import?id=${thirdBody.importId}`));
  const blockedRow = (await blockedResolve.json()).review[0].rowId;
  assert.equal((await importer.POST(post('/api/field-boundaries/import', { action: 'resolve', rowId: blockedRow }))).status, 400);
  await importer.POST(post('/api/field-boundaries/import', { action: 'apply', importId: thirdBody.importId }));
  assert.equal((await f.db.query('SELECT geometry_sha256, source FROM public.field_boundaries WHERE field_id = $1', [field.id])).rows[0].geometry_sha256, engine.geometrySha256(editedGeometry));

  const ambiguous = await importer.POST(post('/api/field-boundaries/import', { action: 'stage', ...bodyFor(DUP_UUID, square(-98.7), null) }));
  const ambiguousBody = await ambiguous.json();
  assert.equal(ambiguousBody.summary.ambiguous, 1);
  const ambiguousApply = await importer.POST(post('/api/field-boundaries/import', { action: 'apply', importId: ambiguousBody.importId }));
  assert.equal((await ambiguousApply.json()).results.blocked, 1);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM public.field_boundaries WHERE cropx_field_uuid = $1', [DUP_UUID])).rows[0].n, 0);

  const store = f.load('lib/field-boundaries/store.ts');
  const database = f.load('lib/supabase/database.ts');
  const gapUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const gapGeometry = square(-98.2);
  const reviewed = engine.reviewHandoff({
    crs: 'EPSG:4326', axisOrder: 'lonlat', crsDeclaredBy: 'test',
    indexRows: [{ field_id: other.id, field_season_id: 8, br_fs_id: 700, cropx_field_uuid: gapUuid, sb_cropx_uuid: null }],
    rawByUuid: { [gapUuid]: { fetched_at: '2026-11-05T17:34:15.528563-06:00', http_status: 200, geoJsonBoundary: gapGeometry } },
    holds: [], duplicateUuids: [],
  }, [{ id: other.id, cropxFieldUuid: null }], []);
  assert.equal(reviewed.rows[0].disposition, 'eligible');
  const gapSql = { query: database.query, transaction: database.transaction };
  const stagedGap = await store.stageReviewedRows(gapSql, reviewed.rows, 'ab'.repeat(32), '2026-11-05T23:34:15.528Z');
  assert.equal((await store.applyBoundaryImport(gapSql, stagedGap.importId)).results.inserted, 1);
  assert.equal((await f.db.query('SELECT cropx_field_uuid FROM public.fields WHERE id = $1', [other.id])).rows[0].cropx_field_uuid, null);
  assert.equal((await f.db.query('SELECT cropx_field_uuid FROM public.field_boundaries WHERE field_id = $1', [other.id])).rows[0].cropx_field_uuid, gapUuid);

  f.session = { user: { id: String(crew.id) } };
  const visible = await read.GET(new NextRequest(`http://localhost/api/field-boundaries?fields=${field.id}`));
  assert.equal(visible.status, 200);
  const features = await visible.json();
  assert.equal(features.features.length, 1);
  assert.equal(features.features[0].properties.fieldId, field.id);
  assert.equal(features.features[0].properties.edited, true);
  assert.equal(features.features[0].geometry.type, 'Polygon');
  block();
});

test('file candidates keep shapefile lineage and do not invent a CropX uuid', () => {
  const sha = 'ab'.repeat(32);
  const geometry = square(-99.123456);
  const parsed = engine.parseFileCandidates([{
    field_id: 462,
    source_file: 'Rapp-Kelly.shp',
    zip: 'example.zip',
    zip_sha256: sha.toUpperCase(),
    FieldName: "Mother's",
    attrs: { FarmName: 'Kelly Rapp', Area: 1 },
    acres: 10,
    valid: true,
    geometry,
  }, {
    field_id: 116,
    source_file: 'Schneider-Dwight.shp',
    zip_sha256: sha,
    FieldName: "Cherie's West",
    geometry,
  }], '2026-11-09T18:00:00.000Z');
  assert.equal(parsed.source, 'file');
  assert.equal(parsed.items[0].sourceFileSha256, sha);
  assert.equal(parsed.items[0].sourceFarmName, 'Kelly Rapp');
  const held = engine.parseFileCandidates([{
    field_id: 116, source_file: 'Schneider-Dwight.shp', zip_sha256: sha, FieldName: "Cherie's West", valid: false, geometry,
  }], '2026-11-09T18:00:00.000Z');
  assert.equal(held.items[0].geometry, null);
  const catalog = [{ id: 462, cropxFieldUuid: null }, { id: 18, cropxFieldUuid: KNOWN_UUID }];
  const rows = engine.classifyFileBoundaries(parsed, catalog, []);
  assert.equal(rows[0].disposition, 'eligible');
  assert.equal(rows[0].resolvedFieldId, 462);
  assert.equal(rows[0].cropxFieldUuid, null);
  assert.equal(rows[1].disposition, 'unmatched');
  assert.equal(engine.classifyFileBoundaries(held, catalog, [])[0].disposition, 'invalid_geometry');
  assert.equal(engine.classifyFileBoundaries(held, catalog, [])[0].geometry, null);
  const again = engine.classifyFileBoundaries(parsed, catalog, [{
    fieldId: 462, cropxFieldUuid: null, geometrySha256: engine.geometrySha256(geometry), edited: false,
    sourceFileName: 'Rapp-Kelly.shp', sourceFileSha256: sha, sourceFeatureName: "Mother's",
  }]);
  assert.equal(again[0].disposition, 'unchanged');
  const overCropx = engine.classifyFileBoundaries(engine.parseFileCandidates([{
    field_id: 18, source_file: 'Rapp-Kelly.shp', zip_sha256: sha, FieldName: 'T & L Pivot', geometry: square(-99.05),
  }], '2026-11-09T18:00:00.000Z'), catalog, [{ fieldId: 18, cropxFieldUuid: KNOWN_UUID, geometrySha256: engine.geometrySha256(square()), edited: false }]);
  assert.equal(overCropx[0].disposition, 'conflict_changed');
  assert.equal(JSON.stringify(engine.reviewOf(rows)).includes('-99.123456'), false);
  assert.throws(() => engine.parseFileCandidates([
    { field_id: 462, source_file: 'Rapp-Kelly.shp', zip_sha256: sha, FieldName: 'A', geometry },
    { field_id: 462, source_file: 'Rapp-Kelly.shp', zip_sha256: sha, FieldName: 'B', geometry },
  ], '2026-11-09T18:00:00.000Z'), /repeat/);
  assert.throws(() => engine.parseFileCandidates([
    { field_id: 462, source_file: 'Rapp-Kelly.shp', zip_sha256: 'nope', FieldName: 'A', geometry },
  ], '2026-11-09T18:00:00.000Z'), /sha256/);
});

test('file candidate dry-run writes nothing and does not echo coordinates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acre-file-boundaries-'));
  const candidates = path.join(dir, 'candidates.json');
  fs.writeFileSync(candidates, JSON.stringify([{
    field_id: 462, source_file: 'Rapp-Kelly.shp', zip: 'example.zip', zip_sha256: 'ab'.repeat(32),
    FieldName: 'T & L Pivot', acres: 10, valid: true, geometry: square(-99.123456),
  }]));
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/import-file-boundaries.cjs'), '--candidates', candidates], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'postgresql://postgres:super-secret-password@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres', BOUNDARY_IMPORT_APPLY: engine.BOUNDARY_IMPORT_APPLY_VALUE },
    timeout: 15000,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.includes('super-secret-password'), false);
  assert.equal(run.stdout.includes('-99.123456'), false);
  const report = JSON.parse(run.stdout);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.writes, 0);
  assert.equal(report.catalogChecked, false);
  assert.equal(report.validGeometry, 1);
  assert.deepEqual(report.fieldIds, [462]);
  const refused = spawnSync(process.execPath, [path.join(root, 'scripts/import-file-boundaries.cjs'), '--apply', '--candidates', candidates], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: 'postgresql://postgres:super-secret-password@db.junawlttpyztjlnbmvcb.supabase.co:5432/postgres' },
    timeout: 15000,
  });
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /disabled/);
  assert.equal(refused.stdout.includes('super-secret-password'), false);
  assert.equal(refused.stderr.includes('super-secret-password'), false);
});

test('file-source migration keeps an existing cropx boundary valid', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  const dir = path.join(root, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
  const added = '20261109184500_field_boundary_file_source.sql';
  for (const name of files) {
    if (name === added) continue;
    await db.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
  }
  const migration = fs.readFileSync(path.join(dir, added), 'utf8');
  assert.equal(/\bUPDATE\b|\bDELETE\b/i.test(migration), false);
  const geometry = square(-99.2);
  const hash = engine.geometrySha256(geometry);
  const field = (await db.query(`INSERT INTO public.fields (name) VALUES ('Kept') RETURNING id`)).rows[0];
  await db.query(
    `INSERT INTO public.field_boundaries (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source, updated_at)
     VALUES ($1,$2,$3::jsonb,$4,'EPSG:4326','lonlat','cropx','2020-01-01T00:00:00Z')`,
    [field.id, KNOWN_UUID, JSON.stringify(geometry), hash]);
  const job = (await db.query(
    `INSERT INTO public.field_boundary_imports (source, mode, crs, axis_order, observed_at, dataset_sha256, summary)
     VALUES ('cropx','stage','EPSG:4326','lonlat','2026-11-05T23:00:00Z',$1,'{}'::jsonb) RETURNING id`,
    ['cd'.repeat(32)])).rows[0];
  await db.query(
    `INSERT INTO public.field_boundary_import_rows (import_id, cropx_field_uuid, disposition, detail) VALUES ($1,$2,'unmatched','kept')`,
    [job.id, KNOWN_UUID]);
  const before = (await db.query('SELECT field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source, source_observed_at, import_row_id, edited_at, updated_at FROM public.field_boundaries')).rows;
  await db.exec(migration);
  const after = (await db.query('SELECT field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source, source_observed_at, import_row_id, edited_at, updated_at FROM public.field_boundaries')).rows;
  assert.deepEqual(after, before);
  const lineage = (await db.query('SELECT source_file_name, source_file_sha256, source_feature_name FROM public.field_boundaries')).rows[0];
  assert.deepEqual(lineage, { source_file_name: null, source_file_sha256: null, source_feature_name: null });
  const staged = (await db.query('SELECT cropx_field_uuid, source, source_file_name, detail FROM public.field_boundary_import_rows')).rows[0];
  assert.equal(staged.cropx_field_uuid, KNOWN_UUID);
  assert.equal(staged.source, 'cropx');
  assert.equal(staged.source_file_name, null);
  assert.equal(staged.detail, 'kept');
  const index = (await db.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'field_boundaries_cropx_field_uuid_key'`)).rows[0].indexdef;
  assert.match(index, /UNIQUE/);
  assert.match(index, /cropx_field_uuid IS NOT NULL/);
  await db.close();
});

test('a file boundary is keyed by fields.id and re-applying the same file changes nothing', async () => {
  const { NextRequest } = require('next/server');
  allow();
  const a = f.load('lib/supabase/adapter.ts');
  const store = f.load('lib/field-boundaries/store.ts');
  const database = f.load('lib/supabase/database.ts');
  const read = f.load('app/api/field-boundaries/route.ts');
  const fileField = await a.createRow('fields', { name: 'QA File Boundary', acres: 10, lat: 40.5, lng: -99.2 });
  const second = await a.createRow('fields', { name: 'QA File Two' });
  const sha = 'ab'.repeat(32);
  const observed = '2026-11-09T18:00:00.000Z';
  const geometry = square(-99.2);
  const sql = { query: database.query, transaction: database.transaction };
  const parsed = engine.parseFileCandidates([{
    field_id: fileField.id,
    source_file: 'Rapp-Kelly.shp',
    zip: 'example.zip',
    zip_sha256: sha.toUpperCase(),
    FieldName: "Mother's",
    attrs: { FieldName: "Mother's", FarmName: 'Kelly Rapp', GrowerName: 'Rapp; Kelly', Area: 12 },
    acres: 157.5,
    valid: true,
    geometry,
  }], observed);
  const catalog = await store.loadCatalog(sql);
  const first = engine.classifyFileBoundaries(parsed, catalog, await store.loadCommitted(sql));
  assert.equal(first[0].disposition, 'eligible');
  assert.equal(first[0].resolvedFieldId, fileField.id);
  assert.equal(first[0].cropxFieldUuid, null);
  const staged = await store.stageReviewedRows(sql, first, sha, observed, 'file');
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM public.field_boundaries WHERE field_id = $1', [fileField.id])).rows[0].n, 0);
  const stagedRow = (await f.db.query('SELECT source, cropx_field_uuid, source_file_name, source_file_sha256, source_feature_name, source_farm_name FROM public.field_boundary_import_rows WHERE import_id = $1', [staged.importId])).rows[0];
  assert.equal(stagedRow.source, 'file');
  assert.equal(stagedRow.cropx_field_uuid, null);
  assert.equal(stagedRow.source_file_name, 'Rapp-Kelly.shp');
  assert.equal(stagedRow.source_file_sha256, sha);
  assert.equal(stagedRow.source_feature_name, "Mother's");
  assert.equal(stagedRow.source_farm_name, 'Kelly Rapp');
  assert.deepEqual((await store.applyBoundaryImport(sql, staged.importId)).results, { inserted: 1, replaced: 0, skipped_unchanged: 0, blocked: 0 });
  const stored = (await f.db.query('SELECT cropx_field_uuid, source, source_file_name, source_file_sha256, source_feature_name, geometry_sha256 FROM public.field_boundaries WHERE field_id = $1', [fileField.id])).rows[0];
  assert.equal(stored.cropx_field_uuid, null);
  assert.equal(stored.source, 'file');
  assert.equal(stored.source_file_name, 'Rapp-Kelly.shp');
  assert.equal(stored.source_file_sha256, sha);
  assert.equal(stored.source_feature_name, "Mother's");
  assert.equal(stored.geometry_sha256, engine.geometrySha256(geometry));
  assert.equal((await f.db.query('SELECT cropx_field_uuid FROM public.fields WHERE id = $1', [fileField.id])).rows[0].cropx_field_uuid, null);

  await f.db.query(`UPDATE public.field_boundaries SET updated_at = '2020-01-01T00:00:00Z' WHERE field_id = $1`, [fileField.id]);
  const againRows = engine.classifyFileBoundaries(parsed, catalog, await store.loadCommitted(sql));
  assert.equal(againRows[0].disposition, 'unchanged');
  const again = await store.stageReviewedRows(sql, againRows, sha, observed, 'file');
  const againApply = await store.applyBoundaryImport(sql, again.importId);
  assert.equal(againApply.results.inserted, 0);
  assert.equal(againApply.results.skipped_unchanged, 1);
  const stamp = (await f.db.query('SELECT updated_at FROM public.field_boundaries WHERE field_id = $1', [fileField.id])).rows[0];
  assert.equal(new Date(stamp.updated_at).toISOString().slice(0, 4), '2020');
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM public.field_boundaries WHERE field_id = $1', [fileField.id])).rows[0].n, 1);

  f.session = { user: { id: String(crew.id) } };
  const visible = await read.GET(new NextRequest(`http://localhost/api/field-boundaries?fields=${fileField.id}`));
  assert.equal(visible.status, 200);
  const features = await visible.json();
  assert.equal(features.type, 'FeatureCollection');
  assert.equal(features.features.length, 1);
  assert.equal(features.features[0].id, fileField.id);
  assert.equal(features.features[0].properties.fieldId, fileField.id);
  assert.equal(features.features[0].properties.cropxFieldUuid, null);
  assert.equal(features.features[0].properties.source, 'file');
  assert.equal(features.features[0].geometry.type, 'Polygon');
  const cropxVisible = await read.GET(new NextRequest(`http://localhost/api/field-boundaries?fields=${field.id}`));
  assert.equal((await cropxVisible.json()).features[0].properties.cropxFieldUuid, KNOWN_UUID);

  const otherSha = 'cd'.repeat(32);
  const secondClass = engine.classifyFileBoundaries(engine.parseFileCandidates([{
    field_id: second.id, source_file: 'Schneider-Dwight.shp', zip_sha256: otherSha, FieldName: "Cherie's West", geometry: square(-98.4), valid: true,
  }], observed), await store.loadCatalog(sql), await store.loadCommitted(sql));
  assert.equal(secondClass[0].disposition, 'eligible');
  const secondStaged = await store.stageReviewedRows(sql, secondClass, otherSha, observed, 'file');
  assert.equal((await store.applyBoundaryImport(sql, secondStaged.importId)).results.inserted, 1);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM public.field_boundaries WHERE cropx_field_uuid IS NULL')).rows[0].n, 2);

  const third = await a.createRow('fields', { name: 'QA File Three' });
  await assert.rejects(f.db.query(
    `INSERT INTO public.field_boundaries (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source)
     VALUES ($1, NULL, $2::jsonb, $3, 'EPSG:4326', 'lonlat', 'cropx')`,
    [third.id, JSON.stringify(geometry), engine.geometrySha256(geometry)]));
  await assert.rejects(f.db.query(
    `INSERT INTO public.field_boundaries (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source, source_file_name, source_file_sha256, source_feature_name)
     VALUES ($1, $2, $3::jsonb, $4, 'EPSG:4326', 'lonlat', 'file', 'Rapp-Kelly.shp', $5, 'Name')`,
    [third.id, '11111111-1111-4111-8111-111111111111', JSON.stringify(geometry), engine.geometrySha256(geometry), sha]));
  await assert.rejects(f.db.query(
    `INSERT INTO public.field_boundaries (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source)
     VALUES ($1, $2, $3::jsonb, $4, 'EPSG:4326', 'lonlat', 'cropx')`,
    [third.id, KNOWN_UUID, JSON.stringify(geometry), engine.geometrySha256(geometry)]));
  await assert.rejects(f.db.query(
    `INSERT INTO public.field_boundary_import_rows (import_id, source, cropx_field_uuid, disposition, detail)
     VALUES ($1, 'file', NULL, 'unmatched', 'missing lineage')`,
    [secondStaged.importId]));

  f.session = { user: { id: String(admin.id) } };
  const editedGeometry = square(-99.11);
  assert.equal((await read.PATCH(post('/api/field-boundaries', { fieldId: fileField.id, geometry: editedGeometry }))).status, 200);
  const editedRow = (await f.db.query('SELECT source, cropx_field_uuid, source_file_name, source_feature_name, edited_at FROM public.field_boundaries WHERE field_id = $1', [fileField.id])).rows[0];
  assert.equal(editedRow.source, 'edited');
  assert.equal(editedRow.cropx_field_uuid, null);
  assert.equal(editedRow.source_file_name, 'Rapp-Kelly.shp');
  assert.equal(editedRow.source_feature_name, "Mother's");
  assert.ok(editedRow.edited_at);
  const conflict = engine.classifyFileBoundaries(parsed, catalog, await store.loadCommitted(sql));
  assert.equal(conflict[0].disposition, 'conflict_edited');
  const conflictStaged = await store.stageReviewedRows(sql, conflict, sha, observed, 'file');
  assert.equal((await store.applyBoundaryImport(sql, conflictStaged.importId)).results.blocked, 1);
  assert.equal((await f.db.query('SELECT geometry_sha256 FROM public.field_boundaries WHERE field_id = $1', [fileField.id])).rows[0].geometry_sha256, engine.geometrySha256(editedGeometry));

  const cropxBefore = (await f.db.query('SELECT cropx_field_uuid, source, geometry_sha256, updated_at FROM public.field_boundaries WHERE field_id = $1', [other.id])).rows[0];
  const overRows = engine.classifyFileBoundaries(engine.parseFileCandidates([{
    field_id: other.id, source_file: 'Rapp-Kelly.shp', zip_sha256: sha, FieldName: 'T & L Pivot', geometry: square(-99.05), valid: true,
  }], observed), catalog, await store.loadCommitted(sql));
  assert.equal(overRows[0].disposition, 'conflict_changed');
  const overStaged = await store.stageReviewedRows(sql, overRows, sha, observed, 'file');
  assert.equal((await store.applyBoundaryImport(sql, overStaged.importId)).results.blocked, 1);
  const cropxAfter = (await f.db.query('SELECT cropx_field_uuid, source, geometry_sha256, updated_at FROM public.field_boundaries WHERE field_id = $1', [other.id])).rows[0];
  assert.deepEqual(cropxAfter, cropxBefore);
  block();
});
