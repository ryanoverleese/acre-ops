'use client';

import L from 'leaflet';
import {
  buildLowSpots,
  ensureLowSpotsPane,
  type LowSpotsStatus,
} from '@/lib/terrain/lowspots-layer';
import { needsNewElevSample, padBox, type MapBbox } from '@/lib/terrain/viewport-scale';

/** Below this zoom the view is too wide for a useful 1024-cell grid. */
export const LOWSPOTS_MIN_ZOOM = 14;
export const LOWSPOTS_DEBOUNCE_MS = 400;
const LOWSPOTS_PAD = 0.15;

export type StaffLowSpotsHandle = { detach: () => void };

function boundsToBox(b: L.LatLngBounds): MapBbox {
  return { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() };
}

/**
 * Low spots for the staff Map page: computed on demand for the visible area
 * (plus a margin) from the 3DEP DEM. Nothing is stored.
 */
export function attachStaffLowSpots(
  map: L.Map,
  onStatus?: (status: LowSpotsStatus) => void,
): StaffLowSpotsHandle {
  ensureLowSpotsPane(map);
  let drawn: L.LayerGroup | null = null;
  let sample: MapBbox | null = null;
  let abort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let gen = 0;
  let dead = false;

  const clear = () => {
    drawn?.remove();
    drawn = null;
    sample = null;
  };

  const run = () => {
    if (dead) return;
    if (map.getZoom() < LOWSPOTS_MIN_ZOOM) {
      abort?.abort();
      clear();
      onStatus?.('zoom');
      return;
    }
    const view = boundsToBox(map.getBounds());
    if (!needsNewElevSample(sample, view)) return;
    const next = padBox(view, LOWSPOTS_PAD);
    abort?.abort();
    const ac = new AbortController();
    abort = ac;
    const my = ++gen;
    // Keep the old drawing on screen while the new one loads.
    if (!drawn) onStatus?.('loading');
    buildLowSpots(L.latLngBounds(L.latLng(next.s, next.w), L.latLng(next.n, next.e)), ac.signal)
      .then(({ group, status }) => {
        if (dead || my !== gen) return;
        drawn?.remove();
        drawn = group;
        group?.addTo(map);
        sample = next;
        onStatus?.(status);
      })
      .catch((err) => {
        if (dead || my !== gen || err?.name === 'AbortError') return;
        onStatus?.('error');
      });
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, LOWSPOTS_DEBOUNCE_MS);
  };

  run();
  map.on('moveend', schedule);
  map.on('zoomend', schedule);

  return {
    detach() {
      dead = true;
      if (timer) clearTimeout(timer);
      abort?.abort();
      map.off('moveend', schedule);
      map.off('zoomend', schedule);
      clear();
      onStatus?.('off');
    },
  };
}
