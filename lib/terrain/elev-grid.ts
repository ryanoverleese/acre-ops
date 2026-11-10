import L from 'leaflet';
import * as Lerc from 'lerc';
import { clamp255, ELEVATION_LUT } from './ramp';

const ELEV_PROXY = '/api/usgs-elevation';
const FT = 0.3048;
const MAX_DIM = 1536;
const MIN_DIM = 256;

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

function latLngBoundsTo3857(b: L.LatLngBounds): [number, number, number, number] {
  const sw = L.CRS.EPSG3857.project(b.getSouthWest());
  const ne = L.CRS.EPSG3857.project(b.getNorthEast());
  return [sw.x, sw.y, ne.x, ne.y];
}

function sampleRange(elev: Float32Array, cols: number, rows: number): Range | null {
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  // Skip 1px halo
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const v = elev[y * cols + x];
      if (v > -500 && v < 9000) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        n++;
      }
    }
  }
  return n ? { lo, hi } : null;
}

/**
 * Wide blur of interior elevation. Color uses elevation minus this surface so a
 * field-wide slope (or a DEM tile step) does not paint one half blue and the
 * other red. Gray shade does not use this — it is slope-only.
 */
function localRelief(elev: Float32Array, cols: number, rows: number): { residual: Float32Array; lo: number; span: number } {
  const w = cols - 2;
  const h = rows - 2;
  const src = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = elev[(y + 1) * cols + (x + 1)];
      src[y * w + x] = v === v ? v : 0;
    }
  }
  const radius = Math.max(28, Math.round(Math.min(w, h) * 0.22));
  const pw = w + 1;
  const prefix = new Float32Array(pw * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += src[(y - 1) * w + (x - 1)];
      prefix[y * pw + x] = prefix[(y - 1) * pw + x] + row;
    }
  }
  const residual = new Float32Array(w * h);
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4000)));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const sum = prefix[(y1 + 1) * pw + (x1 + 1)]
        - prefix[y0 * pw + (x1 + 1)]
        - prefix[(y1 + 1) * pw + x0]
        + prefix[y0 * pw + x0];
      const n = (y1 - y0 + 1) * (x1 - x0 + 1);
      const rel = src[y * w + x] - sum / n;
      residual[y * w + x] = rel;
      if ((x % step) === 0 && (y % step) === 0) sample.push(rel);
    }
  }
  sample.sort((a, b) => a - b);
  const pick = (p: number) => sample[Math.min(sample.length - 1, Math.max(0, Math.floor(p * (sample.length - 1))))] ?? 0;
  const lo = pick(0.08);
  const hi = pick(0.92);
  return { residual, lo, span: Math.max(hi - lo, 0.25) };
}

