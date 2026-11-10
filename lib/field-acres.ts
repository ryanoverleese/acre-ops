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

/** Map of field_id → boundary acres (column when present, else geometry). */
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

  // Migration not applied yet: compute from GeoJSON so previews keep working.
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
