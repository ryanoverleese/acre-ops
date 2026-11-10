/** Browser-safe grower display helpers (no database). */

export function formatProbeAge(ageSeasons: number | null | undefined): string {
  if (ageSeasons == null) return 'Not recorded';
  return ageSeasons === 1 ? '1 season' : `${ageSeasons} seasons`;
}

/**
 * Grower acres prefer field_boundaries.acres (geometry-derived column).
 * When falling back to stored fields.acres, mark as (stored).
 * Null/non-positive values display as not recorded — do not invent area.
 */
export function formatGrowerAcres(
  acres: number | null | undefined,
  options?: { fromBoundary?: boolean | null },
): string | null {
  if (acres == null || !Number.isFinite(acres) || acres <= 0) return null;
  const label = `${acres} ac`;
  if (options && options.fromBoundary === false) return `${label} (stored)`;
  return label;
}

/** Probe assignment status from assignment_probe_status_options (Installed / Removed / …). */
export function formatGrowerProbeStatus(status: string | null | undefined): string {
  const trimmed = status?.trim();
  return trimmed ? trimmed : 'Not recorded';
}

export type GrowerFieldStatusSummary = {
  /** Short label for lists: Installed, Removed, Installed · Removed, Assigned, No probes. */
  label: string;
  installed: number;
  removed: number;
  assigned: number;
  other: number;
};

/**
 * Field status for growers is derived only from this season's probe assignment
 * statuses — not invented and not office inventory state.
 */
export function summarizeGrowerFieldProbeStatus(
  statuses: Array<string | null | undefined>,
): GrowerFieldStatusSummary {
  let installed = 0;
  let removed = 0;
  let assigned = 0;
  let other = 0;
  for (const raw of statuses) {
    const value = (raw || '').trim().toLowerCase();
    if (!value) {
      other += 1;
      continue;
    }
    if (value === 'installed') installed += 1;
    else if (value === 'removed') removed += 1;
    else if (value === 'assigned') assigned += 1;
    else other += 1;
  }
  const parts: string[] = [];
  if (installed) parts.push('Installed');
  if (removed) parts.push('Removed');
  if (!installed && !removed && assigned) parts.push('Assigned');
  if (!parts.length && other) parts.push('Status not recorded');
  return {
    label: parts.length ? parts.join(' · ') : 'No probes',
    installed,
    removed,
    assigned,
    other,
  };
}

export function probeAgeSeasons(yearNew: number | null, season: number): number | null {
  if (yearNew == null || !Number.isSafeInteger(yearNew)) return null;
  const age = season - yearNew + 1;
  return age >= 1 ? age : null;
}
