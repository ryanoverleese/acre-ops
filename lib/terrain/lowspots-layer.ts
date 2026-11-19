import L from 'leaflet';
import * as Lerc from 'lerc';
import { ensureLerc, exportUrl } from './elev-grid';
import {
  analyzeLowSpots,
  arrowsAlongPolyline,
  extractLowSpots,
  optionsFromSliders,
  DEFAULT_LOWSPOTS_SLIDERS,
  type FlowLine,
  type LowSpotsAnalysis,
  type LowSpotsResult,
  type LowSpotsSliders,
} from './lowspots';

export { DEFAULT_LOWSPOTS_SLIDERS, LOWSPOTS_SLIDER_DEFAULT, LOWSPOTS_SLIDER_MAX, LOWSPOTS_SLIDER_MIN } from './lowspots';
export type { LowSpotsAnalysis, LowSpotsSliders };

/** Above Elevation (350) and Soils (390), below labels (395) and fields (399). */
export const LOWSPOTS_PANE = 'acre-lowspots';
export const LOWSPOTS_PANE_Z = '393';
/** Longest side of the DEM request, in pixels. 1024² computes in about 0.3 s. */
export const LOWSPOTS_MAX_PX = 1024;
/** Ponds use this depth for the darkest blue, meters (2 ft). */
const DEEP_M = 0.6096;
const LINE_COLOR = '#1d5fbf';
/** Screen-space gap between drainage-path chevrons, in CSS pixels. */
const ARROW_SPACING_PX = 36;
const ARROW_SIZE_PX = 7;
const ARROW_SIZE_MAJOR_PX = 9;

export type LowSpotsStatus = 'off' | 'zoom' | 'loading' | 'ready' | 'nodata' | 'error';

export function ensureLowSpotsPane(map: L.Map) {
  let pane = map.getPane(LOWSPOTS_PANE);
  if (!pane) {
    pane = map.createPane(LOWSPOTS_PANE);
    pane.style.zIndex = LOWSPOTS_PANE_Z;
  }
  // Display only. Field and probe taps must go through.
  pane.style.pointerEvents = 'none';
}

type Box3857 = [number, number, number, number];

export type LowSpotsGrid = {
  elev: Float32Array;
  width: number;
  height: number;
  cellM: number;
  bbox: Box3857;
  validCells: number;
};

/** 3DEP bare-earth DEM for a lat/lng box, sized to about 1 m cells up to LOWSPOTS_MAX_PX. */
export async function fetchLowSpotsGrid(bounds: L.LatLngBounds, signal?: AbortSignal): Promise<LowSpotsGrid> {
  const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
  const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
  const bbox: Box3857 = [sw.x, sw.y, ne.x, ne.y];
  const spanX = bbox[2] - bbox[0];
  const spanY = bbox[3] - bbox[1];
  if (!(spanX > 0 && spanY > 0)) throw new Error('lowspots: empty box');
  const k = Math.cos((bounds.getCenter().lat * Math.PI) / 180); // mercator → ground
  // Ground cell: 1 m when the box is small, coarser so the long side fits.
  const cellM = Math.max(1, (Math.max(spanX, spanY) * k) / LOWSPOTS_MAX_PX);
  const width = Math.max(16, Math.min(LOWSPOTS_MAX_PX, Math.round((spanX * k) / cellM)));
  const height = Math.max(16, Math.min(LOWSPOTS_MAX_PX, Math.round((spanY * k) / cellM)));

  await ensureLerc();
  const res = await fetch(exportUrl(bbox, width, height), { signal });
  if (!res.ok) throw new Error(`lowspots: elevation ${res.status}`);
  const d = Lerc.decode(await res.arrayBuffer());
  if (d.width !== width || d.height !== height) throw new Error('lowspots: size');
  const z = d.pixels[0];
  const mask = d.mask;
  const elev = new Float32Array(width * height);
  let validCells = 0;
  for (let p = 0; p < elev.length; p++) {
    const v = z[p];
    const ok = !(mask && !mask[p]) && v > 0 && v < 9000;
    elev[p] = ok ? v : NaN;
    if (ok) validCells++;
  }
  const realCell = ((spanX / width + spanY / height) / 2) * k;
  return { elev, width, height, cellM: realCell, bbox, validCells };
}

function depthColor(t: number): [number, number, number] {
  // #cfe3f7 → #5b9bd5 → #08306b
  const a = [207, 227, 247];
  const b = [91, 155, 213];
  const c = [8, 48, 107];
  const lerp = (p: number[], q: number[], s: number) =>
    [0, 1, 2].map((i) => Math.round(p[i] + (q[i] - p[i]) * s)) as [number, number, number];
  return t < 0.5 ? lerp(a, b, t / 0.5) : lerp(b, c, (t - 0.5) / 0.5);
}

function resultFromSliders(analysis: LowSpotsAnalysis, sliders: LowSpotsSliders): LowSpotsResult {
  return extractLowSpots(
    analysis,
    optionsFromSliders(sliders.lowSpots, sliders.drainage, analysis.cellM),
  );
}

/**
 * Flow lines and downhill chevrons, redrawn in screen space so arrow
 * spacing stays even at every zoom. pts on each line are upstream-first,
 * so the stroke direction is downhill.
 */
