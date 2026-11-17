/**
 * Staff Map page Elevation · Color controls. Leaflet-free so tests can load it.
 * Values stick in localStorage on this browser only.
 */
export const ELEV_COLOR_PREFS_KEY = 'acre-ops-map-elev-color';

export type ElevColorPrefs = {
  auto: boolean;
  spread: boolean;
  loFt: number | null;
  hiFt: number | null;
};

export function defaultElevColorPrefs(): ElevColorPrefs {
  return { auto: true, spread: false, loFt: null, hiFt: null };
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
    if (!auto && loFt != null && hiFt != null && hiFt > loFt) {
      return { auto: false, spread, loFt, hiFt };
    }
    return { auto: true, spread, loFt, hiFt };
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
  });
}
