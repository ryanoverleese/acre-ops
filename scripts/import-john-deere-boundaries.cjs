#!/usr/bin/env node
// Stage John Deere Operations Center boundaries that are already WGS84 lon/lat.
// Default is a dry-run: no database and no writes.
// The candidates file is a JSON array used as-is. Each object needs
// org_id, jd_field_id, jd_boundary_id, fetched_at, FieldName (or jd_field_name),
// geometry, and either field_id or create_field (name + billing_entity).
// Extra keys (org_name, jd_boundary_name, proposed_name, acres, flags, valid)
// are accepted. valid:false is held back. There is no coordinate transform.
//
// Dry-run:
//   node scripts/import-john-deere-boundaries.cjs --candidates review_19_candidates.json
//
// After migration 20261119163100_field_boundary_john_deere_source.sql is applied:
//   BOUNDARY_IMPORT_APPLY=I_AUTHORIZE_ACRE_OPS_BOUNDARY_IMPORT \
//     node scripts/import-john-deere-boundaries.cjs --apply --create-fields --candidates review_19_candidates.json
//
// --create-fields is required with --apply when a candidate has create_field and
// no field_id. New fields are created through createFieldRecord, the same path
// as POST /api/fields, then the boundary is staged and applied.
// --stage stops after the import record and will not create fields.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};
require(path.join(root, 'scripts/prefer-ts-over-json.cjs'))();
const engine = require(path.join(root, 'lib/field-boundaries/engine.ts'));

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function loadWriter() {
  const Module = require('node:module');
  const original = Module._load;
  Module._load = function(specifier, parent, main) {
    if (specifier === 'server-only') return {};
    if (specifier === 'next/cache') return { unstable_cache: fn => fn, revalidateTag() {}, revalidatePath() {} };
    return original.call(this, specifier, parent, main);
  };
  const database = require(path.join(root, 'lib/supabase/database.ts'));
  const store = require(path.join(root, 'lib/field-boundaries/store.ts'));
  const createField = require(path.join(root, 'lib/fields/create-field.ts'));
  return {
    store,
    createFieldRecord: createField.createFieldRecord,
    sql: { query: database.query, transaction: database.transaction },
  };
}

