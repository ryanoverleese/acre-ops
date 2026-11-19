/**
 * Wide-view Soils (zoomed out, about 10 to 30 miles across).
 * Pure helpers: tile keys on a 0.1° grid, soil family names, and fixed series colors.
 * The detailed view (zoom 14 and closer) still uses ssurgo.ts and /api/soil-map.
 */
import type { SoilBbox } from './ssurgo';

/** Wide tiles are 0.1° squares (about 5 x 7 miles here), keyed by their SW corner. */
export const WIDE_STEP = 0.1;
/** Show wide soils from this zoom up to the detailed zoom. z11 is about 15 to 50 miles across. */
export const WIDE_MIN_ZOOM = 11;
/** Cap on tiles for one view; a 1400 px wide screen at z12 needs about 20. */
export const WIDE_MAX_TILES = 36;
/** Server-side line simplification, degrees (about 30 m, one screen pixel at z12). */
export const WIDE_SIMPLIFY_DEG = 0.0003;

const STEPS_PER_DEG = Math.round(1 / WIDE_STEP);

/** "w,s" with one decimal, e.g. "-99.2,40.4". */
export function wideTileKey(w10: number, s10: number): string {
  return `${(w10 / STEPS_PER_DEG).toFixed(1)},${(s10 / STEPS_PER_DEG).toFixed(1)}`;
}

/** Parse "w,s" into the 0.1° box it names. Null when malformed or off the globe. */
export function parseWideTileKey(key: string): SoilBbox | null {
  if (!/^-?\d{1,3}\.\d,-?\d{1,2}\.\d$/.test(key)) return null;
  const [w, s] = key.split(',').map(Number);
  if (!(w >= -180 && w + WIDE_STEP <= 180 + 1e-9 && s >= -90 && s + WIDE_STEP <= 90 + 1e-9)) return null;
  const r = (v: number) => Math.round(v * STEPS_PER_DEG) / STEPS_PER_DEG;
  return { w: r(w), s: r(s), e: r(w + WIDE_STEP), n: r(s + WIDE_STEP) };
}

/** Wide tile keys covering a view, or null when it needs more than maxTiles. */
export function wideTileKeysForView(box: SoilBbox, maxTiles = WIDE_MAX_TILES): string[] | null {
  if (![box.w, box.s, box.e, box.n].every(Number.isFinite)) return null;
  if (!(box.w < box.e && box.s < box.n)) return null;
  const w = Math.floor(box.w * STEPS_PER_DEG + 1e-9);
  const s = Math.floor(box.s * STEPS_PER_DEG + 1e-9);
  const e = Math.ceil(box.e * STEPS_PER_DEG - 1e-9);
  const n = Math.ceil(box.n * STEPS_PER_DEG - 1e-9);
  if ((e - w) * (n - s) > maxTiles) return null;
  const keys: string[] = [];
  for (let y = s; y < n; y++) {
    for (let x = w; x < e; x++) {
      const key = wideTileKey(x, y);
      if (!parseWideTileKey(key)) return null;
      keys.push(key);
    }
  }
  return keys;
}

/** "Holdrege silt loam, 1 to 3 percent slopes" -> "Holdrege silt loam". */
export function soilFamilyName(muname: string): string {
  const head = (muname || '').split(',')[0].trim();
  return head || 'Unnamed map unit';
}

/** First series in the name: "Coly-Kenesaw silt loams" -> "Coly", "Kenesaw and Coly ..." -> "Kenesaw". */
export function soilSeriesName(muname: string): string {
  const family = soilFamilyName(muname);
  if (/water/i.test(family)) return 'Water';
  return family.split(/[\s-]+/)[0] || family;
}

/**
 * Fixed colors for series common in south-central Nebraska, so a soil keeps its color
 * as the map pans. Neighbors that often touch (Holdrege, Coly, Kenesaw, Butler) are far apart.
 */
const SERIES_COLORS: Record<string, string> = {
  Holdrege: '#E0A93B',
  Butler: '#8A63B8',
  Detroit: '#3F9A5B',
  Coly: '#D2603F',
  Kenesaw: '#F1D46B',
  Rusco: '#C77BA8',
  Scott: '#4F7FC0',
  Fillmore: '#79A9D6',
  Massie: '#3A5FA0',
  Hersh: '#C49A6C',
  Hord: '#9BC25A',
  Valentine: '#EADBB0',
  Hobbs: '#5FB3A0',
  Uly: '#B5563A',
  Hastings: '#A8B85E',
  Crete: '#9C7147',
  Hall: '#6E9A44',
  Wood: '#D88FB8',
  Gibbon: '#86C3B6',
  Anselmo: '#D9B98A',
  Libory: '#E3CC9E',
  Ord: '#93A7D4',
  Alda: '#7FC08A',
  Platte: '#B9B2A4',
  Inavale: '#E8C27A',
  Kennebec: '#6BAED6',
  Nuckolls: '#C98F5A',
  Water: '#2C5E8C',
};
const FALLBACK_COLORS = ['#B07AA1', '#76B7B2', '#EDC948', '#59A14F', '#E15759', '#9C755F', '#FF9DA7', '#4E79A7', '#F28E2B', '#BAB0AC'];

export function soilSeriesColor(muname: string): string {
  const series = soilSeriesName(muname);
  const fixed = SERIES_COLORS[series];
  if (fixed) return fixed;
  let h = 0;
  for (let i = 0; i < series.length; i++) h = (h * 31 + series.charCodeAt(i)) | 0;
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}
