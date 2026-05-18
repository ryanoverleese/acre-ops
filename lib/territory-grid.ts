// Territory grid centered on Olsen Cattle (home base)
//
// Columns:  1E, 2E, 3E... east of center  |  1W, 2W, 3W... west of center
// Lat bands: FN | N | M | S | FS  (north → south)
// Zone names: M1E, N2W, FS3E, etc.
//
// Column width  ≈ 15 miles  → 0.2834° longitude at 40°N
// Band heights:
//   M   = within ~15 miles of center lat  (±0.2174°)
//   N/S = 15–40 miles out                 (±0.5072°)
//   FN/FS = beyond 40 miles

export const CENTER_LAT = 40.593236;  // Olsen Cattle latitude
export const CENTER_LNG = -99.028968; // Olsen Cattle longitude — western edge of M1E

export const COL_WIDTH  = 0.2834;  // ~15 mi longitude step at 40°N

// Latitude band thresholds (absolute degrees from CENTER_LAT)
const M_LIMIT  = 0.2174;  // ~15 mi
const NS_LIMIT = 0.5072;  // ~35 mi  (M_LIMIT + ~20 mi more)
// beyond NS_LIMIT → FN or FS

export type LatBand = 'FN' | 'N' | 'M' | 'S' | 'FS';

export interface ZoneId {
  band: LatBand;
  col: number;   // positive = east, negative = west  (1-indexed magnitude)
  name: string;  // e.g. "M1E", "N2W"
}

function latBand(lat: number): LatBand {
  const d = lat - CENTER_LAT;
  const abs = Math.abs(d);
  const north = d >= 0;
  if (abs <= M_LIMIT)  return 'M';
  if (abs <= NS_LIMIT) return north ? 'N' : 'S';
  return north ? 'FN' : 'FS';
}

function colIndex(lng: number): number {
  // Returns signed 1-based index: +1 = first column east, -1 = first column west
  const offset = lng - CENTER_LNG;
  const idx = Math.floor(offset / COL_WIDTH); // 0-based: 0 = first east col, -1 = first west col
  return idx >= 0 ? idx + 1 : idx; // shift so east starts at +1
}

function colLabel(col: number): string {
  return col >= 0 ? `${col}E` : `${-col}W`;
}

export function zoneOf(lat: number, lng: number): ZoneId {
  const band = latBand(lat);
  const col  = colIndex(lng);
  return { band, col, name: `${band}${colLabel(col)}` };
}

export function zoneBounds(band: LatBand, col: number): [[number, number], [number, number]] {
  // Latitude bounds
  let latSouth: number, latNorth: number;
  switch (band) {
    case 'M':
      latSouth = CENTER_LAT - M_LIMIT;
      latNorth = CENTER_LAT + M_LIMIT;
      break;
    case 'N':
      latSouth = CENTER_LAT + M_LIMIT;
      latNorth = CENTER_LAT + NS_LIMIT;
      break;
    case 'S':
      latSouth = CENTER_LAT - NS_LIMIT;
      latNorth = CENTER_LAT - M_LIMIT;
      break;
    case 'FN':
      latSouth = CENTER_LAT + NS_LIMIT;
      latNorth = CENTER_LAT + NS_LIMIT + (NS_LIMIT - M_LIMIT) * 2; // same height as N band, extended
      break;
    case 'FS':
      latNorth = CENTER_LAT - NS_LIMIT;
      latSouth = CENTER_LAT - NS_LIMIT - (NS_LIMIT - M_LIMIT) * 2;
      break;
  }

  // Longitude bounds (col is 1-based signed)
  const lngWest = col >= 0
    ? CENTER_LNG + (col - 1) * COL_WIDTH
    : CENTER_LNG + col * COL_WIDTH;        // col is negative
  const lngEast = lngWest + COL_WIDTH;

  return [[latSouth!, lngWest], [latNorth!, lngEast]];
}

export function zoneCenter(band: LatBand, col: number): [number, number] {
  const [[s, w], [n, e]] = zoneBounds(band, col);
  return [(s + n) / 2, (w + e) / 2];
}

// Band display order for sorting (north → south)
const BAND_ORDER: Record<LatBand, number> = { FN: 0, N: 1, M: 2, S: 3, FS: 4 };
export function bandOrder(band: LatBand): number {
  return BAND_ORDER[band];
}
