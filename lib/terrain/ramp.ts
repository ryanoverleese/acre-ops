/**
 * Elevation color ramp lifted from CutSheetRX (senterfarms.com/programs/csrx):
 * low blue → teal → green → yellow → orange → high red.
 */
export const CUTSHEET_STOPS: Array<[number, [number, number, number]]> = [
  [0, [33, 64, 154]],
  [0.2, [44, 123, 182]],
  [0.4, [94, 186, 166]],
  [0.55, [171, 221, 164]],
  [0.7, [254, 224, 139]],
  [0.85, [244, 109, 67]],
  [1, [165, 0, 38]],
];

/** Precomputed 256×RGB lookup matching CutSheetRX's LUT builder. */
export function buildElevationLut(
  stops: Array<[number, [number, number, number]]> = CUTSHEET_STOPS,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const a = stops[k];
    const b = stops[k + 1];
    const f = (t - a[0]) / (b[0] - a[0] || 1);
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f;
    }
  }
  return lut;
}

export const ELEVATION_LUT = buildElevationLut();

export function elevationCssGradient(
  stops: Array<[number, [number, number, number]]> = CUTSHEET_STOPS,
): string {
  return `linear-gradient(90deg,${stops
    .map(([t, rgb]) => `rgb(${rgb.join(',')}) ${t * 100}%`)
    .join(',')})`;
}

export function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v | 0;
}