const FlowPathsLayer = L.Layer.extend({
  initialize(this: any, lines: FlowLine[], toLatLng: (c: number, r: number) => L.LatLng, flowAreaM2: number) {
    this._lines = lines;
    this._toLatLng = toLatLng;
    this._flowAreaM2 = flowAreaM2;
  },
  onAdd(this: any, map: L.Map) {
    const pane = map.getPane(LOWSPOTS_PANE) || map.getPanes().overlayPane;
    const canvas = L.DomUtil.create('canvas', 'acre-flow-paths', pane) as HTMLCanvasElement;
    canvas.style.pointerEvents = 'none';
    canvas.style.position = 'absolute';
    this._canvas = canvas;
    this._ctx = canvas.getContext('2d');
    map.on('move zoom viewreset', this._redraw, this);
    this._redraw();
  },
  onRemove(this: any, map: L.Map) {
    map.off('move zoom viewreset', this._redraw, this);
    this._canvas?.remove();
    this._canvas = undefined;
    this._ctx = undefined;
  },
  _redraw(this: any) {
    const map: L.Map | undefined = this._map;
    const canvas: HTMLCanvasElement | undefined = this._canvas;
    const ctx: CanvasRenderingContext2D | undefined = this._ctx;
    if (!map || !canvas || !ctx) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(size.x * dpr));
    const h = Math.max(1, Math.round(size.y * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.strokeStyle = LINE_COLOR;
    ctx.fillStyle = LINE_COLOR;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.95;
    const majorArea = this._flowAreaM2 * 8;
    const toLatLng = this._toLatLng as (c: number, r: number) => L.LatLng;
    for (const line of this._lines as FlowLine[]) {
      if (line.pts.length < 2) continue;
      const major = line.areaM2 >= majorArea;
      const pts: Array<[number, number]> = line.pts.map(([c, r]) => {
        const p = map.latLngToContainerPoint(toLatLng(c, r));
        return [p.x, p.y];
      });
      ctx.lineWidth = major ? 2.5 : 1.25;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      const sizePx = major ? ARROW_SIZE_MAJOR_PX : ARROW_SIZE_PX;
      const arrows = arrowsAlongPolyline(pts, ARROW_SPACING_PX, { inset: ARROW_SPACING_PX * 0.4 });
      ctx.lineWidth = major ? 2.2 : 1.6;
      for (const a of arrows) {
        const s = sizePx;
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.angle);
        ctx.beginPath();
        ctx.moveTo(-s * 0.75, -s * 0.6);
        ctx.lineTo(s * 0.4, 0);
        ctx.lineTo(-s * 0.75, s * 0.6);
        ctx.stroke();
        ctx.restore();
      }
    }
  },
});

/** Ponds as one image, flow paths as thin lines with downhill chevrons. Nothing is interactive. */
export function drawLowSpots(result: LowSpotsResult, bbox: Box3857): L.LayerGroup {
  const { width: w, height: h, depth } = result;
  const group = L.layerGroup();
  const toLatLng = (col: number, row: number) =>
    L.CRS.EPSG3857.unproject(L.point(
      bbox[0] + ((col + 0.5) / w) * (bbox[2] - bbox[0]),
      bbox[3] - ((row + 0.5) / h) * (bbox[3] - bbox[1]),
    ));
  const corners = L.latLngBounds(
    L.CRS.EPSG3857.unproject(L.point(bbox[0], bbox[1])),
    L.CRS.EPSG3857.unproject(L.point(bbox[2], bbox[3])),
  );

  if (result.ponds > 0 && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const img = ctx.createImageData(w, h);
      const px = img.data;
      for (let i = 0; i < depth.length; i++) {
        const d = depth[i];
        if (!(d > 0)) continue;
        const t = Math.min(1, d / DEEP_M);
        const [r, g, b] = depthColor(t);
        const o = i * 4;
        px[o] = r;
        px[o + 1] = g;
        px[o + 2] = b;
        px[o + 3] = Math.round(150 + 80 * t);
      }
      ctx.putImageData(img, 0, 0);
      L.imageOverlay(canvas.toDataURL('image/png'), corners, {
        pane: LOWSPOTS_PANE,
        interactive: false,
        opacity: 1,
      }).addTo(group);
    }
  }

  const FlowPaths = FlowPathsLayer as unknown as {
    new (lines: FlowLine[], toLatLng: (c: number, r: number) => L.LatLng, flowAreaM2: number): L.Layer;
  };
  new FlowPaths(result.lines, toLatLng, result.flowAreaM2).addTo(group);
  return group;
}

export function drawLowSpotsFromAnalysis(
  analysis: LowSpotsAnalysis,
  bbox: Box3857,
  sliders: LowSpotsSliders = DEFAULT_LOWSPOTS_SLIDERS,
): L.LayerGroup {
  return drawLowSpots(resultFromSliders(analysis, sliders), bbox);
}

export type LowSpotsRun = {
  group: L.LayerGroup | null;
  status: LowSpotsStatus;
  analysis: LowSpotsAnalysis | null;
  bbox: Box3857 | null;
};

/** Fetch, compute and draw low spots for one box. Caller adds the group. */
export async function buildLowSpots(
  bounds: L.LatLngBounds,
  signal?: AbortSignal,
  sliders: LowSpotsSliders = DEFAULT_LOWSPOTS_SLIDERS,
): Promise<LowSpotsRun> {
  const grid = await fetchLowSpotsGrid(bounds, signal);
  // Mostly-empty rasters (no 3DEP here) would draw nonsense at the edges.
  if (grid.validCells < grid.width * grid.height * 0.5) {
    return { group: null, status: 'nodata', analysis: null, bbox: null };
  }
  // Let the "Loading" label paint before the ~0.3 s compute.
  await new Promise((r) => setTimeout(r, 0));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const analysis = analyzeLowSpots({
    elev: grid.elev,
    width: grid.width,
    height: grid.height,
    cellM: grid.cellM,
  });
  return {
    group: drawLowSpotsFromAnalysis(analysis, grid.bbox, sliders),
    status: 'ready',
    analysis,
    bbox: grid.bbox,
  };
}
