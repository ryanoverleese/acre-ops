import { createHash } from 'node:crypto';

// Boundary contract. No network, no database, no credentials.
// Acre field identity is public.fields.id. content.fieldId is CropX's own id.
// File candidates are a JSON array keyed by fields.id. They are not CropX rows.

export const ACCEPTED_CRS = 'EPSG:4326';
export const ACCEPTED_AXIS_ORDER = 'lonlat';
export const BOUNDARY_IMPORT_APPLY_VALUE = 'I_AUTHORIZE_ACRE_OPS_BOUNDARY_IMPORT';

export class BoundaryDatasetError extends Error {
  constructor(message: string) { super(message); this.name = 'BoundaryDatasetError'; }
}
export class BoundaryImportDisabled extends Error {
  constructor() { super('Boundary import writes are disabled'); this.name = 'BoundaryImportDisabled'; }
}

export function importWritesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BOUNDARY_IMPORT_APPLY === BOUNDARY_IMPORT_APPLY_VALUE;
}
export function assertImportWritesEnabled(env?: NodeJS.ProcessEnv): void {
  if (!importWritesEnabled(env)) throw new BoundaryImportDisabled();
}

export type Position = [number, number];
export interface Polygon { type: 'Polygon'; coordinates: Position[][] }
export interface MultiPolygon { type: 'MultiPolygon'; coordinates: Position[][][] }
export type BoundaryGeometry = Polygon | MultiPolygon;

export interface CatalogField { id: number; cropxFieldUuid: string | null }
export interface CommittedBoundary {
  fieldId: number;
  cropxFieldUuid: string | null;
  geometrySha256: string;
  edited: boolean;
  sourceFileName?: string | null;
  sourceFileSha256?: string | null;
  sourceFeatureName?: string | null;
}

export interface BoundaryDataset {
  source: 'cropx';
  crs: typeof ACCEPTED_CRS;
  axisOrder: typeof ACCEPTED_AXIS_ORDER;
  observedAt: string;
  items: BoundaryItem[];
}
export interface BoundaryItem {
  cropxFieldUuid: string;
  acreFieldId: number | null;
  sourceFieldName: string | null;
  sourceFarmId: string | null;
  sourceFarmName: string | null;
  sourceCropxFieldId: string | null;
  geometry: BoundaryGeometry | null;
  geometryDetail: string | null;
  center: Position | null;
  sourceObservedAt?: string | null;
  legacyBrFieldSeasonId?: number | null;
  sourceFieldSeasonId?: number | null;
}

export const DISPOSITIONS = [
  'eligible', 'unchanged', 'conflict_edited', 'conflict_changed', 'ambiguous',
  'unmatched', 'invalid_geometry', 'identity_disagreement', 'unconfirmed_crosswalk',
  'failed_fetch', 'held_unresolved',
] as const;
export type Disposition = typeof DISPOSITIONS[number];

export interface ClassifiedBoundary {
  cropxFieldUuid: string | null;
  acreFieldId: number | null;
  resolvedFieldId: number | null;
  sourceFieldName: string | null;
  sourceFarmId: string | null;
  sourceFarmName: string | null;
  sourceCropxFieldId: string | null;
  sourceFileName: string | null;
  sourceFileSha256: string | null;
  sourceFeatureName: string | null;
  geometry: BoundaryGeometry | null;
  geometrySha256: string | null;
  sourceObservedAt: string | null;
  legacyBrFieldSeasonId: number | null;
  sourceFieldSeasonId: number | null;
  disposition: Disposition;
  detail: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BoundaryDatasetError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new BoundaryDatasetError('Dataset contains an unrecognized field');
}
export function parseInstant(value: unknown): string {
  if (typeof value !== 'string' || !INSTANT_RE.test(value) || !Number.isFinite(Date.parse(value))) throw new BoundaryDatasetError('observedAt must be an instant with a timezone');
  return new Date(value).toISOString();
}
function optionalText(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new BoundaryDatasetError('A provenance value has an unsupported type');
  const text = String(value).trim();
  if (!text || text.length > 200) throw new BoundaryDatasetError('A provenance value is missing or too long');
  return text;
}

