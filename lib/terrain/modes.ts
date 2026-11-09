/**
 * Shared terrain mode labels / defaults.
 * Kept free of Leaflet so map parents can import without pulling the overlay bundle.
 */

export type TerrainMode = 'off' | 'colorshade' | 'color' | 'shade' | 'contours';

export const TERRAIN_OPTIONS: TerrainMode[] = ['off', 'colorshade', 'color', 'shade', 'contours'];

export const TERRAIN_MODE_LABELS: Record<TerrainMode, string> = {
  off: 'Off',
  colorshade: 'Color + shade',
  color: 'Color',
  shade: 'Gray shade',
  contours: 'Contours (2ft)',
};

/** Default — CutSheetRX-style tinted relief (blue low → red high). */
export const DEFAULT_TERRAIN_MODE: TerrainMode = 'colorshade';
