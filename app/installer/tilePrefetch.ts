/**
 * Dead-zone tile warm-up for installer Removals / Pull map.
 *
 * While online, prefetch Google mt* tile URLs for a walk-up bbox around
 * still-out stops so Safari home-screen (and browser HTTP cache) keep
 * imagery when the crew drives into a dead zone. Pins + GPS stay on the
 * map even if tiles miss — see InstallerMapView errorTileUrl / panes.
 *
 * Prefer Cache Storage via the installer-scoped SW when registered;
 * always also warm via Image() so browser disk cache helps either way.
 */

export type PrefetchPoint = { lat: number; lng: number };

const STREET_TMPL = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
const SAT_TMPL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';

/** Walk-up zooms — not statewide overview. */
const DEFAULT_ZOOMS = [14, 15, 16] as const;
/** Hard cap so a statewide "Show all" day does not flood the radio. */
const MAX_TILES = 320;
/** ~1.1 km padding around the stop cluster (~0.01° lat). */
const BBOX_PAD_DEG = 0.012;
/** If the stop cluster spans more than this, warm per-stop instead of one bbox. */
const MAX_CLUSTER_SPAN_DEG = 0.45;
/** Per-stop radius when cluster is too wide (~700 m). */
const PER_STOP_PAD_DEG = 0.006;

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function lat2tile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
  );
}

function tileUrl(tmpl: string, x: number, y: number, z: number): string {
  return tmpl.replace('{x}', String(x)).replace('{y}', String(y)).replace('{z}', String(z));
}

function urlsForBbox(
  tmpl: string,
  south: number,
  west: number,
  north: number,
  east: number,
  zooms: readonly number[],
  budget: { left: number }
): string[] {
  const out: string[] = [];
  for (const z of zooms) {
    if (budget.left <= 0) break;
    const x0 = lon2tile(west, z);
    const x1 = lon2tile(east, z);
    const y0 = lat2tile(north, z); // north → smaller y
    const y1 = lat2tile(south, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (budget.left <= 0) return out;
        out.push(tileUrl(tmpl, x, y, z));
        budget.left -= 1;
      }
    }
  }
  return out;
}

/** Build tile URLs for still-out Removals stops at walk-up zooms. */
export function buildRemovalTileUrls(
  points: PrefetchPoint[],
  layer: 'street' | 'satellite' = 'satellite',
  zooms: readonly number[] = DEFAULT_ZOOMS
): string[] {
  const valid = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat && p.lng);
  if (valid.length === 0) return [];

  const tmpl = layer === 'satellite' ? SAT_TMPL : STREET_TMPL;
  const budget = { left: MAX_TILES };

  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const p of valid) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }

  const spanLat = north - south;
  const spanLng = east - west;

  if (spanLat <= MAX_CLUSTER_SPAN_DEG && spanLng <= MAX_CLUSTER_SPAN_DEG) {
    return urlsForBbox(
      tmpl,
      south - BBOX_PAD_DEG,
      west - BBOX_PAD_DEG,
      north + BBOX_PAD_DEG,
      east + BBOX_PAD_DEG,
      zooms,
      budget
    );
  }

  // Wide day: warm a small footprint around each still-out stop.
  const out: string[] = [];
  for (const p of valid) {
    if (budget.left <= 0) break;
    out.push(
      ...urlsForBbox(
        tmpl,
        p.lat - PER_STOP_PAD_DEG,
        p.lng - PER_STOP_PAD_DEG,
        p.lat + PER_STOP_PAD_DEG,
        p.lng + PER_STOP_PAD_DEG,
        zooms,
        budget
      )
    );
  }
  return out;
}

function warmViaImage(url: string): Promise<void> {
  return new Promise(resolve => {
    if (typeof Image === 'undefined') {
      resolve();
      return;
    }
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.decoding = 'async';
    img.src = url;
  });
}

async function warmViaServiceWorker(urls: string[]): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const worker = reg.active || navigator.serviceWorker.controller;
    if (!worker) return;
    // Chunk so a huge day does not blow the message size.
    const CHUNK = 80;
    for (let i = 0; i < urls.length; i += CHUNK) {
      worker.postMessage({ type: 'AF_PREFETCH_TILES', urls: urls.slice(i, i + CHUNK) });
    }
  } catch {
    /* SW optional for mid-season ship */
  }
}

export type PrefetchResult = {
  urls: number;
  mode: 'online-warm' | 'skipped-offline' | 'skipped-empty';
};

/**
 * Prefetch Removals map tiles while signal is good.
 * Safe to call repeatedly — browsers de-dupe identical Image/SW fetches.
 */
export async function prefetchRemovalTiles(
  points: PrefetchPoint[],
  layer: 'street' | 'satellite' = 'satellite'
): Promise<PrefetchResult> {
  if (typeof window === 'undefined') return { urls: 0, mode: 'skipped-empty' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { urls: 0, mode: 'skipped-offline' };
  }

  const urls = buildRemovalTileUrls(points, layer);
  if (urls.length === 0) return { urls: 0, mode: 'skipped-empty' };

  // Kick SW Cache Storage first (persists better on iOS home-screen), then
  // Image() warm for the ordinary HTTP cache Leaflet reads from.
  void warmViaServiceWorker(urls);

  const CONCURRENCY = 8;
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(warmViaImage));
  }

  return { urls: urls.length, mode: 'online-warm' };
}
