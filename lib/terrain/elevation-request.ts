/**
 * USGS exportImage requests.
 *
 * Netlify's cache key for this route does not include the query string.
 * `Netlify-Vary` only varies on `__nextDataReq` and `_rsc`, so a public
 * Cache-Control response aliases every bbox and size onto one raster.
 * The bbox and pixel size are path segments so each request is its own URL
 * even if a shared cache ignores the query string.
 */

export function elevationRequestPath(bbox: number[], width: number, height: number): string {
  const box = bbox.map((v) => v.toFixed(3)).join(',');
  return `/api/usgs-elevation/exportImage/${encodeURIComponent(box)}/${width}x${height}`;
}

/** Path segments forwarded to the ImageServer. The cache-key suffix is dropped. */
export function usgsImageSuffix(parts: string[] | undefined): string {
  const all = parts ?? [];
  const exportAt = all.indexOf('exportImage');
  const upstream = exportAt >= 0 ? all.slice(0, exportAt + 1) : all;
  return upstream.map((part) => encodeURIComponent(part)).join('/');
}

const R = 6378137;

/** Web mercator meters to WGS84 degrees. */
export function mercatorToLngLat(x: number, y: number): [number, number] {
  const lng = (x / R) * (180 / Math.PI);
  const lat = (Math.atan(Math.sinh(y / R)) * 180) / Math.PI;
  return [lng, lat];
}

export type LngLatRing = Array<[number, number]>;

/** Even-odd point in polygon across exterior rings and holes. */
export function pointInRings(lng: number, lat: number, rings: LngLatRing[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Elevations whose pixel centers lie inside the field.
 * Row 0 is north, matching ArcGIS exportImage. Pass null rings to keep the
 * whole raster (the boundary envelope).
 */
export function elevationsInsideField(
  elev: ArrayLike<number>,
  width: number,
  height: number,
  bbox: [number, number, number, number],
  rings: LngLatRing[] | null,
): number[] {
  const [minX, minY, maxX, maxY] = bbox;
  const out: number[] = [];
  const clip = !!rings?.length;
  for (let row = 0; row < height; row++) {
    const y = maxY - ((row + 0.5) / height) * (maxY - minY);
    for (let col = 0; col < width; col++) {
      if (clip) {
        const x = minX + ((col + 0.5) / width) * (maxX - minX);
        const [lng, lat] = mercatorToLngLat(x, y);
        if (!pointInRings(lng, lat, rings!)) continue;
      }
      out.push(elev[row * width + col]);
    }
  }
  return out;
}
