/**
 * Map pins and the field-detail probe lists share one number:
 * probe_assignments.probe_number. That is the digit drawn in the pin when
 * the assignment has no custom label ("1", "2"). The list says "Probe 1".
 *
 * Order is that number, then id, with a missing number last — the same
 * order as the grower field query (probe_number NULLS LAST, id).
 */

export function probePinNumber(probeNumber: number | null | undefined): number | null {
  if (probeNumber == null) return null;
  const n = Number(probeNumber);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Text drawn inside the map pin. A custom label wins; otherwise the probe number. */
export function probePinText(probe: {
  label?: string | null;
  probeNumber?: number | null;
}): string {
  const custom = probe.label?.trim();
  if (custom) return custom;
  const n = probePinNumber(probe.probeNumber);
  return n == null ? 'P' : String(n);
}

/** "Probe 1" / "Probe 2" for the list under the map. Same number as the pin. */
export function probeListTitle(probe: { probeNumber?: number | null }): string {
  const n = probePinNumber(probe.probeNumber);
  return n == null ? 'Probe' : `Probe ${n}`;
}

export function compareProbePinOrder(
  a: { probeNumber?: number | null; id?: number | null },
  b: { probeNumber?: number | null; id?: number | null },
): number {
  const an = probePinNumber(a.probeNumber);
  const bn = probePinNumber(b.probeNumber);
  if (an == null && bn != null) return 1;
  if (an != null && bn == null) return -1;
  if (an != null && bn != null && an !== bn) return an - bn;
  return (a.id ?? 0) - (b.id ?? 0);
}