export function canonicalUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim().toLowerCase())) throw new BoundaryDatasetError('CropX field UUID is not a UUID');
  return value.trim().toLowerCase();
}

function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum / 2;
}
function pointInRing(pt: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1], yj = ring[j][1];
    if (yj === yi) continue;
    const intersect = (yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((ring[j][0] - ring[i][0]) * (pt[1] - yi)) / (yj - yi) + ring[i][0];
    if (intersect) inside = !inside;
  }
  return inside;
}
function onSegment(pt: Position, a: Position, b: Position): boolean {
  const cross = (pt[1] - a[1]) * (b[0] - a[0]) - (pt[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (pt[0] - a[0]) * (b[0] - a[0]) + (pt[1] - a[1]) * (b[1] - a[1]);
  if (dot < -1e-9) return false;
  const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  return dot <= len2 + 1e-9;
}
function insideOrOn(pt: Position, ring: Position[]): boolean {
  for (let i = 0; i < ring.length - 1; i++) if (onSegment(pt, ring[i], ring[i + 1])) return true;
  return pointInRing(pt, ring);
}

function readRing(value: unknown): Position[] | string {
  if (!Array.isArray(value) || value.length < 4 || value.length > 20000) return 'A ring must have between 4 and 20000 positions';
  const ring: Position[] = [];
  for (const pos of value) {
    if (!Array.isArray(pos) || pos.length !== 2) return 'Each position must be longitude and latitude only';
    const [lon, lat] = pos;
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) return 'Coordinates must be finite numbers';
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return 'Coordinates are outside EPSG:4326 longitude and latitude ranges';
    ring.push([lon, lat]);
  }
  const first = ring[0], last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return 'Each ring must be closed';
  for (let i = 1; i < ring.length - 1; i++) if (ring[i][0] === ring[i - 1][0] && ring[i][1] === ring[i - 1][1]) return 'A ring has a repeated position';
  if (Math.abs(ringArea(ring)) < 1e-12) return 'A ring has no area';
  return ring;
}

function readPolygon(coordinates: unknown): Polygon | string {
  if (!Array.isArray(coordinates) || coordinates.length < 1 || coordinates.length > 100) return 'A polygon needs one exterior ring';
  const rings: Position[][] = [];
  for (const raw of coordinates) {
    const ring = readRing(raw);
    if (typeof ring === 'string') return ring;
    rings.push(ring);
  }
  const shell = rings[0];
  for (const hole of rings.slice(1)) {
    const open = hole.slice(0, -1);
    const cx = open.reduce((sum, p) => sum + p[0], 0) / open.length;
    const cy = open.reduce((sum, p) => sum + p[1], 0) / open.length;
    if (!pointInRing([cx, cy], shell) || open.some(pt => !insideOrOn(pt, shell))) return 'A hole is outside its exterior ring';
  }
  return { type: 'Polygon', coordinates: rings };
}

export function inspectGeometry(value: unknown): { ok: true; geometry: BoundaryGeometry } | { ok: false; detail: string } {
  const obj = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!obj) return { ok: false, detail: 'Boundary geometry must be an object' };
  rejectUnknown(obj, ['type', 'coordinates']);
  if (obj.type !== 'Polygon' && obj.type !== 'MultiPolygon') return { ok: false, detail: 'Boundary geometry must be a Polygon or MultiPolygon' };
  if (obj.type === 'Polygon') {
    const polygon = readPolygon(obj.coordinates);
    return typeof polygon === 'string' ? { ok: false, detail: polygon } : { ok: true, geometry: polygon };
  }
  if (!Array.isArray(obj.coordinates) || obj.coordinates.length < 1 || obj.coordinates.length > 100) return { ok: false, detail: 'A multipolygon needs at least one polygon' };
  const parts: Position[][][] = [];
  for (const part of obj.coordinates) {
    const polygon = readPolygon(part);
    if (typeof polygon === 'string') return { ok: false, detail: polygon };
    parts.push(polygon.coordinates);
  }
  return { ok: true, geometry: { type: 'MultiPolygon', coordinates: parts } };
}

