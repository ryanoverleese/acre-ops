import L from 'leaflet';
import * as Lerc from 'lerc';
import {
  colorScaleForTile,
  elevationColorIndex,
  fieldReliefMeters,
  rangeFromSamples,
  type ElevRange,
} from './color-scale';
import {
  elevationRequestPath,
  elevationsInsideField,
  type LngLatRing,
} from './elevation-request';
import { clamp255, ELEVATION_LUT } from './ramp';

const TILE = 256;
const N = TILE + 2; // 1px halo for slope neighbors
/** Fixed grid for the field sample. Independent of the map zoom. */
const FIELD_SAMPLE = 96;
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

/** Tile zoom is the integer GridLayer uses. Fractional map zoom only scales these tiles. */
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

function exportUrl(bbox: number[], width: number, height: number): string {
  const box = bbox.map((v) => v.toFixed(3)).join(',');
  const query = 'f=image&format=lerc&pixelType=F32&bboxSR=3857&imageSR=3857'
    + `&bbox=${box}&size=${width},${height}&interpolation=RSP_BilinearInterpolation`;
  return `${elevationRequestPath(bbox, width, height)}?${query}`;
}

function boundsIdentity(bounds: L.LatLngBounds | null, rings: LngLatRing[] | null): string {
  const box = bounds && bounds.isValid() ? bounds.toBBoxString() : '';
  const ringKey = (rings ?? [])
    .map((ring) => ring.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';'))
    .join('|');
  return `${box}#${ringKey}`;
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
  _dead?: boolean;
  _abort?: AbortController | null;
};

export type ElevGridOptions = {
  mode: ElevRenderMode;
  opacity: number;
  pane: string;
  /** Whole-field elevation min/max. Tiles never substitute their own. */
  range?: Range;
  /** Boundary envelope. One fixed sample of this box is the color scale for every tile. */
  fieldBounds?: L.LatLngBounds | null;
  /** [lng, lat] rings. Samples outside these rings do not affect the color scale. */
  fieldRings?: LngLatRing[] | null;
  /**
   * Display hook. Called with the same field scale passed to colorScaleForTile.
   * Does not change sampling, coloring, or the elevation request.
   */
  onFieldScale?: (range: Range | null) => void;
  /** True max−min of the clipped field sample, in meters. Display only. */
  onFieldRelief?: (meters: number | null) => void;
};

