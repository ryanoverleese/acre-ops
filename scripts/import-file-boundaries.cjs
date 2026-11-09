#!/usr/bin/env node
// Stage shapefile boundaries that are already WGS84 lon/lat.
// Default is a dry-run: no database and no writes.
// The candidates file is a JSON array used as-is. Each object needs
// field_id, source_file, zip_sha256, FieldName, and geometry.
// Extra keys (zip, attrs, acres, valid) are accepted. valid:false is held back.
// There is no coordinate transform.
//
// Dry-run:
//   node scripts/import-file-boundaries.cjs --candidates staged_candidates_12.json
//
// After migration 20261109184500_field_boundary_file_source.sql is applied:
//   BOUNDARY_IMPORT_APPLY=I_AUTHORIZE_ACRE_OPS_BOUNDARY_IMPORT \
//     node scripts/import-file-boundaries.cjs --apply --candidates staged_candidates_12.json
//
// --apply stages the array, then copies eligible rows onto field_boundaries.
// Running it again does not insert a second boundary and does not change a
// boundary that already matches the file. --stage stops after the import record.
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
  return {
    store,
    sql: { query: database.query, transaction: database.transaction },
  };
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write('node scripts/import-file-boundaries.cjs --candidates file.json [--catalog catalog.json]\nBOUNDARY_IMPORT_APPLY=I_AUTHORIZE_ACRE_OPS_BOUNDARY_IMPORT node scripts/import-file-boundaries.cjs --apply --candidates file.json\n');
    return;
  }
  const writing = process.argv.includes('--stage') || process.argv.includes('--apply');
  if (writing && !engine.importWritesEnabled()) throw new engine.BoundaryImportDisabled();
  const file = arg('--candidates');
  if (!file || file.startsWith('-')) throw new engine.BoundaryDatasetError('A candidates file is required');
  const bytes = fs.readFileSync(path.resolve(file));
  const input = JSON.parse(bytes.toString('utf8'));
  const observedAt = arg('--observed-at') || new Date().toISOString();
  const parsed = engine.parseFileCandidates(input, observedAt);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
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
        fieldIds: parsed.items.map(item => item.fieldId),
        files: [...new Set(parsed.items.map(item => item.sourceFileName))],
        review: parsed.items.map(item => ({
          fieldId: item.fieldId,
          sourceFileName: item.sourceFileName,
          sourceFileSha256: item.sourceFileSha256,
          sourceFeatureName: item.sourceFeatureName,
          geometryOk: Boolean(item.geometry),
          detail: item.geometryDetail,
        })),
      }) + '\n');
      return;
    }
    const rows = engine.classifyFileBoundaries(parsed, engine.parseCatalog(JSON.parse(fs.readFileSync(path.resolve(catalogFile), 'utf8'))), []);
    const review = engine.reviewOf(rows);
    process.stdout.write(JSON.stringify({
      mode: 'dry-run',
      writes: 0,
      catalogChecked: true,
      summary: engine.countDispositions(rows),
      review: review.slice(0, 50),
      reviewTruncated: review.length > 50,
    }) + '\n');
    return;
  }
  const { store, sql } = loadWriter();
  const ready = await sql.query(
    `SELECT 1 AS ok FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'field_boundaries' AND column_name = 'source_file_sha256'`);
  if (!ready.length) throw new engine.BoundaryDatasetError('Apply migration 20261109184500_field_boundary_file_source.sql before staging shapefile boundaries');
  const rows = engine.classifyFileBoundaries(parsed, await store.loadCatalog(sql), await store.loadCommitted(sql));
  const staged = await store.stageReviewedRows(sql, rows, hash, parsed.observedAt, 'file');
  if (!process.argv.includes('--apply')) {
    process.stdout.write(JSON.stringify({ mode: 'stage', writes: 0, importId: staged.importId, summary: staged.summary, review: staged.review }) + '\n');
    return;
  }
  const applied = await store.applyBoundaryImport(sql, staged.importId);
  const review = await store.readImportReview(sql, staged.importId);
  process.stdout.write(JSON.stringify({
    mode: 'apply',
    writes: applied.results.inserted + applied.results.replaced,
    importId: staged.importId,
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
