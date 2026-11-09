/** Client-safe helpers for hand-drawn / editable field boundaries. */

export type LatLng = [number, number]; // [lat, lng]

export type RingGeometry = {
  type: string;
  coordinates?: unknown;
};

/** Exterior ring of the first polygon, without the closing duplicate. */
export function exteriorRing(geometry: RingGeometry | null | undefined): LatLng[] | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const coords = geometry.coordinates;
  let ring: unknown = null;
  if (geometry.type === 'Polygon' && Array.isArray(coords)) ring = coords[0];
  else if (geometry.type === 'MultiPolygon' && Array.isArray(coords)) {
    const poly = coords[0];
    ring = Array.isArray(poly) ? poly[0] : null;
  }
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const pts: LatLng[] = [];
  for (const pos of ring) {
    if (!Array.isArray(pos) || typeof pos[0] !== 'number' || typeof pos[1] !== 'number') continue;
    pts.push([pos[1], pos[0]]);
  }
  if (pts.length < 4) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) pts.pop();
  return pts.length >= 3 ? pts : null;
}

export function isComplexBoundary(geometry: RingGeometry | null | undefined): boolean {
  if (!geometry) return false;
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 1) return true;
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    if (geometry.coordinates.length > 1) return true;
    const first = geometry.coordinates[0];
    return Array.isArray(first) && first.length > 1;
  }
  return false;
}

export function ringToPolygon(points: LatLng[]): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (points.length < 3) return null;
  const ring = points.map(([lat, lng]) => [lng, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function midpoints(points: LatLng[]): Array<{ index: number; at: LatLng }> {
  if (points.length < 2) return [];
  const out: Array<{ index: number; at: LatLng }> = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push({ index: i + 1, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  }
  return out;
}
