import L from 'leaflet';
import * as Lerc from 'lerc';
import { clamp255, ELEVATION_LUT } from './ramp';

const ELEV_PROXY = '/api/usgs-elevation';
const TILE = 256;
const N = TILE + 2; // 1px halo for slope neighbors
const FT = 0.3048;

export type ElevRenderMode = 'colorshade' | 'color' | 'shade';

/** CutSheetRX "field" relief preset — strong relief for flat Nebraska ground. */
const FIELD_RELIEF = {
  exag: 6,
  az: 315,
  alt: 35,
  shadow: 75,
  bright: 105,
  soft: false,
};

type Range = { lo: number; hi: number };

function tileBBox(coords: L.Coords) {
  const world = 40075016.68557849;
  const size = world / Math.pow(2, coords.z);
  const px = size / TILE;
  const minX = -world / 2 + coords.x * size - px;
  const maxX = minX + size + 2 * px;
  const maxY = world / 2 - coords.y * size + px;
  const minY = maxY - size - 2 * px;
  const latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (coords.y + 0.5) / Math.pow(2, coords.z))));
  return { bbox: [minX, minY, maxX, maxY] as [number, number, number, number], cell: px * Math.cos(latC) };
}

function val(elev: Float32Array, i: number, fallback: number) {
  const v = elev[i];
  return v === v ? v : fallback;
}

function sunVectors() {
  const { az, alt, soft } = FIELD_RELIEF;
  const list = soft
    ? [[az, 0.4], [az - 60, 0.2], [az + 60, 0.2], [az + 180, 0.2]] as const
    : [[az, 1]] as const;
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

let lercReady: Promise<void> | null = null;
function ensureLerc() {
  if (!lercReady) {
    lercReady = Lerc.load({
      locateFile: (name) => (name.endsWith('.wasm') ? '/lerc-wasm.wasm' : name),
    });
  }
  return lercReady;
}

type ElevTile = HTMLCanvasElement & {
  _elev?: Float32Array;
  _cell?: number;
  _abort?: AbortController | null;
};

export type ElevGridOptions = {
  mode: ElevRenderMode;
  opacity: number;
  pane: string;
  /** Shared elevation stretch (meters). Updated as tiles load. */
  range: Range;
  onRangeSample?: (lo: number, hi: number) => void;
};

function renderCanvas(tile: ElevTile, mode: ElevRenderMode, range: Range) {
  const elev = tile._elev;
  const cell = tile._cell;
  if (!elev || !cell) return;
  const ctx = tile.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(TILE, TILE);
  const out = img.data;
  const suns = sunVectors();
  const zf = FIELD_RELIEF.exag / (8 * cell);
  const ambient = 1 - FIELD_RELIEF.shadow / 100;
  const bright = FIELD_RELIEF.bright / 100;
  let flat = 0;
  for (const s of suns) flat += s.w * s.z;
  const lo = range.lo;
  const span = Math.max(range.hi - range.lo, 1);

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const ci = (y + 1) * N + (x + 1);
      const o = (y * TILE + x) * 4;
      const e = elev[ci];
      if (!(e > -500 && e < 9000)) {
        out[o + 3] = 0;
        continue;
      }
      const A = val(elev, ci - N - 1, e), B = val(elev, ci - N, e), C = val(elev, ci - N + 1, e);
      const D = val(elev, ci - 1, e), F = val(elev, ci + 1, e);
      const G = val(elev, ci + N - 1, e), H = val(elev, ci + N, e), I = val(elev, ci + N + 1, e);
      const gx = (C + 2 * F + I) - (A + 2 * D + G);
      const gy = (A + 2 * B + C) - (G + 2 * H + I);

      let r: number, g: number, b: number;
      if (mode === 'color') {
        const ti = clamp255(((e - lo) / span) * 255) * 3;
        r = ELEVATION_LUT[ti]; g = ELEVATION_LUT[ti + 1]; b = ELEVATION_LUT[ti + 2];
      } else {
        const nx = -gx * zf, ny = -gy * zf;
        const len = Math.sqrt(nx * nx + ny * ny + 1);
        let lit = 0;
        for (const L0 of suns) {
          const d = (nx * L0.x + ny * L0.y + L0.z) / len;
          lit += L0.w * (d > 0 ? d : 0);
        }
        const shade = lit / flat * 0.82;
        const light = (ambient + (1 - ambient) * shade) * bright;
        if (mode === 'shade') {
          const v = clamp255(light * 225);
          r = g = b = v;
        } else {
          const ti = clamp255(((e - lo) / span) * 255) * 3;
          r = clamp255(ELEVATION_LUT[ti] * light);
          g = clamp255(ELEVATION_LUT[ti + 1] * light);
          b = clamp255(ELEVATION_LUT[ti + 2] * light);
        }
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function sampleRange(elev: Float32Array): { lo: number; hi: number } | null {
  let lo = Infinity, hi = -Infinity, n = 0;
  // Sample interior (skip 1px halo)
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const v = elev[y * N + x];
      if (v > -500 && v < 9000) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        n++;
      }
    }
  }
  return n ? { lo, hi } : null;
}

