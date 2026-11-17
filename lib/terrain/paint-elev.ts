/**
 * Leaflet-free elevation tile painter.
 * Every tile uses the same color stretch / spread map and the same hillshade
 * parameters. A 1-px halo on the elevation grid supplies slope neighbors so
 * shared edges match. Z-factor is continuous in latitude (not a per-tile
 * center), which is what used to show up as a faint checkerboard.
 */
import {
  colorScaleForTile,
  elevationColorIndex,
  elevationColorIndexSpread,
  type ElevRange,
  type SpreadMap,
} from './color-scale';
import { clamp255, ELEVATION_LUT } from './ramp';

export const TILE = 256;
export const TILE_HALO = 1;
export const ELEV_GRID = TILE + TILE_HALO * 2;

/** CutSheetRX "field" relief preset — strong relief for flat Nebraska ground. */
export const FIELD_RELIEF = {
  exag: 12,
  az: 315,
  alt: 35,
  shadow: 75,
  bright: 105,
  soft: false,
};

const WORLD = 40075016.68557849;

export function mercatorPixelMeters(z: number, latRad: number): number {
  const px = WORLD / Math.pow(2, z) / TILE;
  return px * Math.cos(latRad);
}

/** Latitude (radians) of a visible pixel row in a Web Mercator tile. */
export function tileRowLatRad(z: number, tileY: number, row: number): number {
  const n = Math.pow(2, z);
  const y = (tileY + (row + 0.5) / TILE) / n;
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
}

export function sunVectors() {
  const { az, alt, soft } = FIELD_RELIEF;
  const list = soft
    ? [[az, 0.4], [az - 60, 0.2], [az + 60, 0.2], [az + 180, 0.2]] as const
    : [[az, 1] as const];
  const altR = alt * Math.PI / 180;
  return list.map(([a, w]) => {
    const azR = a * Math.PI / 180;
    return {
      x: Math.cos(altR) * Math.sin(azR),
      y: Math.cos(altR) * Math.cos(azR),
      z: Math.sin(altR),
      w,
    };
  });
}

/**
 * Multiplicative hillshade for the color ramp.
 * Gentle plateau slopes sit near shade=1; a high gamma spreads those
 * small departures so texture reads on the high red. The floor stays
 * high enough that crimson never collapses to near-black.
 */
export const RELIEF_SHADE_GAMMA = 10;
export const RELIEF_LIGHT_FLOOR = 0.62;

export function reliefLight(shade: number): number {
  const s = shade < 0 ? 0 : shade > 1 ? 1 : shade;
  const shaped = Math.pow(s, RELIEF_SHADE_GAMMA);
  return RELIEF_LIGHT_FLOOR + (1 - RELIEF_LIGHT_FLOOR) * shaped;
}

function val(elev: Float32Array, i: number, fallback: number) {
  const v = elev[i];
  return v === v ? v : fallback;
}

export type ElevPaintMode = 'colorshade' | 'color' | 'shade';

export type PaintElevOptions = {
  mode: ElevPaintMode;
  fieldScale: ElevRange | null;
  spreadMap?: SpreadMap | null;
  z: number;
  tileY: number;
};

export function colorIndexForElev(
  meters: number,
  fieldScale: ElevRange,
  spreadMap?: SpreadMap | null,
): number {
  if (spreadMap) return elevationColorIndexSpread(meters, spreadMap);
  return elevationColorIndex(meters, fieldScale);
}

/**
 * Paint one 256×256 RGBA tile from a (256+2)×(256+2) elevation grid (meters).
 * `fieldScale` / `spreadMap` must be the same object for every tile in view.
 */
export function paintElevationTile(
  out: Uint8ClampedArray,
  elev: Float32Array,
  opts: PaintElevOptions,
): void {
  const { mode, fieldScale, z, tileY } = opts;
  const spreadMap = opts.spreadMap ?? null;
  const scale = mode === 'shade' ? null : (fieldScale ? colorScaleForTile(null, fieldScale) : null);
  if (mode !== 'shade' && !scale) return;
  const suns = sunVectors();
  let flat = 0;
  for (const s of suns) flat += s.w * s.z;
  const ambient = 1 - FIELD_RELIEF.shadow / 100;
  const bright = FIELD_RELIEF.bright / 100;
  const n = ELEV_GRID;

  for (let y = 0; y < TILE; y++) {
    const cell = mercatorPixelMeters(z, tileRowLatRad(z, tileY, y));
    const zf = FIELD_RELIEF.exag / (8 * cell);
    for (let x = 0; x < TILE; x++) {
      const ci = (y + 1) * n + (x + 1);
      const o = (y * TILE + x) * 4;
      const e = elev[ci];
      if (!(e > -500 && e < 9000)) {
        out[o] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
        out[o + 3] = 0;
        continue;
      }
      const A = val(elev, ci - n - 1, e), B = val(elev, ci - n, e), C = val(elev, ci - n + 1, e);
      const D = val(elev, ci - 1, e), F = val(elev, ci + 1, e);
      const G = val(elev, ci + n - 1, e), H = val(elev, ci + n, e), I = val(elev, ci + n + 1, e);
      const gx = (C + 2 * F + I) - (A + 2 * D + G);
      const gy = (A + 2 * B + C) - (G + 2 * H + I);

      let r: number, g: number, b: number;
      if (mode === 'color') {
        const ti = colorIndexForElev(e, scale!, spreadMap) * 3;
        r = ELEVATION_LUT[ti];
        g = ELEVATION_LUT[ti + 1];
        b = ELEVATION_LUT[ti + 2];
      } else {
        const nx = -gx * zf, ny = -gy * zf;
        const len = Math.sqrt(nx * nx + ny * ny + 1);
        let lit = 0;
        for (const L0 of suns) {
          const d = (nx * L0.x + ny * L0.y + L0.z) / len;
          lit += L0.w * (d > 0 ? d : 0);
        }
        if (mode === 'shade') {
          const shade = lit / flat * 0.82;
          const light = (ambient + (1 - ambient) * shade) * bright;
          const v = Math.max(70, Math.min(225, light * 225));
          r = g = b = v;
        } else {
          const shade = lit / flat;
          const light = reliefLight(shade);
          const ti = colorIndexForElev(e, scale!, spreadMap) * 3;
          r = clamp255(ELEVATION_LUT[ti] * light);
          g = clamp255(ELEVATION_LUT[ti + 1] * light);
          b = clamp255(ELEVATION_LUT[ti + 2] * light);
        }
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
}
