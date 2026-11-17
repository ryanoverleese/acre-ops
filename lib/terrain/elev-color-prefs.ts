/**
 * Staff Map page Elevation · Color controls. Leaflet-free so tests can load it.
 * Values stick in localStorage on this browser only.
 */
export const ELEV_COLOR_PREFS_KEY = 'acre-ops-map-elev-color';

/** Relief slider is 0..100. 50 is the a56e1e1 default; 100 is the stronger c0501d9 look. */
export const DEFAULT_RELIEF = 50;

/** Opacity slider is 30..100 (percent). 90 is more opaque than the old 65/75 defaults. */
export const DEFAULT_OPACITY = 90;
export const MIN_OPACITY = 30;
export const MAX_OPACITY = 100;

export type ElevColorPrefs = {
  auto: boolean;
  spread: boolean;
  loFt: number | null;
  hiFt: number | null;
  relief: number;
  opacity: number;
};

export function clampReliefPref(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_RELIEF;
  return n < 0 ? 0 : n > 100 ? 100 : n;
}

export function clampOpacityPref(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_OPACITY;
  return n < MIN_OPACITY ? MIN_OPACITY : n > MAX_OPACITY ? MAX_OPACITY : n;
}

export function defaultElevColorPrefs(): ElevColorPrefs {
  return { auto: true, spread: false, loFt: null, hiFt: null, relief: DEFAULT_RELIEF, opacity: DEFAULT_OPACITY };
}

export function parseElevColorPrefs(raw: string | null | undefined): ElevColorPrefs {
  const fallback = defaultElevColorPrefs();
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as Partial<ElevColorPrefs>;
    const auto = v.auto !== false;
    const spread = v.spread === true;
    const loFt = Number.isFinite(v.loFt as number) ? Math.round(v.loFt as number) : null;
    const hiFt = Number.isFinite(v.hiFt as number) ? Math.round(v.hiFt as number) : null;
    const relief = v.relief == null ? DEFAULT_RELIEF : clampReliefPref(v.relief);
    const opacity = v.opacity == null ? DEFAULT_OPACITY : clampOpacityPref(v.opacity);
    if (!auto && loFt != null && hiFt != null && hiFt > loFt) {
      return { auto: false, spread, loFt, hiFt, relief, opacity };
    }
    return { auto: true, spread, loFt, hiFt, relief, opacity };
  } catch {
    return fallback;
  }
}

export function serializeElevColorPrefs(prefs: ElevColorPrefs): string {
  return JSON.stringify({
    auto: !!prefs.auto,
    spread: !!prefs.spread,
    loFt: prefs.loFt,
    hiFt: prefs.hiFt,
    relief: clampReliefPref(prefs.relief),
    opacity: clampOpacityPref(prefs.opacity),
  });
}