/** Paint DEM into a canvas. elev is (w+2)×(h+2) with a 1px halo. */
function renderElevCanvas(
  canvas: HTMLCanvasElement,
  elev: Float32Array,
  w: number,
  h: number,
  cell: number,
  mode: ElevRenderMode,
  range: Range,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const cols = w + 2;
  const img = ctx.createImageData(w, h);
  const out = img.data;
  const suns = sunVectors();
  const zf = FIELD_RELIEF.exag / (8 * cell);
  const ambient = 1 - FIELD_RELIEF.shadow / 100;
  const bright = FIELD_RELIEF.bright / 100;
  let flat = 0;
  for (const s of suns) flat += s.w * s.z;
  // Absolute min/max stretch turned a 1–2 m field slope into a hard
  // blue|red split. Color tracks local relief instead. Shade stays slope-only.
  const relief = mode === 'shade' ? null : localRelief(elev, cols, h + 2);
  const lo = relief ? relief.lo : range.lo;
  const span = relief ? relief.span : Math.max(range.hi - range.lo, 0.5);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ci = (y + 1) * cols + (x + 1);
      const o = (y * w + x) * 4;
      const e = elev[ci];
      if (!(e > -500 && e < 9000)) {
        out[o + 3] = 0;
        continue;
      }
      const A = val(elev, ci - cols - 1, e);
      const B = val(elev, ci - cols, e);
      const C = val(elev, ci - cols + 1, e);
      const D = val(elev, ci - 1, e);
      const F = val(elev, ci + 1, e);
      const G = val(elev, ci + cols - 1, e);
      const H = val(elev, ci + cols, e);
      const I = val(elev, ci + cols + 1, e);
      const gx = (C + 2 * F + I) - (A + 2 * D + G);
      const gy = (A + 2 * B + C) - (G + 2 * H + I);

      let r: number;
      let g: number;
      let b: number;
      const reliefE = relief ? relief.residual[y * w + x] : e;
      if (mode === 'color') {
        const ti = clamp255(((reliefE - lo) / span) * 255) * 3;
        r = ELEVATION_LUT[ti];
        g = ELEVATION_LUT[ti + 1];
        b = ELEVATION_LUT[ti + 2];
      } else {
        const nx = -gx * zf;
        const ny = -gy * zf;
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
          const ti = clamp255(((reliefE - lo) / span) * 255) * 3;
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
  ctx.putImageData(img, 0, 0);
}

export type ElevGridOptions = {
  mode: ElevRenderMode;
  opacity: number;
  pane: string;
  range: Range;
  onRangeSample?: (lo: number, hi: number) => void;
};

type ElevImageLayer = L.Layer & {
  setElevMode: (mode: ElevRenderMode) => void;
  setElevRange: (range: Range) => void;
  setOpacity: (opacity: number) => ElevImageLayer;
  rerender: () => void;
};

/**
 * One DEM image for the current map view — no Leaflet tile grid.
 * Color + shade used to split abruptly at 256px tile edges because each tile
 * got its own DEM sample (and previously its own color stretch). A single
 * exportImage covers the viewport with one continuous elevation field.
 */
export function createElevGridLayer(options: ElevGridOptions): ElevImageLayer {
  const state = {
    mode: options.mode,
    opacity: options.opacity,
    pane: options.pane,
    range: { ...options.range },
    onRangeSample: options.onRangeSample,
    elev: null as Float32Array | null,
    cols: 0,
    rows: 0,
    cell: 1,
    bounds: null as L.LatLngBounds | null,
    overlay: null as L.ImageOverlay | null,
    canvas: document.createElement('canvas'),
    abort: null as AbortController | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    gen: 0,
  };

  const Layer = L.Layer.extend({
    onAdd(map: L.Map) {
      this._map = map;
      const refresh = () => this._scheduleFetch();
      map.on('moveend zoomend', refresh);
      this._onView = refresh;
      this._scheduleFetch();
    },
    onRemove(map: L.Map) {
      if (this._onView) map.off('moveend zoomend', this._onView);
      this._onView = null;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.abort?.abort();
      state.abort = null;
      if (state.overlay) {
        map.removeLayer(state.overlay);
        state.overlay = null;
      }
      this._map = null;
    },
    setOpacity(opacity: number) {
      state.opacity = opacity;
      state.overlay?.setOpacity(opacity);
      return this as ElevImageLayer;
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
      if (!state.elev || !state.bounds || !this._map) return;
      const sharedOk = Number.isFinite(state.range.lo)
        && Number.isFinite(state.range.hi)
        && state.range.hi > state.range.lo;
      const stretch = sharedOk
        ? state.range
        : (sampleRange(state.elev, state.cols, state.rows) ?? { lo: 0, hi: 1 });
      const w = state.cols - 2;
      const h = state.rows - 2;
      renderElevCanvas(state.canvas, state.elev, w, h, state.cell, state.mode, stretch);
      const url = state.canvas.toDataURL('image/png');
      if (state.overlay) {
        state.overlay.setUrl(url);
        state.overlay.setBounds(state.bounds);
        state.overlay.setOpacity(state.opacity);
      } else {
        state.overlay = L.imageOverlay(url, state.bounds, {
          opacity: state.opacity,
          pane: state.pane,
          interactive: false,
          className: 'acre-elev-image',
        });
        state.overlay.addTo(this._map);
      }
    },
    _scheduleFetch() {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.timer = null;
        this._fetchView();
      }, 120);
    },
    _fetchView() {
      const map = this._map as L.Map | null;
      if (!map) return;
      const size = map.getSize();
      if (size.x < 8 || size.y < 8) return;

      // Pad slightly so pan doesn't immediately expose empty edges.
      const pad = map.containerPointToLatLng([ -24, -24 ]);
      const pad2 = map.containerPointToLatLng([ size.x + 24, size.y + 24 ]);
      const view = L.latLngBounds(pad, pad2);
      const bbox = latLngBoundsTo3857(view);
      const [minX, minY, maxX, maxY] = bbox;
      const widthM = Math.max(maxX - minX, 1);
      const heightM = Math.max(maxY - minY, 1);

      let w = Math.round(size.x * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1));
      let h = Math.round(size.y * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1));
      w = Math.max(MIN_DIM, Math.min(MAX_DIM, w));
      h = Math.max(MIN_DIM, Math.min(MAX_DIM, h));
      // Keep geographic aspect so pixels are square-ish in 3857.
      const aspect = widthM / heightM;
      if (w / h > aspect) w = Math.max(MIN_DIM, Math.round(h * aspect));
      else h = Math.max(MIN_DIM, Math.round(w / aspect));

      const halo = 1;
      const reqW = w + halo * 2;
      const reqH = h + halo * 2;
      const px = widthM / w;
      const py = heightM / h;
      const fetchBbox = [
        minX - px * halo,
        minY - py * halo,
        maxX + px * halo,
        maxY + py * halo,
      ];
      const latC = view.getCenter().lat * Math.PI / 180;
      const cell = ((px + py) / 2) * Math.cos(latC);

      state.abort?.abort();
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      state.abort = ac;
      const gen = ++state.gen;

      const url = `${ELEV_PROXY}/exportImage?f=image&format=lerc&pixelType=F32&bboxSR=3857&imageSR=3857`
        + `&bbox=${fetchBbox.map((v) => v.toFixed(3)).join(',')}`
        + `&size=${reqW},${reqH}&interpolation=RSP_BilinearInterpolation`;

      ensureLerc()
        .then(() => fetch(url, { signal: ac?.signal, cache: 'force-cache' }))
        .then((r) => {
          if (!r.ok) throw new Error(`elev ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          if (gen !== state.gen || !this._map) return;
          state.abort = null;
          const d = Lerc.decode(buf);
          if (d.width !== reqW || d.height !== reqH) throw new Error('size');
          const z = d.pixels[0];
          const mask = d.mask;
          const elev = new Float32Array(reqW * reqH);
          for (let p = 0; p < elev.length; p++) {
            const v = z[p];
            elev[p] = (mask && !mask[p]) || !(v > -500 && v < 9000) ? NaN : v;
          }
          state.elev = elev;
          state.cols = reqW;
          state.rows = reqH;
          state.cell = cell;
          state.bounds = view;
          const sample = sampleRange(elev, reqW, reqH);
          if (sample) {
            state.range = sample;
            state.onRangeSample?.(sample.lo, sample.hi);
          }
          this.rerender();
        })
        .catch((err) => {
          if (gen !== state.gen) return;
          state.abort = null;
          if (err?.name === 'AbortError') return;
        });
    },
  });

  return new Layer() as ElevImageLayer;
}

/** Convert meters ↔ feet helpers for range display. */
export function metersToFeet(m: number) { return m / FT; }
export function feetToMeters(ft: number) { return ft * FT; }
