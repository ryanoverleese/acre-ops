import { DataError } from '../supabase/registry';
import {
  type BoundaryDataset, type BoundaryGeometry, type CatalogField, type ClassifiedBoundary, type CommittedBoundary,
  assertImportWritesEnabled, classifyBoundaries, countDispositions, geometrySha256, reviewOf, validateGeometry,
} from './engine';

export interface Sql {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<T[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

function asId(value: unknown): number {
  const id = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new DataError('A required record id was missing', 500);
  return id;
}
function asText(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

export async function loadCatalog(sql: Sql): Promise<CatalogField[]> {
  const rows = await sql.query<{id: unknown; cropx_field_uuid: unknown}>('SELECT id, cropx_field_uuid FROM public.fields ORDER BY id');
  return rows.map(row => ({ id: asId(row.id), cropxFieldUuid: asText(row.cropx_field_uuid)?.toLowerCase() ?? null }));
}
export async function loadCommitted(sql: Sql): Promise<CommittedBoundary[]> {
  const rows = await sql.query<{field_id: unknown; cropx_field_uuid: unknown; geometry_sha256: unknown; edited: unknown}>(
    'SELECT field_id, cropx_field_uuid, geometry_sha256, (edited_at IS NOT NULL) AS edited FROM public.field_boundaries ORDER BY field_id');
  return rows.map(row => ({
    fieldId: asId(row.field_id),
    cropxFieldUuid: String(row.cropx_field_uuid),
    geometrySha256: String(row.geometry_sha256),
    edited: row.edited === true || row.edited === 't',
  }));
}

async function classifyFromDatabase(sql: Sql, dataset: BoundaryDataset): Promise<ClassifiedBoundary[]> {
  return classifyBoundaries(dataset, await loadCatalog(sql), await loadCommitted(sql));
}

export async function dryRunBoundaries(sql: Sql, dataset: BoundaryDataset) {
  const rows = await classifyFromDatabase(sql, dataset);
  return { writes: 0 as const, summary: countDispositions(rows), review: reviewOf(rows) };
}

export async function stageReviewedRows(sql: Sql, rows: ClassifiedBoundary[], requestSha256: string, observedAt: string) {
  assertImportWritesEnabled();
  if (!/^[0-9a-f]{64}$/.test(requestSha256)) throw new DataError('Dataset hash is invalid', 400);
  return sql.transaction(async () => {
    const summary = countDispositions(rows);
    const inserted = await sql.query<{id: unknown}>(
      `INSERT INTO public.field_boundary_imports (source, mode, crs, axis_order, observed_at, dataset_sha256, summary)
       VALUES ('cropx', 'stage', $1, $2, $3, $4, $5::jsonb) RETURNING id`,
      ['EPSG:4326', 'lonlat', observedAt, requestSha256, JSON.stringify(summary)]);
    const importId = asId(inserted[0]?.id);
    for (const row of rows) {
      const cropxFieldUuid = row.cropxFieldUuid;
      if (!cropxFieldUuid) throw new DataError('A staged boundary is missing its CropX uuid', 400);
      await sql.query(
        `INSERT INTO public.field_boundary_import_rows
          (import_id, cropx_field_uuid, source_field_name, source_farm_id, source_farm_name, source_cropx_field_id,
           geometry, geometry_sha256, declared_field_id, resolved_field_id, disposition, detail,
           source_observed_at, legacy_br_field_season_id, source_field_season_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [importId, cropxFieldUuid, row.sourceFieldName, row.sourceFarmId, row.sourceFarmName, row.sourceCropxFieldId,
          row.geometry ? JSON.stringify(row.geometry) : null, row.geometrySha256, row.acreFieldId, row.resolvedFieldId, row.disposition, row.detail,
          row.sourceObservedAt, row.legacyBrFieldSeasonId, row.sourceFieldSeasonId]);
    }
    return { importId, summary, review: reviewOf(rows) };
  });
}
export async function stageBoundaryImport(sql: Sql, dataset: BoundaryDataset, requestSha256: string) {
  return stageReviewedRows(sql, await classifyFromDatabase(sql, dataset), requestSha256, dataset.observedAt);
}

async function mark(sql: Sql, rowId: number, result: 'inserted' | 'replaced' | 'skipped_unchanged' | 'blocked') {
  await sql.query(
    `UPDATE public.field_boundary_import_rows
        SET apply_result = $2, applied_at = now()
      WHERE id = $1 AND apply_result IS DISTINCT FROM $2`,
    [rowId, result]);
}

export async function applyBoundaryImport(sql: Sql, importId: number) {
  assertImportWritesEnabled();
  return sql.transaction(async () => {
    const jobs = await sql.query<{id: unknown; observed_at: unknown}>(
      'SELECT id, observed_at FROM public.field_boundary_imports WHERE id = $1 FOR UPDATE', [importId]);
    if (!jobs.length) throw new DataError('Import was not found', 404);
    const observedAt = jobs[0].observed_at;
    const rows = await sql.query<Record<string, unknown>>(
      'SELECT * FROM public.field_boundary_import_rows WHERE import_id = $1 ORDER BY id FOR UPDATE', [importId]);
    const results = { inserted: 0, replaced: 0, skipped_unchanged: 0, blocked: 0 };
    for (const row of rows) {
      const rowId = asId(row.id);
      const outcome = await applyOne(sql, row, row.source_observed_at ?? observedAt);
      results[outcome] += 1;
      await mark(sql, rowId, outcome);
    }
    return { importId, results };
  });
}

async function applyOne(sql: Sql, row: Record<string, unknown>, observedAt: unknown): Promise<'inserted' | 'replaced' | 'skipped_unchanged' | 'blocked'> {
  const disposition = String(row.disposition);
  if (disposition === 'unchanged') return 'skipped_unchanged';
  const replacement = disposition === 'conflict_changed' && row.resolution === 'accept_replacement';
  if (disposition !== 'eligible' && !replacement) return 'blocked';
  if (row.resolved_field_id == null || row.geometry == null) return 'blocked';
  const fieldId = asId(row.resolved_field_id);
  const uuid = String(row.cropx_field_uuid);
  let geometry: BoundaryGeometry;
  try {
    const parsed = typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry;
    geometry = validateGeometry(parsed);
  } catch { return 'blocked'; }
  const hash = geometrySha256(geometry);
  if (hash !== row.geometry_sha256) return 'blocked';
  const owners = await sql.query<{id: unknown; cropx_field_uuid: string | null}>(
    `SELECT id, cropx_field_uuid FROM public.fields
      WHERE id = $1 OR lower(cropx_field_uuid) = $2
      ORDER BY id FOR UPDATE`, [fieldId, uuid]);
  const same = owners.filter(owner => asId(owner.id) === fieldId);
  const others = owners.filter(owner => asId(owner.id) !== fieldId);
  if (same.length !== 1 || others.length) return 'blocked';
  const stored = same[0].cropx_field_uuid == null ? null : String(same[0].cropx_field_uuid).toLowerCase();
  if (stored != null && stored !== uuid) return 'blocked';
  const existing = await sql.query<{geometry_sha256: unknown; edited_at: unknown}>(
    'SELECT geometry_sha256, edited_at FROM public.field_boundaries WHERE field_id = $1 FOR UPDATE', [fieldId]);
  const other = await sql.query<{field_id: unknown}>(
    'SELECT field_id FROM public.field_boundaries WHERE cropx_field_uuid = $1 AND field_id <> $2', [uuid, fieldId]);
  if (other.length) return 'blocked';
  if (!existing.length) {
    if (!replacement && disposition !== 'eligible') return 'blocked';
    await sql.query(
      `INSERT INTO public.field_boundaries
        (field_id, cropx_field_uuid, geometry, geometry_sha256, crs, axis_order, source, source_observed_at, import_row_id)
       VALUES ($1,$2,$3::jsonb,$4,'EPSG:4326','lonlat','cropx',$5,$6)`,
      [fieldId, uuid, JSON.stringify(geometry), hash, observedAt, asId(row.id)]);
    return 'inserted';
  }
  if (String(existing[0].geometry_sha256) === hash) return 'skipped_unchanged';
  if (existing[0].edited_at != null) return 'blocked';
  if (!replacement) return 'blocked';
  const updated = await sql.query<{field_id: unknown}>(
    `UPDATE public.field_boundaries
        SET geometry = $2::jsonb, geometry_sha256 = $3, source = 'cropx', source_observed_at = $4,
            import_row_id = $5, updated_at = now()
      WHERE field_id = $1 AND edited_at IS NULL
      RETURNING field_id`,
    [fieldId, JSON.stringify(geometry), hash, observedAt, asId(row.id)]);
  return updated.length ? 'replaced' : 'blocked';
}

export async function resolveBoundaryReplacement(sql: Sql, rowId: number) {
  assertImportWritesEnabled();
  return sql.transaction(async () => {
    const rows = await sql.query<{id: unknown; disposition: unknown}>(
      'SELECT id, disposition FROM public.field_boundary_import_rows WHERE id = $1 FOR UPDATE', [rowId]);
    if (!rows.length) throw new DataError('Import row was not found', 404);
    if (rows[0].disposition !== 'conflict_changed') throw new DataError('Only an unedited changed boundary can be marked for replacement', 400);
    await sql.query(
      `UPDATE public.field_boundary_import_rows SET resolution = 'accept_replacement'
        WHERE id = $1 AND resolution IS DISTINCT FROM 'accept_replacement'`, [rowId]);
    return { rowId };
  });
}

export async function readBoundaryFeatures(sql: Sql, ids: number[]) {
  const rows = await sql.query<{field_id: unknown; geometry: BoundaryGeometry; source: string; edited: unknown; crs: string; cropx_field_uuid: string}>(
    `SELECT field_id, geometry, source, (edited_at IS NOT NULL) AS edited, crs, cropx_field_uuid
       FROM public.field_boundaries WHERE field_id = ANY($1::bigint[]) ORDER BY field_id`, [ids]);
  return {
    type: 'FeatureCollection' as const,
    features: rows.map(row => ({
      type: 'Feature' as const,
      id: asId(row.field_id),
      geometry: row.geometry,
      properties: {
        fieldId: asId(row.field_id),
        source: row.source,
        edited: row.edited === true || row.edited === 't',
        crs: row.crs,
        cropxFieldUuid: row.cropx_field_uuid,
      },
    })),
  };
}

export async function editFieldBoundary(sql: Sql, fieldId: number, geometryInput: unknown) {
  const geometry = validateGeometry(geometryInput);
  const hash = geometrySha256(geometry);
  return sql.transaction(async () => {
    const rows = await sql.query<{geometry_sha256: unknown}>(
      'SELECT geometry_sha256 FROM public.field_boundaries WHERE field_id = $1 FOR UPDATE', [fieldId]);
    if (!rows.length) throw new DataError('This field has no boundary to edit', 404);
    if (String(rows[0].geometry_sha256) === hash) {
      await sql.query(
        `UPDATE public.field_boundaries
            SET source = 'edited', edited_at = COALESCE(edited_at, now())
          WHERE field_id = $1 AND (source IS DISTINCT FROM 'edited' OR edited_at IS NULL)`, [fieldId]);
      return { fieldId, edited: true, rewritten: false };
    }
    await sql.query(
      `UPDATE public.field_boundaries
          SET geometry = $2::jsonb, geometry_sha256 = $3, source = 'edited', edited_at = now(), updated_at = now()
        WHERE field_id = $1`,
      [fieldId, JSON.stringify(geometry), hash]);
    return { fieldId, edited: true, rewritten: true };
  });
}

export async function readImportReview(sql: Sql, importId: number) {
  const jobs = await sql.query<{id: unknown; summary: unknown; observed_at: unknown}>(
    'SELECT id, summary, observed_at FROM public.field_boundary_imports WHERE id = $1', [importId]);
  if (!jobs.length) throw new DataError('Import was not found', 404);
  const rows = await sql.query<Record<string, unknown>>(
    `SELECT id, cropx_field_uuid, source_cropx_field_id, declared_field_id, resolved_field_id, disposition, detail, resolution, apply_result
       FROM public.field_boundary_import_rows WHERE import_id = $1 ORDER BY id`, [importId]);
  return {
    importId,
    observedAt: jobs[0].observed_at,
    summary: jobs[0].summary,
    review: rows.map(row => ({
      rowId: asId(row.id),
      cropxFieldUuid: row.cropx_field_uuid,
      sourceCropxFieldId: row.source_cropx_field_id,
      acreFieldId: row.declared_field_id == null ? null : asId(row.declared_field_id),
      resolvedFieldId: row.resolved_field_id == null ? null : asId(row.resolved_field_id),
      disposition: row.disposition,
      detail: row.detail,
      resolution: row.resolution,
      applyResult: row.apply_result,
    })),
  };
}
