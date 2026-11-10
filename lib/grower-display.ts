/** Browser-safe grower display helpers (no database). */

export function formatProbeAge(ageSeasons: number | null | undefined): string {
  if (ageSeasons == null) return 'Not recorded';
  return ageSeasons === 1 ? '1 season' : `${ageSeasons} seasons`;
}

export function probeAgeSeasons(yearNew: number | null, season: number): number | null {
  if (yearNew == null || !Number.isSafeInteger(yearNew)) return null;
  const age = season - yearNew + 1;
  return age >= 1 ? age : null;
}