function reviewItems(items) {
  return items.map(item => ({
    fieldId: item.fieldId,
    createFieldName: item.createField ? item.createField.name : null,
    createFieldBillingEntity: item.createField ? item.createField.billingEntity : null,
    sourceJdOrgId: item.sourceJdOrgId,
    sourceJdFieldId: item.sourceJdFieldId,
    sourceJdBoundaryId: item.sourceJdBoundaryId,
    sourceJdFetchedAt: item.sourceJdFetchedAt,
    sourceFieldName: item.sourceFieldName,
    geometryOk: Boolean(item.geometry),
    detail: item.geometryDetail,
  }));
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write('node scripts/import-john-deere-boundaries.cjs --candidates file.json [--catalog catalog.json]\nBOUNDARY_IMPORT_APPLY=I_AUTHORIZE_ACRE_OPS_BOUNDARY_IMPORT node scripts/import-john-deere-boundaries.cjs --apply --create-fields --candidates file.json\n');
    return;
  }
  const writing = process.argv.includes('--stage') || process.argv.includes('--apply');
  const createFields = process.argv.includes('--create-fields');
  if (writing && !engine.importWritesEnabled()) throw new engine.BoundaryImportDisabled();
  const file = arg('--candidates');
  if (!file || file.startsWith('-')) throw new engine.BoundaryDatasetError('A candidates file is required');
  const bytes = fs.readFileSync(path.resolve(file));
  const input = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(input)) throw new engine.BoundaryDatasetError('John Deere candidates must be a JSON array');
  const observedAt = arg('--observed-at') || new Date().toISOString();
  const parsed = engine.parseJdCandidates(input, observedAt);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const needsCreate = parsed.items.some(item => item.createField && item.fieldId == null);
  if (!writing) {
    const catalogFile = arg('--catalog');
    if (!catalogFile) {
      const invalid = parsed.items.filter(item => !item.geometry);
      process.stdout.write(JSON.stringify({
        mode: 'dry-run',
        writes: 0,
        candidates: parsed.items.length,
        validGeometry: parsed.items.length - invalid.length,
        invalidGeometry: invalid.length,
        catalogChecked: false,
        fieldsToCreate: parsed.items.filter(item => item.createField).length,
        fieldIds: parsed.items.map(item => item.fieldId).filter(Boolean),
        review: reviewItems(parsed.items),
      }) + '\n');
      return;
    }
    const rows = engine.classifyJdBoundaries(parsed, engine.parseCatalog(JSON.parse(fs.readFileSync(path.resolve(catalogFile), 'utf8'))), []);
    const review = engine.reviewOf(rows);
    process.stdout.write(JSON.stringify({
      mode: 'dry-run',
      writes: 0,
      catalogChecked: true,
      fieldsToCreate: rows.filter(row => row.createFieldName && row.disposition === 'eligible').length,
      summary: engine.countDispositions(rows),
      review: review.slice(0, 50),
      reviewTruncated: review.length > 50,
    }) + '\n');
    return;
  }
  if (needsCreate && (!process.argv.includes('--apply') || !createFields)) {
    throw new engine.BoundaryDatasetError('Pass --apply --create-fields to create a new fields row through the app field-create path before staging a John Deere boundary');
  }
  const { store, sql, createFieldRecord } = loadWriter();
  const ready = await sql.query(
    `SELECT 1 AS ok FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'field_boundaries' AND column_name = 'source_jd_field_id'`);
  if (!ready.length) throw new engine.BoundaryDatasetError('Apply migration 20261119163100_field_boundary_john_deere_source.sql before staging John Deere boundaries');
  const created = [];
  let working = input;
  if (needsCreate) {
    working = [];
    for (const raw of input) {
      if (!raw || typeof raw !== 'object' || raw.field_id || !raw.create_field) {
        working.push(raw);
        continue;
      }
      const result = await createFieldRecord({
        name: raw.create_field.name,
        billing_entity: raw.create_field.billing_entity,
        ...(raw.create_field.acres != null ? { acres: raw.create_field.acres } : {}),
        ...(raw.create_field.lat != null ? { lat: raw.create_field.lat } : {}),
        ...(raw.create_field.lng != null ? { lng: raw.create_field.lng } : {}),
        ...(raw.create_field.season != null ? { season: raw.create_field.season } : {}),
        ...(raw.create_field.notes != null ? { notes: raw.create_field.notes } : {}),
      });
      const next = { ...raw, field_id: result.field.id };
      delete next.create_field;
      working.push(next);
      created.push({ fieldId: result.field.id, name: result.field.name, fieldSeasonId: result.fieldSeason.id });
    }
  }
  const classifiedSource = engine.parseJdCandidates(working, observedAt);
  const rows = engine.classifyJdBoundaries(classifiedSource, await store.loadCatalog(sql), await store.loadCommitted(sql));
  const staged = await store.stageReviewedRows(sql, rows, hash, classifiedSource.observedAt, 'john_deere');
  if (!process.argv.includes('--apply')) {
    process.stdout.write(JSON.stringify({ mode: 'stage', writes: 0, importId: staged.importId, created, summary: staged.summary, review: staged.review }) + '\n');
    return;
  }
  const applied = await store.applyBoundaryImport(sql, staged.importId);
  const review = await store.readImportReview(sql, staged.importId);
  process.stdout.write(JSON.stringify({
    mode: 'apply',
    writes: applied.results.inserted + applied.results.replaced + created.length,
    importId: staged.importId,
    created,
    summary: staged.summary,
    results: applied.results,
    review: review.review,
  }) + '\n');
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Boundary import failed';
  process.stderr.write(message + '\n');
  process.exit(error instanceof engine.BoundaryImportDisabled ? 1 : 2);
});