export function createElevGridLayer(options: ElevGridOptions): L.GridLayer & {
  setElevMode: (mode: ElevRenderMode) => void;
  setElevRange: (range: Range) => void;
  rerender: () => void;
} {
  const state = {
    mode: options.mode,
    range: { ...options.range },
    onRangeSample: options.onRangeSample,
  };

  const Layer = L.GridLayer.extend({
    options: {
      pane: options.pane,
      opacity: options.opacity,
      tileSize: TILE,
      maxZoom: 20,
      keepBuffer: 2,
      attribution: 'Elevation: USGS 3DEP',
    },
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement('canvas') as ElevTile;
      tile.width = TILE;
      tile.height = TILE;
      const bb = tileBBox(coords);
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      tile._abort = ac;

      const url = `${ELEV_PROXY}/exportImage?f=image&format=lerc&pixelType=F32&bboxSR=3857&imageSR=3857`
        + `&bbox=${bb.bbox.map((v) => v.toFixed(3)).join(',')}`
        + `&size=${N},${N}&interpolation=RSP_BilinearInterpolation`;

      ensureLerc()
        .then(() => fetch(url, { signal: ac?.signal, cache: 'force-cache' }))
        .then((r) => {
          if (!r.ok) throw new Error(`elev ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          tile._abort = null;
          const d = Lerc.decode(buf);
          if (d.width !== N || d.height !== N) throw new Error('size');
          const z = d.pixels[0];
          const mask = d.mask;
          const elev = new Float32Array(N * N);
          for (let p = 0; p < N * N; p++) {
            const v = z[p];
            elev[p] = (mask && !mask[p]) || !(v > -500 && v < 9000) ? NaN : v;
          }
          tile._elev = elev;
          tile._cell = bb.cell;
          const sample = sampleRange(elev);
          if (sample) state.onRangeSample?.(sample.lo, sample.hi);
          renderCanvas(tile, state.mode, state.range);
          done(undefined, tile);
        })
        .catch((err) => {
          tile._abort = null;
          if (err?.name === 'AbortError') return;
          done(undefined, tile);
        });

      return tile;
    },
    setElevMode(mode: ElevRenderMode) {
      state.mode = mode;
      this.rerender();
    },
    setElevRange(range: Range) {
      state.range = { ...range };
      this.rerender();
    },
    rerender() {
      // Re-paint loaded canvases without refetch
      const tiles = (this as unknown as { _tiles: Record<string, { el: ElevTile }> })._tiles || {};
      for (const key of Object.keys(tiles)) {
        const el = tiles[key]?.el;
        if (el?._elev) renderCanvas(el, state.mode, state.range);
      }
    },
  });

  return new Layer() as L.GridLayer & {
    setElevMode: (mode: ElevRenderMode) => void;
    setElevRange: (range: Range) => void;
    rerender: () => void;
  };
}

/** Convert meters ↔ feet helpers for range display. */
export function metersToFeet(m: number) { return m / FT; }
export function feetToMeters(ft: number) { return ft * FT; }