export function validateGeometry(value: unknown): BoundaryGeometry {
  const inspected = inspectGeometry(value);
  if (!inspected.ok) throw new BoundaryDatasetError(inspected.detail);
  return inspected.geometry;
}

export function geometrySha256(geometry: BoundaryGeometry): string {
  return createHash('sha256').update(JSON.stringify({ type: geometry.type, coordinates: geometry.coordinates })).digest('hex');
}

function readCenter(value: unknown, geometry: BoundaryGeometry): Position | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== 2) throw new BoundaryDatasetError('Center must be longitude and latitude');
  const [lon, lat] = value;
  if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) throw new BoundaryDatasetError('Center must be finite numbers');
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new BoundaryDatasetError('Center is outside EPSG:4326 ranges');
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const visit = (rings: Position[][]) => rings.forEach(ring => ring.forEach(([x, y]) => {
    minLon = Math.min(minLon, x); maxLon = Math.max(maxLon, x); minLat = Math.min(minLat, y); maxLat = Math.max(maxLat, y);
  }));
  if (geometry.type === 'Polygon') visit(geometry.coordinates);
  else geometry.coordinates.forEach(visit);
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) throw new BoundaryDatasetError('Center is outside the boundary extent');
  return [lon, lat];
}

function readItem(value: unknown): BoundaryItem {
  const item = record(value, 'Each boundary item');
  rejectUnknown(item, ['cropxFieldUuid', 'acreFieldId', 'content']);
  const uuid = canonicalUuid(item.cropxFieldUuid);
  let acreFieldId: number | null = null;
  if (item.acreFieldId != null) {
    if (typeof item.acreFieldId !== 'number' || !Number.isSafeInteger(item.acreFieldId) || item.acreFieldId <= 0) throw new BoundaryDatasetError('acreFieldId must be a fields.id');
    acreFieldId = item.acreFieldId;
  }
  const content = record(item.content, 'CropX field content');
  rejectUnknown(content, ['fieldId', 'fieldName', 'geoJsonBoundary', 'center', 'farm']);
  if (!Object.hasOwn(content, 'geoJsonBoundary')) throw new BoundaryDatasetError('CropX field content needs geoJsonBoundary');
  let farmId: string | null = null, farmName: string | null = null;
  if (content.farm != null) {
    const farm = record(content.farm, 'Farm');
    rejectUnknown(farm, ['id', 'name']);
    farmId = optionalText(farm.id);
    farmName = optionalText(farm.name);
  }
  const inspected = inspectGeometry(content.geoJsonBoundary);
  const geometry = inspected.ok ? inspected.geometry : null;
  if (geometry && content.center != null) readCenter(content.center, geometry);
  return {
    cropxFieldUuid: uuid,
    acreFieldId,
    sourceFieldName: optionalText(content.fieldName),
    sourceFarmId: farmId,
    sourceFarmName: farmName,
    sourceCropxFieldId: optionalText(content.fieldId),
    geometry,
    geometryDetail: inspected.ok ? null : inspected.detail,
    center: geometry && content.center != null ? readCenter(content.center, geometry) : null,
  };
}

export function parseBoundaryDataset(input: unknown): BoundaryDataset {
  const body = record(input, 'Boundary dataset');
  rejectUnknown(body, ['source', 'crs', 'axisOrder', 'observedAt', 'items']);
  for (const key of ['source', 'crs', 'axisOrder', 'observedAt', 'items']) if (!Object.hasOwn(body, key)) throw new BoundaryDatasetError('Dataset is missing a required field');
  if (body.source !== 'cropx') throw new BoundaryDatasetError('Boundary source must be cropx');
  if (body.crs !== ACCEPTED_CRS) throw new BoundaryDatasetError('CRS must be declared EPSG:4326');
  if (body.axisOrder !== ACCEPTED_AXIS_ORDER) throw new BoundaryDatasetError('Axis order must be declared lonlat');
  if (typeof body.observedAt !== 'string' || !parseInstant(body.observedAt)) throw new BoundaryDatasetError('observedAt must be an instant with a timezone');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 1000) throw new BoundaryDatasetError('Dataset needs between 1 and 1000 fields');
  const seen = new Set<string>();
  const items = body.items.map(readItem);
  for (const item of items) {
    if (seen.has(item.cropxFieldUuid)) throw new BoundaryDatasetError('Dataset repeats a CropX field UUID');
    seen.add(item.cropxFieldUuid);
  }
  return { source: 'cropx', crs: ACCEPTED_CRS, axisOrder: ACCEPTED_AXIS_ORDER, observedAt: new Date(body.observedAt).toISOString(), items };
}

