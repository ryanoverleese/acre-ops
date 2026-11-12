import { pointInRings, type LngLatRing } from './elevation-request';

/**
 * Pixel size of a field map around zoom 16 (about 2 m on the ground).
 * The 3DEP ImageServer mosaic changes which DEM is on top as the pixel
 * size changes. This is the size these field maps use when the field fills
 * the screen, so the legend names that DEM.
 */
export const FIELD_VIEW_PIXEL_M = 2;

export type DemFootprint = {
  name: string;
  /** ImageServer mosaic sort. Lower wins. Null Best values are ignored. */
  best: number | null;
  lowPs: number | null;
  maxPs: number | null;
};

export type DemSource = {
  project: string | null;
  workunit: string | null;
  /** collect_end epoch milliseconds from the 3DEP elevation index. */
  collectEndMs: number | null;
  method: string | null;
};

/**
 * Footprint the default 3DEP mosaic draws at this pixel size.
 * A raster is eligible when its native resolution is fine enough (LowPS)
 * and it is still used at this scale (MaxPS). The lowest Best value wins.
 *
 * Checked with ImageServer getSamples and LockRaster:
 * Boston North at 2 m is 677.451 m, which matches only NE_SouthernNE_2018_D19,
 * not the coarser seamless tile or the 2009 project that also cover the point.
 * Denver at 2 m matches CO_DRCOG_2020_B20, not the finer 2014 South Platte
 * project that overlaps it (that project has a higher Best value).
 */
export function selectFootprint(
  rows: DemFootprint[],
  pixelM: number = FIELD_VIEW_PIXEL_M,
): DemFootprint | null {
  const eligible = rows.filter((row) => {
    if (!row.name || row.name.startsWith('Ov_')) return false;
    if (row.best == null || !Number.isFinite(row.best)) return false;
    if (row.lowPs == null || row.maxPs == null) return false;
    return row.lowPs <= pixelM && pixelM <= row.maxPs;
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => a.best! - b.best! || a.name.localeCompare(b.name));
  return eligible[0];
}

function sameName(left: string | null, right: string): boolean {
  const value = (left || '').trim().toLowerCase();
  return value.length > 0 && value === right;
}

/** Index row for the rendered footprint. Project or workunit must equal the raster name. */
export function matchSource(foot: DemFootprint, sources: DemSource[]): DemSource | null {
  const name = foot.name.trim().toLowerCase();
  if (!name) return null;
  const hits = sources.filter((row) => sameName(row.project, name) || sameName(row.workunit, name));
  if (!hits.length) return null;
  hits.sort((a, b) => (b.collectEndMs ?? 0) - (a.collectEndMs ?? 0));
  return hits[0];
}

/** Short line. Year is the UTC year of collect_end, not the year in the project name. */
export function formatLidarSource(source: DemSource): string | null {
  if (source.collectEndMs == null || !Number.isFinite(source.collectEndMs)) return null;
  const year = new Date(source.collectEndMs).getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  const method = (source.method || '').toLowerCase();
  const kind = !method || method.includes('lidar') ? 'Lidar' : 'DEM';
  return `${kind} ${year} (USGS)`;
}

export function lidarLabel(
  footprints: DemFootprint[],
  sources: DemSource[],
  pixelM: number = FIELD_VIEW_PIXEL_M,
): string | null {
  const foot = selectFootprint(footprints, pixelM);
  if (!foot) {
    if (sources.length === 1) return formatLidarSource(sources[0]);
    return null;
  }
  const source = matchSource(foot, sources);
  return source ? formatLidarSource(source) : null;
}

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function footprintsFromImageServer(body: unknown): DemFootprint[] {
  const features = featuresOf(body);
  const out: DemFootprint[] = [];
  for (const feature of features) {
    const name = text(feature.Name);
    if (!name) continue;
    out.push({
      name,
      best: finite(feature.Best),
      lowPs: finite(feature.LowPS),
      maxPs: finite(feature.MaxPS),
    });
  }
  return out;
}

export function sourcesFromIndex(body: unknown): DemSource[] {
  const features = featuresOf(body);
  return features.map((feature) => ({
    project: text(feature.project),
    workunit: text(feature.workunit),
    collectEndMs: finite(feature.collect_end),
    method: text(feature.p_method),
  }));
}

function featuresOf(body: unknown): Array<Record<string, unknown>> {
  if (!body || typeof body !== 'object') return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue;
    const attributes = (feature as { attributes?: unknown }).attributes;
    if (attributes && typeof attributes === 'object') out.push(attributes as Record<string, unknown>);
  }
  return out;
}

function collectRings(coords: unknown, out: LngLatRing[]): void {
  if (!Array.isArray(coords) || coords.length === 0) return;
  const first = coords[0];
  if (Array.isArray(first) && typeof first[0] === 'number') {
    const ring: LngLatRing = [];
    for (const pair of coords) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) ring.push([lng, lat]);
    }
    if (ring.length >= 3) out.push(ring);
    return;
  }
  for (const part of coords) collectRings(part, out);
}

/** A point inside the field outline, or the field pin when the outline is missing. */
export function fieldInteriorPoint(
  geometries: unknown[] | null | undefined,
  fallbackLat: number | null,
  fallbackLng: number | null,
): { lat: number; lng: number } | null {
  const rings: LngLatRing[] = [];
  for (const geometry of geometries || []) collectRings(geometry, rings);
  let best: { lat: number; lng: number } | null = null;
  let bestCount = 0;
  for (const ring of rings) {
    let sumLng = 0;
    let sumLat = 0;
    for (const [lng, lat] of ring) {
      sumLng += lng;
      sumLat += lat;
    }
    const lng = sumLng / ring.length;
    const lat = sumLat / ring.length;
    const inside = pointInRings(lng, lat, [ring]);
    const point = inside ? { lat, lng } : { lat: ring[0][1], lng: ring[0][0] };
    if (ring.length >= bestCount) {
      best = point;
      bestCount = ring.length;
    }
  }
  if (best) return best;
  if (
    fallbackLat != null && fallbackLng != null
    && Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)
    && !(fallbackLat === 0 && fallbackLng === 0)
  ) {
    return { lat: fallbackLat, lng: fallbackLng };
  }
  return null;
}

/** Path segment. Four decimal degrees is about 11 m, inside one lidar project. */
export function lidarPointKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function lidarRequestPath(lat: number, lng: number): string {
  return `/api/usgs-lidar/${encodeURIComponent(lidarPointKey(lat, lng))}`;
}

export function parseLidarPoint(point: string): { lat: number; lng: number } | null {
  let decoded = point;
  try {
    decoded = decodeURIComponent(point);
  } catch {
    return null;
  }
  const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(decoded.trim());
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
