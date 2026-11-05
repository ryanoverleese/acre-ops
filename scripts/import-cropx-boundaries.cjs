#!/usr/bin/env node
// Offline CropX boundary dry-run. This file never opens a database or the network.
// Writes stay on POST /api/field-boundaries/import after the migration is applied
// and BOUNDARY_IMPORT_APPLY is set for an authorized rollout.
const fs = require('node:fs');
const path = require('node:path');
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
function readJson(file) {
  if (!file || file.startsWith('-')) throw new engine.BoundaryDatasetError('A dataset file and a catalog file are required');
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

try {
  if (process.argv.includes('--help')) {
    process.stdout.write('node scripts/import-cropx-boundaries.cjs --dataset file.json --catalog catalog.json\nnode scripts/import-cropx-boundaries.cjs --handoff DIR --catalog catalog.json [--seasons seasons.json]\n');
    process.exit(0);
  }
  if (['--stage', '--apply', '--resolve'].some(flag => process.argv.includes(flag))) {
    throw new engine.BoundaryImportDisabled();
  }
  if (arg('--handoff')) {
    const dir = path.resolve(arg('--handoff'));
    const readme = fs.readFileSync(path.join(dir, 'README_HANDOFF.md'), 'utf8');
    const notes = fs.readFileSync(path.join(dir, 'cropx_api_endpoint_handoff.md'), 'utf8');
    if (!/lon\/lat/i.test(readme) || !/lon\/lat/i.test(notes)) throw new engine.BoundaryDatasetError('CRS must be declared EPSG:4326 lonlat');
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'field_boundary_index.json'), 'utf8'));
    const unresolved = JSON.parse(fs.readFileSync(path.join(dir, 'unresolved_or_ambiguous.json'), 'utf8'));
    const rawByUuid = {};
    for (const row of index.rows) {
      const uuid = String(row.cropx_field_uuid).toLowerCase();
      if (rawByUuid[uuid]) continue;
      const file = path.resolve(dir, row.boundary_relpath || path.join('boundaries_raw', `${uuid}.json`));
      if (file !== dir && !file.startsWith(dir + path.sep)) throw new engine.BoundaryDatasetError('Boundary path escapes the handoff directory');
      if (fs.existsSync(file)) rawByUuid[uuid] = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    const holds = [];
    for (const row of unresolved.unresolved || []) holds.push({ fieldId: row.field_id ?? null, cropxFieldUuid: row.effective_cx_uuid || row.workbook_cx_uuid || null, issue: row.issue || 'unresolved' });
    for (const row of unresolved.ambiguous || []) holds.push({ fieldId: row.field_id ?? null, cropxFieldUuid: row.sb_cropx_uuid || row.workbook_cx_uuid || null, issue: row.issue || 'ambiguous' });
    const catalog = engine.parseCatalog(readJson(arg('--catalog')));
    const seasons = arg('--seasons') ? JSON.parse(fs.readFileSync(path.resolve(arg('--seasons')), 'utf8')) : undefined;
    const reviewed = engine.reviewHandoff({
      crs: 'EPSG:4326', axisOrder: 'lonlat', crsDeclaredBy: 'handoff README and endpoint notes: GeoJSON coordinates lon/lat',
      indexRows: index.rows, rawByUuid, holds, duplicateUuids: (unresolved.verified_dup_uuid_groups || []).map(pair => pair[0]), seasonLinks: seasons,
    }, catalog, []);
    const rows = [...reviewed.rows, ...reviewed.supplemental];
    const summary = engine.countDispositions(rows);
    process.stdout.write(JSON.stringify({ mode: 'dry-run', writes: 0, importReady: summary.eligible, summary, holds: engine.reviewOf(rows).filter(row => row.disposition !== 'eligible') }) + '\n');
    process.exit(0);
  }
  const dataset = engine.parseBoundaryDataset(readJson(arg('--dataset')));
  const catalog = engine.parseCatalog(readJson(arg('--catalog')));
  const rows = engine.classifyBoundaries(dataset, catalog, []);
  const review = engine.reviewOf(rows);
  process.stdout.write(JSON.stringify({
    mode: 'dry-run',
    writes: 0,
    summary: engine.countDispositions(rows),
    review: review.slice(0, 50),
    reviewTruncated: review.length > 50,
  }) + '\n');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Boundary dry-run failed';
  process.stderr.write(message + '\n');
  process.exit(error instanceof engine.BoundaryImportDisabled ? 1 : 2);
}
