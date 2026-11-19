/** Gentle fade-in for a newly painted elevation tile. Leaflet's default is 200ms. */
export const ELEV_TILE_FADE_MS = 400;
/** Leaflet prunes replaced tiles a moment after the fade finishes, so old tiles stay until then. */
export const ELEV_TILE_PRUNE_DELAY_MS = ELEV_TILE_FADE_MS + 50;

/** Opacity of a tile `elapsedMs` after it was marked loaded. */
export function elevTileFadeProgress(elapsedMs: number, durationMs = ELEV_TILE_FADE_MS): number {
  if (elapsedMs <= 0) return 0;
  if (elapsedMs >= durationMs) return 1;
  return elapsedMs / durationMs;
}
