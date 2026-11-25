import type { LngLatRing } from './elevation-request';
import { mercatorToLngLat } from './elevation-request';
import { METERS_TO_FEET } from './color-scale';
import { lngLatToMercator } from './sample-elev';

/** Halo drawn when "Show outside field" is on. Not shown in the UI. */
export const OUTSIDE_FIELD_BUFFER_FT = 200;
export const OUTSIDE_FIELD_BUFFER_M = OUTSIDE_FIELD_BUFFER_FT / METERS_TO_FEET;

const MITER_LIMIT = 4;

function closed(ring: LngLatRing): LngLatRing {
  if (ring.length < 2) return ring.slice();
  const [fLng, fLat] = ring[0];
  const [lLng, lLat] = ring[ring.length - 1];
  if (fLng === lLng && fLat === lLat) return ring.slice(0, -1);
  return ring.slice();
}

function signedArea(pts: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return area / 2;
}

function unitNormal(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ccw: boolean,
): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  return ccw ? [dy / len, -dx / len] : [-dy / len, dx / len];
}

/** Offset one ring outward by meters in Web Mercator. */
export function bufferRing(ring: LngLatRing, meters: number): LngLatRing {
  const pts = closed(ring).filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (pts.length < 3 || !(meters > 0)) return ring.slice();
  const merc = pts.map(([lng, lat]) => lngLatToMercator(lng, lat));
  const ccw = signedArea(merc) > 0;
  const n = merc.length;
  const out: LngLatRing = [];
  for (let i = 0; i < n; i++) {
    const prev = merc[(i - 1 + n) % n];
    const cur = merc[i];
    const next = merc[(i + 1) % n];
    const n1 = unitNormal(prev[0], prev[1], cur[0], cur[1], ccw);
    const n2 = unitNormal(cur[0], cur[1], next[0], next[1], ccw);
    let mx = n1[0] + n2[0];
    let my = n1[1] + n2[1];
    const len = Math.hypot(mx, my);
    if (len < 1e-9) {
      mx = n2[0];
      my = n2[1];
    } else {
      mx /= len;
      my /= len;
    }
    const miter = Math.min(MITER_LIMIT, 1 / Math.max(0.25, n1[0] * mx + n1[1] * my));
    const [lng, lat] = mercatorToLngLat(cur[0] + mx * meters * miter, cur[1] + my * meters * miter);
    out.push([lng, lat]);
  }
  if (out.length) out.push(out[0]);
  return out;
}

export function bufferRings(rings: LngLatRing[], meters: number): LngLatRing[] {
  return rings.map((ring) => bufferRing(ring, meters)).filter((ring) => ring.length >= 4);
}

function isLngLatRing(coords: unknown): coords is LngLatRing {
  if (!Array.isArray(coords) || coords.length === 0) return false;
  const first = coords[0];
  return Array.isArray(first) && typeof first[0] === 'number';
}

/** Buffer Polygon or MultiPolygon coordinates, leaving other shapes unchanged. */
export function bufferCoordinates(coords: unknown, meters: number): unknown {
  if (!Array.isArray(coords) || coords.length === 0) return coords;
  if (isLngLatRing(coords)) return bufferRing(coords, meters);
  return coords.map((part) => bufferCoordinates(part, meters));
}

export type BufferableCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: string; coordinates: unknown };
    [key: string]: unknown;
  }>;
};

export function bufferCollection<T extends BufferableCollection>(data: T, meters: number): T {
  return {
    ...data,
    features: data.features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: bufferCoordinates(feature.geometry.coordinates, meters),
      },
    })),
  };
}

export type ElevPinId = 'A' | 'B';
export type ElevPinPairLike<T> = { a: T | null; b: T | null };

/** Drop one pin. If A is removed and B remains, B is relabeled as A. */
export function removeElevPin<T>(prev: ElevPinPairLike<T>, id: ElevPinId): ElevPinPairLike<T> {
  if (id === 'A') {
    if (prev.b) return { a: prev.b, b: null };
    return { a: null, b: null };
  }
  return { a: prev.a, b: null };
}
