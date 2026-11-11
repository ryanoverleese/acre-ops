import L from 'leaflet';
import * as Lerc from 'lerc';
import {
  colorScaleForTile,
  elevationColorIndex,
  rangeFromSamples,
  type ElevRange,
} from './color-scale';
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

type Range = ElevRange;

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

function latLngBoundsTo3857(b: L.LatLngBounds): [number, number, number, number] {
  const sw = L.CRS.EPSG3857.project(b.getSouthWest());
  const ne = L.CRS.EPSG3857.project(b.getNorthEast());
  return [sw.x, sw.y, ne.x, ne.y];
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
  _sample?: Range | null;
  _abort?: AbortController | null;
};

export type ElevGridOptions = {
  mode: ElevRenderMode;
  opacity: number;
  pane: string;
  /** Whole-field elevation min/max. Tiles never substitute their own. */
  range?: Range;
  /** Boundary envelope. One sample of this box is the color scale for every tile. */
  fieldBounds?: L.LatLngBounds | null;
};

function renderCanvas(tile: ElevTile, mode: ElevRenderMode, fieldScale: Range | null) {
  const elev = tile._elev;
  const cell = tile._cell;
  if (!elev || !cell) return;
  const scale = mode === 'shade' ? null : (fieldScale ? colorScaleForTile(tile._sample ?? null, fieldScale) : null);
  if (mode !== 'shade' && !scale) return;
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
        const ti = elevationColorIndex(e, scale!) * 3;
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
          const ti = elevationColorIndex(e, scale!) * 3;
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

function interiorRange(elev: Float32Array): Range | null {
  const vals = new Float32Array((N - 2) * (N - 2));
  let p = 0;
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) vals[p++] = elev[y * N + x];
  }
  return rangeFromSamples(vals);
}

export function createElevGridLayer(options: ElevGridOptions): L.GridLayer & {
  setElevMode: (mode: ElevRenderMode) => void;
  setFieldBounds: (bounds: L.LatLngBounds | null) => void;
  rerender: () => void;
} {
  const state = {
    mode: options.mode,
    fieldScale: null as Range | null,
    fieldBounds: options.fieldBounds ?? null,
    boundsKey: '',
    fieldAbort: null as AbortController | null,
    fieldGen: 0,
    fieldFailed: false,
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
    onAdd(map: L.Map) {
      L.GridLayer.prototype.onAdd.call(this, map);
      this._loadFieldScale();
    },
    onRemove(map: L.Map) {
      state.fieldAbort?.abort();
      state.fieldAbort = null;
      L.GridLayer.prototype.onRemove.call(this, map);
    },
    _loadedTiles(): ElevTile[] {
      const tiles = (this as unknown as { _tiles: Record<string, { el: ElevTile }> })._tiles || {};
      const out: ElevTile[] = [];
      for (const key of Object.keys(tiles)) {
        const el = tiles[key]?.el;
        if (el?._elev) out.push(el);
      }
      return out;
    },
    _paintLoaded() {
      for (const el of this._loadedTiles()) renderCanvas(el, state.mode, state.fieldScale);
    },
    // One scale for every loaded tile. Used only when the field sample failed,
    // and every tile is repainted together so they cannot diverge.
    _adoptSharedFallback() {
      let lo = Infinity;
      let hi = -Infinity;
      let n = 0;
      for (const el of this._loadedTiles()) {
        const sample = el._sample;
        if (!sample) continue;
        if (sample.lo < lo) lo = sample.lo;
        if (sample.hi > hi) hi = sample.hi;
        n++;
      }
      if (!n || !(hi > lo)) return;
      state.fieldScale = colorScaleForTile(null, { lo, hi });
      this._paintLoaded();
    },
    _loadFieldScale() {
      const bounds = state.fieldBounds;
      state.boundsKey = bounds && bounds.isValid() ? bounds.toBBoxString() : '';
      state.fieldAbort?.abort();
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      state.fieldAbort = ac;
      const gen = ++state.fieldGen;
      if (!bounds || !bounds.isValid()) {
        state.fieldFailed = true;
        this._adoptSharedFallback();
        return;
      }
      state.fieldFailed = false;

      const bbox = latLngBoundsTo3857(bounds);
      const url = `${ELEV_PROXY}/exportImage?f=image&format=lerc&pixelType=F32&bboxSR=3857&imageSR=3857`
        + `&bbox=${bbox.map((v) => v.toFixed(3)).join(',')}`
        + `&size=96,96&interpolation=RSP_BilinearInterpolation`;

      ensureLerc()
        .then(() => fetch(url, { signal: ac?.signal, cache: 'force-cache' }))
        .then((r) => {
          if (!r.ok) throw new Error(`elev ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          if (gen !== state.fieldGen) return;
          state.fieldAbort = null;
          const d = Lerc.decode(buf);
          const z = d.pixels[0];
          const mask = d.mask;
          const elev = new Float32Array(d.width * d.height);
          for (let p = 0; p < elev.length; p++) {
            const v = z[p];
            elev[p] = (mask && !mask[p]) || !(v > -500 && v < 9000) ? NaN : v;
          }
          const sample = rangeFromSamples(elev);
          if (!sample) {
            state.fieldFailed = true;
            this._adoptSharedFallback();
            return;
          }
          state.fieldFailed = false;
          state.fieldScale = colorScaleForTile(null, sample);
          this._paintLoaded();
        })
        .catch((err) => {
          if (gen !== state.fieldGen) return;
          state.fieldAbort = null;
          if (err?.name === 'AbortError') return;
          state.fieldFailed = true;
          this._adoptSharedFallback();
        });
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
          tile._sample = interiorRange(elev);
          // Color waits for one shared scale. Painting with tile._sample here
          // is what drew the straight bands.
          if (state.fieldScale) renderCanvas(tile, state.mode, state.fieldScale);
          else if (state.fieldFailed) this._adoptSharedFallback();
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
    setFieldBounds(bounds: L.LatLngBounds | null) {
      const key = bounds && bounds.isValid() ? bounds.toBBoxString() : '';
      if (key === state.boundsKey) return;
      state.fieldBounds = bounds;
      state.fieldScale = null;
      this._loadFieldScale();
    },
    rerender() {
      this._paintLoaded();
    },
  });

  return new Layer() as L.GridLayer & {
    setElevMode: (mode: ElevRenderMode) => void;
    setFieldBounds: (bounds: L.LatLngBounds | null) => void;
    rerender: () => void;
  };
}

/** Convert meters ↔ feet helpers for range display. */
export function metersToFeet(m: number) { return m / FT; }
export function feetToMeters(ft: number) { return ft * FT; }