export function parseCatalog(input: unknown): CatalogField[] {
  const body = record(input, 'Field catalog');
  rejectUnknown(body, ['fields']);
  if (!Array.isArray(body.fields)) throw new BoundaryDatasetError('Catalog needs a fields array');
  return body.fields.map(entry => {
    const row = record(entry, 'Catalog field');
    rejectUnknown(row, ['id', 'cropxFieldUuid']);
    if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0) throw new BoundaryDatasetError('Catalog id must be a fields.id');
    if (row.cropxFieldUuid == null || row.cropxFieldUuid === '') return { id: row.id, cropxFieldUuid: null };
    return { id: row.id, cropxFieldUuid: canonicalUuid(row.cropxFieldUuid) };
  });
}

export function classifyBoundaries(dataset: BoundaryDataset, catalog: CatalogField[], committed: CommittedBoundary[]): ClassifiedBoundary[] {
  const byUuid = new Map<string, number[]>();
  const byId = new Map<number, CatalogField>();
  for (const field of catalog) {
    if (byId.has(field.id)) throw new BoundaryDatasetError('Catalog repeats a fields.id');
    byId.set(field.id, field);
    if (!field.cropxFieldUuid) continue;
    const ids = byUuid.get(field.cropxFieldUuid) ?? [];
    ids.push(field.id);
    byUuid.set(field.cropxFieldUuid, ids);
  }
  const committedByField = new Map(committed.map(row => [row.fieldId, row]));
  return dataset.items.map(item => {
    const base = {
      cropxFieldUuid: item.cropxFieldUuid,
      acreFieldId: item.acreFieldId,
      sourceFieldName: item.sourceFieldName,
      sourceFarmId: item.sourceFarmId,
      sourceFarmName: item.sourceFarmName,
      sourceCropxFieldId: item.sourceCropxFieldId,
      sourceFileName: null,
      sourceFileSha256: null,
      sourceFeatureName: null,
      geometry: item.geometry,
      geometrySha256: item.geometry ? geometrySha256(item.geometry) : null,
    };
    const owners = byUuid.get(item.cropxFieldUuid) ?? [];
    const finish = (disposition: Disposition, detail: string, resolvedFieldId: number | null, keepGeometry = true): ClassifiedBoundary => ({
      ...base,
      sourceObservedAt: item.sourceObservedAt ?? null,
      legacyBrFieldSeasonId: item.legacyBrFieldSeasonId ?? null,
      sourceFieldSeasonId: item.sourceFieldSeasonId ?? null,
      disposition, detail, resolvedFieldId,
      geometry: keepGeometry ? base.geometry : null,
      geometrySha256: keepGeometry ? base.geometrySha256 : null,
    });
    if (!item.geometry) return finish('invalid_geometry', item.geometryDetail || 'Boundary geometry is invalid', null, false);
    if (owners.length > 1) return finish('ambiguous', `CropX uuid matches fields.id ${owners.join(', ')}`, null);
    if (item.acreFieldId != null && !byId.has(item.acreFieldId)) return finish('identity_disagreement', 'acreFieldId is not a fields.id', null);
    if (owners.length === 1) {
      const fieldId = owners[0];
      if (item.acreFieldId != null && item.acreFieldId !== fieldId) return finish('identity_disagreement', 'acreFieldId does not match the fields.id for this CropX uuid', null);
      const existing = committedByField.get(fieldId);
      if (existing && existing.cropxFieldUuid !== item.cropxFieldUuid) return finish('conflict_changed', 'Stored boundary has a different CropX uuid', fieldId);
      if (!existing) return finish('eligible', 'Unique fields.id match', fieldId);
      if (existing.geometrySha256 === base.geometrySha256) return finish('unchanged', 'Stored boundary is unchanged', fieldId);
      if (existing.edited) return finish('conflict_edited', 'Stored boundary was edited', fieldId);
      return finish('conflict_changed', 'Stored boundary differs and was not marked for replacement', fieldId);
    }
    if (item.acreFieldId != null) {
      const claimed = byId.get(item.acreFieldId)!;
      if (claimed.cropxFieldUuid && claimed.cropxFieldUuid !== item.cropxFieldUuid) return finish('identity_disagreement', 'acreFieldId does not match the fields.id for this CropX uuid', null);
      return finish('unconfirmed_crosswalk', 'Crosswalk field has no stored CropX uuid', null);
    }
    return finish('unmatched', 'No fields row has this CropX uuid', null);
  });
}

