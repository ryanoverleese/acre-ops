export type ElevRange = { lo: number; hi: number };

/** True when the range can stretch elevation onto the blue→red ramp. */
export function isUsableRange(range: ElevRange | null | undefined): range is ElevRange {
  return !!range
    && Number.isFinite(range.lo)
    && Number.isFinite(range.hi)
    && range.hi > range.lo;
}

/** Min/max of valid elevations (meters). NaN and no-data are skipped. */
export function rangeFromSamples(values: ArrayLike<number>): ElevRange | null {
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v > -500 && v < 9000) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      n++;
    }
  }
  return n ? { lo, hi } : null;
}

/**
 * Color scale for one map tile.
 *
 * Color used to stretch each tile across the whole ramp using that tile's own
 * min/max. The ground is continuous, but the color index jumped at the tile
 * edge, which is the straight band on Color + shade. Gray shade does not use
 * this scale (it is local slope). Every tile must use the field boundary's
 * min/max, so the tile's own range is ignored.
 */
export function colorScaleForTile(tileRange: ElevRange | null, fieldRange: ElevRange): ElevRange {
  void tileRange;
  if (!isUsableRange(fieldRange)) {
    throw new Error('field color scale required');
  }
  return { lo: fieldRange.lo, hi: fieldRange.hi };
}

/** 0–255 index into the elevation LUT. Same meters and same scale → same index. */
export function elevationColorIndex(meters: number, scale: ElevRange): number {
  const span = Math.max(scale.hi - scale.lo, 0.5);
  const t = (meters - scale.lo) / span;
  if (t <= 0) return 0;
  if (t >= 1) return 255;
  return t * 255 | 0;
}
