'use client';

import L from 'leaflet';
import { createElevGridLayer, type ElevColorOptions, type ElevRenderMode } from '@/lib/terrain/elev-grid';
import type { ElevRange } from '@/lib/terrain/color-scale';
import {
  needsNewElevSample,
  padBox,
  type MapBbox,
} from '@/lib/terrain/viewport-scale';

export const ELEVATION_PANE = 'acre-elevation';
/** Below soils (390) and overlay markers (400) so field/probe taps win. */
export const ELEVATION_PANE_Z = '350';
export const ELEVATION_DEBOUNCE_MS = 300;

/** Default layer opacity (0..1). More opaque than the old 0.65 / 0.75 modes. */
export const DEFAULT_ELEV_OPACITY = 0.9;

export type StaffElevColor = ElevColorOptions;

export type StaffElevationHandle = {
  setMode: (mode: ElevRenderMode) => void;
  setColorOptions: (color: StaffElevColor) => void;
  setOpacity: (opacity: number) => void;
  detach: () => void;
};

function boundsToBox(bounds: L.LatLngBounds): MapBbox {
  return {
    w: bounds.getWest(),
    s: bounds.getSouth(),
    e: bounds.getEast(),
    n: bounds.getNorth(),
  };
}

function boxToLatLngBounds(box: MapBbox): L.LatLngBounds {
  return L.latLngBounds(L.latLng(box.s, box.w), L.latLng(box.n, box.e));
}

export function ensureElevationPane(map: L.Map) {
  let pane = map.getPane(ELEVATION_PANE);
  if (!pane) {
    pane = map.createPane(ELEVATION_PANE);
    pane.style.zIndex = ELEVATION_PANE_Z;
  }
  // Never intercept clicks — field and probe markers sit above this pane,
  // but empty space must still pass through to the map and those layers.
  pane.style.pointerEvents = 'none';
  pane.style.mixBlendMode = 'normal';
}

/**
 * USGS 3DEP shaded relief for the staff Map page (vanilla Leaflet).
 * Color stretch uses a padded viewport sample, not a field boundary.
 * No clip-path — the relief covers the visible map.
 */
export function attachStaffElevation(
  map: L.Map,
  mode: ElevRenderMode,
  onRange?: (range: ElevRange | null) => void,
  color?: StaffElevColor,
  opacity = DEFAULT_ELEV_OPACITY,
): StaffElevationHandle {
  ensureElevationPane(map);

  const layer = createElevGridLayer({
    mode,
    opacity,
    pane: ELEVATION_PANE,
    fieldBounds: null,
    fieldRings: null,
    onFieldScale: (range) => onRange?.(range),
    color,
  });
  layer.addTo(map);

  let sample: MapBbox | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const apply = () => {
    const view = boundsToBox(map.getBounds());
    if (!needsNewElevSample(sample, view)) return;
    const next = padBox(view);
    sample = next;
    layer.setFieldBounds(boxToLatLngBounds(next), null);
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(apply, ELEVATION_DEBOUNCE_MS);
  };

  apply();
  map.on('moveend', schedule);
  map.on('zoomend', schedule);

  return {
    setMode(next: ElevRenderMode) {
      layer.setElevMode(next);
    },
    setColorOptions(next: StaffElevColor) {
      layer.setColorOptions(next);
    },
    setOpacity(next: number) {
      layer.setOpacity(next);
    },
    detach() {
      if (timer) clearTimeout(timer);
      map.off('moveend', schedule);
      map.off('zoomend', schedule);
      map.removeLayer(layer);
      onRange?.(null);
    },
  };
}
