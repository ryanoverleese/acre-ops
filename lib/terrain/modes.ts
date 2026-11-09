/**
 * Shared terrain mode labels / defaults.
 * Kept free of Leaflet so map parents can import without pulling the overlay bundle.
 *
 * Product modes are just the two CutSheetRX looks (+ Off):
 * blue→red color+shade, and solid gray hillshade.
 * Contours / flat color remain supported in ElevationOverlay for legacy callers.
 */

export type TerrainMode = 'off' | 'colorshade' | 'color' | 'shade' | 'contours';

/** Picker options — Color + shade and Gray shade only (plus Off). */
export const TERRAIN_OPTIONS: TerrainMode[] = ['off', 'colorshade', 'shade'];

export const TERRAIN_MODE_LABELS: Record<TerrainMode, string> = {
  off: 'Off',
  colorshade: 'Color + shade',
  color: 'Color',
  shade: 'Gray shade',
  contours: 'Contours (2ft)',
};

/** Default — CutSheetRX-style tinted relief (blue low → red high). */
export const DEFAULT_TERRAIN_MODE: TerrainMode = 'colorshade';