function renderCanvas(tile: ElevTile, mode: ElevRenderMode, fieldScale: Range | null) {
  const elev = tile._elev;
  const cell = tile._cell;
  if (!elev || !cell) return;
  const scale = mode === 'shade' ? null : (fieldScale ? colorScaleForTile(null, fieldScale) : null);
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

export function createElevGridLayer(options: ElevGridOptions): L.GridLayer & {
  setElevMode: (mode: ElevRenderMode) => void;
  setFieldBounds: (bounds: L.LatLngBounds | null, rings?: LngLatRing[] | null) => void;
  rerender: () => void;
} {
  const owned = new Set<ElevTile>();
  const state = {
    mode: options.mode,
    fieldScale: options.range && options.range.hi > options.range.lo ? options.range : null as Range | null,
    fieldBounds: options.fieldBounds ?? null,
    fieldRings: options.fieldRings ?? null,
    boundsKey: '',
    fieldAbort: null as AbortController | null,
    fieldGen: 0,
    onFieldScale: options.onFieldScale,
    onFieldRelief: options.onFieldRelief,
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
      owned.clear();
      L.GridLayer.prototype.onRemove.call(this, map);
    },
    _removeTile(key: string) {
      const tiles = (this as unknown as { _tiles: Record<string, { el: ElevTile }> })._tiles || {};
      const el = tiles[key]?.el;
      if (el) {
        el._dead = true;
        el._abort?.abort();
        owned.delete(el);
      }
      (L.GridLayer.prototype as unknown as { _removeTile(this: unknown, key: string): void })._removeTile.call(this, key);
    },
    // Leaflet's _tiles map drops canvases during zoom animation. This set is
    // every canvas we still own, so a late field scale repaints all of them.
    _paintLoaded() {
      for (const el of owned) {
        if (el._dead || !el._elev) continue;
        renderCanvas(el, state.mode, state.fieldScale);
      }
    },
    _loadFieldScale() {
      const bounds = state.fieldBounds;
      state.boundsKey = boundsIdentity(bounds, state.fieldRings);
      state.fieldAbort?.abort();
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      state.fieldAbort = ac;
      const gen = ++state.fieldGen;
      if (!bounds || !bounds.isValid()) return;

      const bbox = latLngBoundsTo3857(bounds);
      const url = exportUrl(bbox, FIELD_SAMPLE, FIELD_SAMPLE);

      ensureLerc()
        .then(() => fetch(url, { signal: ac?.signal }))
        .then((r) => {
          if (!r.ok) throw new Error(`elev ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          if (gen !== state.fieldGen) return;
          state.fieldAbort = null;
          const d = Lerc.decode(buf);
          if (d.width !== FIELD_SAMPLE || d.height !== FIELD_SAMPLE) throw new Error('field sample size');
          const z = d.pixels[0];
          const mask = d.mask;
          const elev = new Float32Array(d.width * d.height);
          for (let p = 0; p < elev.length; p++) {
            const v = z[p];
            elev[p] = (mask && !mask[p]) || !(v > 0 && v < 9000) ? NaN : v;
          }
          let values = elevationsInsideField(elev, d.width, d.height, bbox, state.fieldRings);
          if (values.length < 8) {
            values = elevationsInsideField(elev, d.width, d.height, bbox, null);
          }
          const sample = rangeFromSamples(values);
          if (!sample) return;
          // One scale for every tile at every zoom. Tile min/max is never used.
          state.fieldScale = colorScaleForTile(null, sample);
          state.onFieldScale?.(state.fieldScale);
          state.onFieldRelief?.(fieldReliefMeters(values));
          this._paintLoaded();
        })
        .catch((err) => {
          if (gen !== state.fieldGen) return;
          state.fieldAbort = null;
          if (err?.name === 'AbortError') return;
          // Leave the previous field scale in place. Do not color from a tile.
        });
    },
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement('canvas') as ElevTile;
      tile.width = TILE;
      tile.height = TILE;
      owned.add(tile);
      const bb = tileBBox(coords);
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      tile._abort = ac;

      const url = exportUrl(bb.bbox, N, N);

      ensureLerc()
        .then(() => fetch(url, { signal: ac?.signal }))
        .then((r) => {
          if (!r.ok) throw new Error(`elev ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          tile._abort = null;
          if (tile._dead) return;
          const d = Lerc.decode(buf);
          if (d.width !== N || d.height !== N) throw new Error('size');
          const z = d.pixels[0];
          const mask = d.mask;
          const elev = new Float32Array(N * N);
          for (let p = 0; p < N * N; p++) {
            const v = z[p];
            elev[p] = (mask && !mask[p]) || !(v > 0 && v < 9000) ? NaN : v;
          }
          tile._elev = elev;
          tile._cell = bb.cell;
          // Same field scale at every zoom. A tile never stretches its own min/max.
          if (state.fieldScale) renderCanvas(tile, state.mode, state.fieldScale);
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
    setFieldBounds(bounds: L.LatLngBounds | null, rings?: LngLatRing[] | null) {
      const nextRings = rings === undefined ? state.fieldRings : rings;
      const key = boundsIdentity(bounds, nextRings);
      if (key === state.boundsKey && state.fieldScale) return;
      state.fieldBounds = bounds;
      state.fieldRings = nextRings;
      // Keep the current scale until the new sample arrives so a zoom
      // cannot clear it and leave tiles to invent their own.
      this._loadFieldScale();
    },
    rerender() {
      this._paintLoaded();
    },
  });

  return new Layer() as L.GridLayer & {
    setElevMode: (mode: ElevRenderMode) => void;
    setFieldBounds: (bounds: L.LatLngBounds | null, rings?: LngLatRing[] | null) => void;
    rerender: () => void;
  };
}

/** Convert meters ↔ feet helpers for range display. */
export function metersToFeet(m: number) { return m / FT; }
export function feetToMeters(ft: number) { return ft * FT; }
