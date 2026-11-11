export type ElevRange = { lo: number; hi: number };

/** True when the range can stretch elevation onto the blue→red ramp. */
export function isUsableRange(range: ElevRange | null | undefined): range is ElevRange {
  return !!range
    && Number.isFinite(range.lo)
    && Number.isFinite(range.hi)
    && range.hi > range.lo;
}

/**
 * How far a sample may sit from the median and still count.
 * Nebraska fields here have a few meters of relief. A no-data pixel that
 * arrives as 0 (the mask was dropped) is hundreds of meters away and would
 * otherwise pin every real elevation on the top stop of the ramp.
 */
const OUTLIER_RADIUS_M = 80;

/**
 * Min/max of real ground elevations (meters).
 * NaN, infinities, and no-data sentinels are skipped. A value at or below 0
 * is treated as no-data: 3DEP writes 0 when the mask is missing, and these
 * fields are hundreds of meters above sea level. Remaining samples more than
 * 80 m from the median are dropped so one bad pixel cannot collapse the ramp.
 */
export function rangeFromSamples(values: ArrayLike<number>): ElevRange | null {
  const kept: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v > 0 && v < 9000) kept.push(v);
  }
  if (!kept.length) return null;
  kept.sort((a, b) => a - b);
  const mid = kept[kept.length >> 1];
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  for (const v of kept) {
    if (Math.abs(v - mid) > OUTLIER_RADIUS_M) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    n++;
  }
  if (!n) return null;
  // A flat sample still needs a usable scale, or every pixel paints as the top stop.
  if (!(hi > lo)) return { lo: mid - 0.25, hi: mid + 0.25 };
  return { lo, hi };
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