export function reviewOf(rows: ClassifiedBoundary[]) {
  return rows.map(row => ({
    cropxFieldUuid: row.cropxFieldUuid,
    acreFieldId: row.acreFieldId,
    resolvedFieldId: row.resolvedFieldId,
    sourceCropxFieldId: row.sourceCropxFieldId,
    sourceFileName: row.sourceFileName,
    sourceFileSha256: row.sourceFileSha256,
    sourceFeatureName: row.sourceFeatureName,
    disposition: row.disposition,
    detail: row.detail,
    legacyBrFieldSeasonId: row.legacyBrFieldSeasonId,
    sourceFieldSeasonId: row.sourceFieldSeasonId,
  }));
}
export function countDispositions(rows: ClassifiedBoundary[]): Record<Disposition, number> {
  const counts = Object.fromEntries(DISPOSITIONS.map(key => [key, 0])) as Record<Disposition, number>;
  for (const row of rows) counts[row.disposition] += 1;
  return counts;
}

const FILE_SHA_RE = /^[0-9a-f]{64}$/;

export interface FileBoundaryItem {
  fieldId: number;
  sourceFileName: string;
  sourceFileSha256: string;
  sourceFeatureName: string;
  sourceFarmName: string | null;
  geometry: BoundaryGeometry | null;
  geometryDetail: string | null;
}
export interface FileBoundaryDataset {
  source: 'file';
  crs: typeof ACCEPTED_CRS;
  axisOrder: typeof ACCEPTED_AXIS_ORDER;
  observedAt: string;
  items: FileBoundaryItem[];
}

function fileText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new BoundaryDatasetError(`${label} must be text`);
  const text = value.trim();
  if (!text || text.length > 200) throw new BoundaryDatasetError(`${label} is missing or too long`);
  return text;
}

