/** Same Google hybrid tiles the field map uses. */
export const FIELD_THUMB_TILE = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

export type LngLat = [number, number];

export function collectThumbRings(coords: unknown, out: LngLat[][] = []): LngLat[][] {
  if (!Array.isArray(coords) || coords.length === 0) return out;
  const first = coords[0];
  if (Array.isArray(first) && typeof first[0] === 'number' && typeof first[1] === 'number') {
    const ring: LngLat[] = [];
    for (const pair of coords) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) ring.push([lng, lat]);
    }
    if (ring.length >= 3) out.push(ring);
    return out;
  }
  for (const part of coords) collectThumbRings(part, out);
  return out;
}

function world(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const clamped = Math.max(-85, Math.min(85, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export type ThumbTile = { url: string; left: number; top: number; size: number };

export type ThumbLayout = {
  zoom: number;
  tiles: ThumbTile[];
  path: string;
};

/**
 * Square cover of the boundary. The long side fits in size−8 px (about 4 px
 * of pad), then the window is the full square so the chip has no empty bars.
 */
export function layoutFieldThumb(rings: LngLat[][], size: number): ThumbLayout | null {
  if (!rings.length || size < 16) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  if (!Number.isFinite(west) || east - west < 1e-8 || north - south < 1e-8) return null;

  const target = size - 8;
  let zoom = 2;
  for (let z = 19; z >= 2; z--) {
    const nw = world(west, north, z);
    const se = world(east, south, z);
    if (Math.max(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y)) <= target) {
      zoom = z;
      break;
    }
  }

  const nw = world(west, north, zoom);
  const se = world(east, south, zoom);
  const originX = (nw.x + se.x) / 2 - size / 2;
  const originY = (nw.y + se.y) / 2 - size / 2;
  const x0 = Math.floor(originX / 256);
  const y0 = Math.floor(originY / 256);
  const x1 = Math.floor((originX + size - 0.01) / 256);
  const y1 = Math.floor((originY + size - 0.01) / 256);
  const tiles: ThumbTile[] = [];
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      tiles.push({
        url: FIELD_THUMB_TILE.replace('{x}', String(tx)).replace('{y}', String(ty)).replace('{z}', String(zoom)),
        left: tx * 256 - originX,
        top: ty * 256 - originY,
        size: 256,
      });
    }
  }
  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const pts = ring.map(([lng, lat]) => {
      const point = world(lng, lat, zoom);
      return `${(point.x - originX).toFixed(2)} ${(point.y - originY).toFixed(2)}`;
    });
    parts.push(`M${pts[0]}L${pts.slice(1).join('L')}Z`);
  }
  if (!tiles.length || !parts.length) return null;
  return { zoom, tiles, path: parts.join('') };
}
