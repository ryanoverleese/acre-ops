import 'server-only';
import { query } from '@/lib/supabase/database';
import { polygonArea, sqMetersToAcres } from '@/lib/measure-geo';

/** Prefer boundary-derived acres; fall back to fields.acres when no boundary. */
export function effectiveFieldAcres(
  storedAcres: number | null | undefined,
  boundaryAcres: number | null | undefined,
): number | null {
  if (boundaryAcres != null && Number.isFinite(Number(boundaryAcres))) {
    return Number(boundaryAcres);
  }
  if (storedAcres != null && Number.isFinite(Number(storedAcres))) {
    return Number(storedAcres);
  }
  return null;
}

/** Overlay field_boundaries.acres onto Field rows (main acres source everywhere). */
export async function applyBoundaryAcresToFields<T extends { id?: number; acres?: number | null }>(
  rows: T[],
): Promise<T[]> {
  if (!rows.length) return rows;
  const boundaryAcres = await loadBoundaryAcresByFieldId();
  if (!boundaryAcres.size) return rows;
  return rows.map((row) => {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0) return row;
    const acres = effectiveFieldAcres(row.acres, boundaryAcres.get(id));
    if (acres == null || acres === row.acres) return row;
    return { ...row, acres };
  });
}

export function effectiveFieldAcresOrZero(
  storedAcres: number | null | undefined,
  boundaryAcres: number | null | undefined,
): number {
  return effectiveFieldAcres(storedAcres, boundaryAcres) ?? 0;
}

/** Acres from GeoJSON polygon/multipolygon (EPSG:4326 lonlat), matching migration math. */
export function acresFromBoundaryGeometry(geometry: unknown): number | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const g = geometry as { type?: string; coordinates?: unknown };
  const polys: unknown[] =
    g.type === 'Polygon'
      ? [g.coordinates]
      : g.type === 'MultiPolygon' && Array.isArray(g.coordinates)
        ? g.coordinates
        : [];
  if (!polys.length) return null;

  let totalM2 = 0;
  for (const poly of polys) {
    if (!Array.isArray(poly) || !Array.isArray(poly[0])) continue;
    const ring = poly[0] as unknown[];
    if (ring.length < 4) continue;
    const points: [number, number][] = [];
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      points.push([lat, lng]);
    }
    if (points.length < 3) continue;
    totalM2 += polygonArea(points);
  }
  if (!(totalM2 > 0)) return null;
  return Math.round(sqMetersToAcres(totalM2) * 100) / 100;
}

async function boundaryAcresColumnExists(): Promise<boolean> {
  const rows = await query<{ ok: unknown }>(
    `SELECT 1 AS ok
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'field_boundaries'
        AND column_name = 'acres'
      LIMIT 1`,
  );
  return rows.length > 0;
}

/**
 * Map of field_id → boundary acres.
 * Single source of truth after migration: read field_boundaries.acres only.
 * Before the column exists (current Netlify preview / unmigrated DB): compute
 * from GeoJSON in TypeScript so office/installer acres still work. Grower
 * views cannot expose boundary acres until the migration is applied.
 */
export async function loadBoundaryAcresByFieldId(): Promise<Map<number, number>> {
  const map = new Map<number, number>();

  if (await boundaryAcresColumnExists()) {
    const rows = await query<{ field_id: unknown; acres: unknown }>(
      `SELECT field_id, acres
         FROM public.field_boundaries
        WHERE acres IS NOT NULL`,
    );
    for (const row of rows) {
      const id = Number(row.field_id);
      const acres = Number(row.acres);
      if (Number.isSafeInteger(id) && id > 0 && Number.isFinite(acres)) {
        map.set(id, acres);
      }
    }
    return map;
  }

  // Pre-migration preview only — not used once field_boundaries.acres exists.
  const rows = await query<{ field_id: unknown; geometry: unknown }>(
    `SELECT field_id, geometry
       FROM public.field_boundaries
      WHERE geometry IS NOT NULL`,
  );
  for (const row of rows) {
    const id = Number(row.field_id);
    const acres = acresFromBoundaryGeometry(row.geometry);
    if (Number.isSafeInteger(id) && id > 0 && acres != null) {
      map.set(id, acres);
    }
  }
  return map;
}
