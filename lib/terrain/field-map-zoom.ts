/**
 * Leaflet options for the office and grower field maps.
 *
 * Leaflet's default zoomSnap is 1. A pinch on iPhone tracks the fingers, then
 * snaps to a whole zoom level, which is the big jump. 0.1 keeps that settle
 * inside a tenth of a level. Tiles stay on the rounded integer zoom and are
 * scaled in between, which is how GridLayer draws fractional zoom.
 *
 * zoomDelta is the +/- and keyboard step. It has to be a multiple of zoomSnap
 * or those buttons do nothing. wheelPxPerZoomLevel is twice Leaflet's default
 * so a trackpad notch is a smaller change and then snaps to the same tenth.
 */
export const FIELD_MAP_ZOOM = {
  zoomSnap: 0.1,
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 120,
} as const;
