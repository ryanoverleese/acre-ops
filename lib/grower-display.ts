/** Browser-safe grower display helpers (no database). */

export function formatProbeAge(ageSeasons: number | null | undefined): string {
  if (ageSeasons == null) return 'Not recorded';
  return ageSeasons === 1 ? '1 season' : `${ageSeasons} seasons`;
}

/**
 * Acres come from fields.acres only (never derived from boundary geometry).
 * Null/non-positive stored values display as not recorded — do not invent area.
 */
export function formatGrowerAcres(acres: number | null | undefined): string | null {
  if (acres == null || !Number.isFinite(acres) || acres <= 0) return null;
  return `${acres} ac`;
}

export function probeAgeSeasons(yearNew: number | null, season: number): number | null {
  if (yearNew == null || !Number.isSafeInteger(yearNew)) return null;
  const age = season - yearNew + 1;
  return age >= 1 ? age : null;
}