// The approved shapefile export is a JSON array, used as-is.
// field_id, source_file, zip_sha256, FieldName, and geometry are required.
// zip, attrs, acres, and valid may be present. valid:false holds the geometry back.
// Coordinates are already WGS84 longitude/latitude. This does not transform them.
export function parseFileCandidates(input: unknown, observedAt: string): FileBoundaryDataset {
  const instant = parseInstant(observedAt);
  if (!Array.isArray(input)) throw new BoundaryDatasetError('File candidates must be a JSON array');
  if (input.length < 1 || input.length > 1000) throw new BoundaryDatasetError('Dataset needs between 1 and 1000 fields');
  const seen = new Set<number>();
  const items = input.map(value => {
    const item = record(value, 'Each file candidate');
    for (const key of ['field_id', 'source_file', 'zip_sha256', 'FieldName', 'geometry']) {
      if (!Object.hasOwn(item, key)) throw new BoundaryDatasetError('A file candidate is missing field_id, source_file, zip_sha256, FieldName, or geometry');
    }
    if (typeof item.field_id !== 'number' || !Number.isSafeInteger(item.field_id) || item.field_id <= 0) throw new BoundaryDatasetError('field_id must be a fields.id');
    if (seen.has(item.field_id)) throw new BoundaryDatasetError('File candidates repeat a fields.id');
    seen.add(item.field_id);
    const sha = typeof item.zip_sha256 === 'string' ? item.zip_sha256.trim().toLowerCase() : '';
    if (!FILE_SHA_RE.test(sha)) throw new BoundaryDatasetError('zip_sha256 must be a sha256 hex digest');
    if (item.valid != null && typeof item.valid !== 'boolean') throw new BoundaryDatasetError('valid must be a boolean');
    let sourceFarmName: string | null = null;
    if (item.attrs != null) {
      const attrs = record(item.attrs, 'Candidate attrs');
      if (attrs.FarmName != null && attrs.FarmName !== '') sourceFarmName = optionalText(attrs.FarmName);
    }
    let geometry: BoundaryGeometry | null = null;
    let geometryDetail: string | null = null;
    if (item.valid === false) geometryDetail = 'Candidate was not marked valid';
    else {
      const inspected = inspectGeometry(item.geometry);
      if (inspected.ok) geometry = inspected.geometry;
      else geometryDetail = inspected.detail;
    }
    return {
      fieldId: item.field_id,
      sourceFileName: fileText(item.source_file, 'source_file'),
      sourceFileSha256: sha,
      sourceFeatureName: fileText(item.FieldName, 'FieldName'),
      sourceFarmName,
      geometry,
      geometryDetail,
    };
  });
  return { source: 'file', crs: ACCEPTED_CRS, axisOrder: ACCEPTED_AXIS_ORDER, observedAt: instant, items };
}

function sameFileLineage(existing: CommittedBoundary, item: FileBoundaryItem): boolean {
  return (existing.sourceFileName ?? null) === item.sourceFileName
    && (existing.sourceFileSha256 ?? null) === item.sourceFileSha256
    && (existing.sourceFeatureName ?? null) === item.sourceFeatureName;
}

// File rows are keyed by public.fields.id. They do not match or invent a CropX uuid.
export function classifyFileBoundaries(dataset: FileBoundaryDataset, catalog: CatalogField[], committed: CommittedBoundary[]): ClassifiedBoundary[] {
  const byId = new Map<number, CatalogField>();
  for (const field of catalog) {
    if (byId.has(field.id)) throw new BoundaryDatasetError('Catalog repeats a fields.id');
    byId.set(field.id, field);
  }
  const committedByField = new Map(committed.map(row => [row.fieldId, row]));
  return dataset.items.map(item => {
    const hash = item.geometry ? geometrySha256(item.geometry) : null;
    const base = {
      cropxFieldUuid: null,
      acreFieldId: item.fieldId,
      sourceFieldName: item.sourceFeatureName,
      sourceFarmId: null,
      sourceFarmName: item.sourceFarmName,
      sourceCropxFieldId: null,
      sourceFileName: item.sourceFileName,
      sourceFileSha256: item.sourceFileSha256,
      sourceFeatureName: item.sourceFeatureName,
      geometry: item.geometry,
      geometrySha256: hash,
    };
    const finish = (disposition: Disposition, detail: string, resolvedFieldId: number | null, keepGeometry = true): ClassifiedBoundary => ({
      ...base,
      sourceObservedAt: dataset.observedAt,
      legacyBrFieldSeasonId: null,
      sourceFieldSeasonId: null,
      disposition, detail, resolvedFieldId,
      geometry: keepGeometry ? base.geometry : null,
      geometrySha256: keepGeometry ? base.geometrySha256 : null,
    });
    if (!item.geometry) return finish('invalid_geometry', item.geometryDetail || 'Boundary geometry is invalid', null, false);
    if (!byId.has(item.fieldId)) return finish('unmatched', 'No fields row has this id', null);
    const existing = committedByField.get(item.fieldId);
    if (!existing) return finish('eligible', 'Unique fields.id match', item.fieldId);
    if (existing.geometrySha256 === hash && sameFileLineage(existing, item)) return finish('unchanged', 'Stored boundary is unchanged', item.fieldId);
    if (existing.edited) return finish('conflict_edited', 'Stored boundary was edited', item.fieldId);
    return finish('conflict_changed', 'Stored boundary differs and was not marked for replacement', item.fieldId);
  });
}

