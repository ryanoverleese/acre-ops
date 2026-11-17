/**
 * Viewport color-scale helpers for the staff Map elevation layer.
 * The field map stretches blue→red to one field's min/max. The Map page
 * uses the visible area, padded so a small pan does not recolor everything.
 * Leaflet-free so tests can load this file without the map bundle.
 */

export const VIEW_PAD = 0.25;
/** Resample when the sample covers more than this many times the view area. */
export const TIGHTEN_AREA_RATIO = 4;

export type MapBbox = { w: number; s: number; e: number; n: number };

export function padBox(box: MapBbox, pad = VIEW_PAD): MapBbox {
  const lngPad = (box.e - box.w) * pad;
  const latPad = (box.n - box.s) * pad;
  return {
    w: box.w - lngPad,
    s: box.s - latPad,
    e: box.e + lngPad,
    n: box.n + latPad,
  };
}

export function boxContains(sample: MapBbox, view: MapBbox): boolean {
  return sample.w <= view.w && sample.s <= view.s && sample.e >= view.e && sample.n >= view.n;
}

export function boxArea(box: MapBbox): number {
  return Math.max(0, box.e - box.w) * Math.max(0, box.n - box.s);
}

/** True when the color scale should be resampled for the current view. */
export function needsNewElevSample(sample: MapBbox | null, view: MapBbox): boolean {
  if (!sample) return true;
  if (!boxContains(sample, view)) return true;
  const sampleArea = boxArea(sample);
  const viewArea = boxArea(view);
  if (viewArea <= 0) return false;
  return sampleArea / viewArea > TIGHTEN_AREA_RATIO;
}

/** Button label: off is "Elevation"; on is "Elevation · Color" or "Elevation · Gray". */
export function elevationButtonLabel(mode: string): string {
  if (mode === 'colorshade' || mode === 'color') return 'Elevation · Color';
  if (mode === 'shade') return 'Elevation · Gray';
  return 'Elevation';
}
