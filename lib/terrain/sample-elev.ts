/**
 * Sample a USGS 3DEP LERC grid at a lon/lat.
 *
 * The ImageServer returns Float32 bare-earth elevations in meters.
 * getSamples on this service reports VerticalDatum
 * "North American Vertical Datum of 1988 (NAVD 88)" for the
 * Southern Nebraska 1 m lidar these field maps draw at ~2 m.
 * Row 0 is north, matching ArcGIS exportImage and elevationsInsideField.
 */
import { METERS_TO_FEET } from './color-scale';

const R = 6378137;
const EARTH_M = 6371000;

export type ElevGridSample = {
  elev: Float32Array;
  width: number;
  height: number;
  /** Web Mercator (EPSG:3857) minX, minY, maxX, maxY. */
  bbox: [number, number, number, number];
};

export type ElevPoint = { lat: number; lng: number; meters: number | null };

/** WGS84 degrees to Web Mercator meters. */
export function lngLatToMercator(lng: number, lat: number): [number, number] {
  const x = (lng * Math.PI / 180) * R;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * R;
  return [x, y];
}

function at(
  elev: Float32Array,
  width: number,
  height: number,
  row: number,
  col: number,
): number {
  if (row < 0 || col < 0 || row >= height || col >= width) return Number.NaN;
  return elev[row * width + col];
}

function usable(value: number): boolean {
  return value > 0 && value < 9000;
}

/**
 * Bilinear sample of a 3DEP grid, in meters. Null when the point is
 * outside the raster or the neighborhood is no-data.
 */
export function sampleElevFromGrid(
  grid: ElevGridSample,
  lat: number,
  lng: number,
): number | null {
  const [x, y] = lngLatToMercator(lng, lat);
  const [minX, minY, maxX, maxY] = grid.bbox;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (!(spanX > 0 && spanY > 0)) return null;
  if (x < minX || x > maxX || y < minY || y > maxY) return null;
  const col = ((x - minX) / spanX) * grid.width - 0.5;
  const row = ((maxY - y) / spanY) * grid.height - 0.5;
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const tx = col - c0;
  const ty = row - r0;
  const v00 = at(grid.elev, grid.width, grid.height, r0, c0);
  const v10 = at(grid.elev, grid.width, grid.height, r0, c0 + 1);
  const v01 = at(grid.elev, grid.width, grid.height, r0 + 1, c0);
  const v11 = at(grid.elev, grid.width, grid.height, r0 + 1, c0 + 1);
  const w00 = usable(v00) ? (1 - tx) * (1 - ty) : 0;
  const w10 = usable(v10) ? tx * (1 - ty) : 0;
  const w01 = usable(v01) ? (1 - tx) * ty : 0;
  const w11 = usable(v11) ? tx * ty : 0;
  const w = w00 + w10 + w01 + w11;
  if (!(w > 0)) return null;
  // Weights for out-of-bounds / no-data corners are 0, but NaN * 0 is NaN.
  const sum = (w00 ? v00 * w00 : 0) + (w10 ? v10 * w10 : 0)
    + (w01 ? v01 * w01 : 0) + (w11 ? v11 * w11 : 0);
  return sum / w;
}

export function formatPointFeet(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  return `${(meters * METERS_TO_FEET).toFixed(1)} ft`;
}

export function formatPinDiff(aMeters: number, bMeters: number): string {
  if (!Number.isFinite(aMeters) || !Number.isFinite(bMeters)) return '';
  const feet = (bMeters - aMeters) * METERS_TO_FEET;
  const abs = Math.abs(feet);
  if (abs < 0.05) return 'B is even with A';
  const dir = feet < 0 ? 'lower' : 'higher';
  return `B is ${abs.toFixed(1)} ft ${dir} than A`;
}

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDistanceFeet(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  const feet = meters * METERS_TO_FEET;
  if (feet < 10) return `${feet.toFixed(1)} ft`;
  return `${Math.round(feet)} ft`;
}

export function formatPinStrip(a: ElevPoint, b: ElevPoint | null): string {
  if (b && a.meters != null && b.meters != null) {
    const diff = formatPinDiff(a.meters, b.meters);
    const dist = formatDistanceFeet(haversineMeters(a.lat, a.lng, b.lat, b.lng));
    if (diff && dist) return `${diff} · ${dist}`;
    return diff || dist;
  }
  if (a.meters != null) {
    const elev = formatPointFeet(a.meters);
    return elev ? `A ${elev}` : '';
  }
  return '';
}
