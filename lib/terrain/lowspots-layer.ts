import L from 'leaflet';
import * as Lerc from 'lerc';
import { ensureLerc, exportUrl } from './elev-grid';
import { computeLowSpots, type LowSpotsResult } from './lowspots';

/** Above Elevation (350) and Soils (390), below labels (395) and fields (399). */
export const LOWSPOTS_PANE = 'acre-lowspots';
export const LOWSPOTS_PANE_Z = '393';
/** Longest side of the DEM request, in pixels. 1024² computes in about 0.3 s. */
export const LOWSPOTS_MAX_PX = 1024;
/** Ponds use this depth for the darkest blue, meters (2 ft). */
const DEEP_M = 0.6096;
const LINE_COLOR = '#1d5fbf';

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

/** Ponds as one image, flow paths as thin lines. Nothing is interactive. */
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

  const renderer = L.canvas({ pane: LOWSPOTS_PANE, padding: 0.3 });
  const major = result.flowAreaM2 * 8;
  for (const line of result.lines) {
    L.polyline(line.pts.map(([c, r]) => toLatLng(c, r)), {
      pane: LOWSPOTS_PANE,
      renderer,
      color: LINE_COLOR,
      weight: line.areaM2 >= major ? 2.5 : 1.25,
      opacity: 0.95,
      interactive: false,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(group);
  }
  return group;
}

export type LowSpotsRun = { group: L.LayerGroup | null; status: LowSpotsStatus };

/** Fetch, compute and draw low spots for one box. Caller adds the group. */
export async function buildLowSpots(bounds: L.LatLngBounds, signal?: AbortSignal): Promise<LowSpotsRun> {
  const grid = await fetchLowSpotsGrid(bounds, signal);
  // Mostly-empty rasters (no 3DEP here) would draw nonsense at the edges.
  if (grid.validCells < grid.width * grid.height * 0.5) return { group: null, status: 'nodata' };
  // Let the "Loading" label paint before the ~0.3 s compute.
  await new Promise((r) => setTimeout(r, 0));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const result = computeLowSpots({ elev: grid.elev, width: grid.width, height: grid.height, cellM: grid.cellM });
  return { group: drawLowSpots(result, grid.bbox), status: 'ready' };
}