export interface SeasonLink { brFsId: number; fieldSeasonId: number; fieldId: number | null }
export interface HandoffHold { fieldId: number | null; cropxFieldUuid: string | null; issue: string }
export interface HandoffRawBoundary {
  fetched_at?: string;
  http_status?: number;
  name?: string | null;
  farmName?: string | null;
  geoJsonBoundary?: unknown;
}
export interface HandoffIndexRow {
  field_id: number;
  field_season_id: number;
  br_fs_id: number;
  cropx_field_uuid: string;
  sb_cropx_uuid?: string | null;
}
export interface HandoffBundle {
  crs: string;
  axisOrder: string;
  crsDeclaredBy: string;
  indexRows: HandoffIndexRow[];
  rawByUuid: Record<string, HandoffRawBoundary>;
  holds: HandoffHold[];
  duplicateUuids: string[];
  seasonLinks?: SeasonLink[];
}

function heldRow(partial: {
  cropxFieldUuid: string | null; acreFieldId: number | null; disposition: Disposition; detail: string;
  sourceObservedAt?: string | null; legacyBrFieldSeasonId?: number | null; sourceFieldSeasonId?: number | null;
  sourceFieldName?: string | null; sourceFarmName?: string | null;
}): ClassifiedBoundary {
  return {
    cropxFieldUuid: partial.cropxFieldUuid, acreFieldId: partial.acreFieldId, resolvedFieldId: null,
    sourceFieldName: partial.sourceFieldName ?? null, sourceFarmId: null, sourceFarmName: partial.sourceFarmName ?? null,
    sourceCropxFieldId: null, sourceFileName: null, sourceFileSha256: null, sourceFeatureName: null,
    geometry: null, geometrySha256: null,
    sourceObservedAt: partial.sourceObservedAt ?? null, legacyBrFieldSeasonId: partial.legacyBrFieldSeasonId ?? null,
    sourceFieldSeasonId: partial.sourceFieldSeasonId ?? null, disposition: partial.disposition, detail: partial.detail,
  };
}

