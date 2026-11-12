const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Calendar day only. A clock time is not turned into a date we were not given. */
export function probeCalendarDay(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const day = String(value).slice(0, 10);
  return DAY.test(day) ? day : null;
}

function formatDay(day: string): string {
  const match = DAY.exec(day);
  if (!match) return '';
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(instant);
}

/**
 * One date line. Both dates: "May 15, 2026 – Sep 17, 2026".
 * Pull only: "Out Sep 17, 2026". Install only: that date. Nothing invented.
 */
export function formatProbeDates(install: unknown, removal: unknown): string | null {
  const installLabel = formatDay(probeCalendarDay(install) || '');
  const removalLabel = formatDay(probeCalendarDay(removal) || '');
  if (installLabel && removalLabel) return `${installLabel} – ${removalLabel}`;
  if (removalLabel) return `Out ${removalLabel}`;
  if (installLabel) return installLabel;
  return null;
}

/** Serial with a single #. Empty stays empty — no "Probe" prefix. */
export function formatProbeSerial(serial: string | null | undefined): string | null {
  const text = (serial || '').trim();
  if (!text || text === '#') return null;
  return text.startsWith('#') ? text : `#${text}`;
}