// The handoff's verified CSV is not import-ready. Duplicates, workbook disagreements,
// unresolved rows, and failed or invalid geometry stay out of the eligible set.
export function reviewHandoff(bundle: HandoffBundle, catalog: CatalogField[], committed: CommittedBoundary[] = []): { rows: ClassifiedBoundary[]; supplemental: ClassifiedBoundary[] } {
  if (bundle.crs !== ACCEPTED_CRS || bundle.axisOrder !== ACCEPTED_AXIS_ORDER) throw new BoundaryDatasetError('CRS must be declared EPSG:4326 lonlat');
  if (!bundle.crsDeclaredBy.trim()) throw new BoundaryDatasetError('CRS declaration source is missing');
  const owners = new Map<string, number[]>();
  for (const row of bundle.indexRows) {
    const uuid = canonicalUuid(row.cropx_field_uuid);
    const ids = owners.get(uuid) ?? [];
    if (!ids.includes(row.field_id)) ids.push(row.field_id);
    owners.set(uuid, ids);
  }
  const duplicated = new Set(bundle.duplicateUuids.map(uuid => canonicalUuid(uuid)));
  for (const [uuid, ids] of owners) if (ids.length > 1) duplicated.add(uuid);
  const holdIssue = new Map<number, string>();
  for (const hold of bundle.holds) if (hold.fieldId != null) holdIssue.set(hold.fieldId, hold.issue);
  const seasonByKey = new Map<string, SeasonLink>();
  for (const link of bundle.seasonLinks ?? []) seasonByKey.set(`${link.brFsId}:${link.fieldSeasonId}`, link);
  const held: ClassifiedBoundary[] = [];
  const pending: BoundaryItem[] = [];
  let latest = '1970-01-01T00:00:00.000Z';
  const seenFields = new Set<number>();
  for (const row of bundle.indexRows) {
    if (seenFields.has(row.field_id)) throw new BoundaryDatasetError('Handoff repeats a fields.id');
    seenFields.add(row.field_id);
    const uuid = canonicalUuid(row.cropx_field_uuid);
    const raw = bundle.rawByUuid[uuid];
    const observed = raw?.fetched_at ? parseInstant(raw.fetched_at) : null;
    if (observed && observed > latest) latest = observed;
    const reasons: string[] = [];
    if (duplicated.has(uuid)) reasons.push(`CropX uuid is shared by fields.id ${(owners.get(uuid) ?? []).join(', ')}`);
    const issue = holdIssue.get(row.field_id);
    if (issue) reasons.push(issue);
    if (row.sb_cropx_uuid != null && row.sb_cropx_uuid !== '' && canonicalUuid(row.sb_cropx_uuid) !== uuid) reasons.push('fields.cropx_field_uuid disagrees with the crosswalk uuid');
    if (bundle.seasonLinks) {
      const link = seasonByKey.get(`${row.br_fs_id}:${row.field_season_id}`);
      if (!link || link.fieldId !== row.field_id) reasons.push('Legacy field-season id does not join to this fields.id');
    }
    const failedFetch = !raw || raw.geoJsonBoundary == null || (raw.http_status != null && raw.http_status !== 200);
    if (failedFetch) reasons.push(raw?.http_status != null && raw.http_status !== 200 ? `CropX fetch HTTP ${raw.http_status}` : 'Boundary geometry is missing');
    const lineage = { legacyBrFieldSeasonId: row.br_fs_id, sourceFieldSeasonId: row.field_season_id, sourceObservedAt: observed };
    if (reasons.length) {
      const disposition: Disposition = duplicated.has(uuid) ? 'ambiguous'
        : reasons.some(reason => /disagree|does not join/i.test(reason)) ? 'identity_disagreement'
        : failedFetch ? 'failed_fetch'
        : 'held_unresolved';
      held.push(heldRow({ cropxFieldUuid: uuid, acreFieldId: row.field_id, disposition, detail: reasons.join('; '), ...lineage }));
      continue;
    }
    const inspected = inspectGeometry(raw?.geoJsonBoundary);
    if (!inspected.ok) {
      held.push(heldRow({ cropxFieldUuid: uuid, acreFieldId: row.field_id, disposition: 'invalid_geometry', detail: inspected.detail, ...lineage }));
      continue;
    }
    pending.push({
      cropxFieldUuid: uuid, acreFieldId: row.field_id, sourceFieldName: optionalText(raw?.name), sourceFarmId: null,
      sourceFarmName: optionalText(raw?.farmName), sourceCropxFieldId: null, geometry: inspected.geometry, geometryDetail: null,
      center: null, sourceObservedAt: observed, legacyBrFieldSeasonId: row.br_fs_id, sourceFieldSeasonId: row.field_season_id,
    });
  }
  const supplemental: ClassifiedBoundary[] = [];
  for (const hold of bundle.holds) {
    if (hold.fieldId != null && seenFields.has(hold.fieldId)) continue;
    supplemental.push(heldRow({
      cropxFieldUuid: hold.cropxFieldUuid ? canonicalUuid(hold.cropxFieldUuid) : null,
      acreFieldId: hold.fieldId, disposition: 'held_unresolved', detail: hold.issue,
    }));
  }
  const classified = pending.length ? classifyBoundaries({
    source: 'cropx', crs: ACCEPTED_CRS, axisOrder: ACCEPTED_AXIS_ORDER, observedAt: latest, items: pending,
  }, catalog, committed) : [];
  // A verified bridge may name a fields.id whose cropx_field_uuid is still empty.
  // That is eligible only when no other field already owns the uuid. The field row itself is not updated.
  for (const row of classified) {
    if (row.disposition === 'unconfirmed_crosswalk' && row.acreFieldId != null && row.geometry) {
      row.disposition = 'eligible';
      row.resolvedFieldId = row.acreFieldId;
      row.detail = 'Verified fields.id bridge; fields.cropx_field_uuid is empty and was not changed';
    }
  }
  return { rows: [...held, ...classified], supplemental };
}
