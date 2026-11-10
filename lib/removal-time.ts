/** Probe pull clock. Display is always America/Chicago. Date-only history stays a date. */

export const REMOVAL_TIME_ZONE = 'America/Chicago';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD for an instant on the America/Chicago calendar. */
export function chicagoCalendarDate(instant = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REMOVAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** A real instant. A bare YYYY-MM-DD is not one — that would become midnight UTC. */
export function removalInstant(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || DAY.test(text)) return null;
  if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(text)) return null;
  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function removalInstantIso(value: unknown): string | null {
  const date = removalInstant(value);
  return date ? date.toISOString() : null;
}

/**
 * The clock is the pull time only when it falls on the stored calendar date.
 * An office backdate keeps the chosen date and does not borrow "now" as the
 * time of that day. A missing date still shows the instant.
 */
export function removalClockMatchesDate(removalDate: unknown, removalAt: unknown): boolean {
  const instant = removalInstant(removalAt);
  if (!instant) return false;
  const day = String(removalDate ?? '').slice(0, 10);
  if (!DAY.test(day)) return true;
  return chicagoCalendarDate(instant) === day;
}

export type RemovalWhenStyle = 'numeric' | 'short' | 'long';

function formatCalendarDay(day: string, style: RemovalWhenStyle): string {
  const match = DAY.exec(day);
  if (!match) return '';
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  const withYear = style !== 'short';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: style === 'numeric' ? 'numeric' : 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(instant);
}

/**
 * Date-only rows render as a calendar date with no time.
 * Timestamped rows render in America/Chicago, including the clock, when that
 * Chicago day is the stored removal date (or no date was stored).
 */
export function formatRemovalWhen(
  removalDate?: string | null,
  removalAt?: unknown,
  style: RemovalWhenStyle = 'numeric',
): string {
  const instant = removalInstant(removalAt);
  const day = String(removalDate ?? '').slice(0, 10);
  const showClock = instant != null && removalClockMatchesDate(removalDate, instant);
  if (showClock && instant) {
    const withYear = style !== 'short';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: REMOVAL_TIME_ZONE,
      month: style === 'numeric' ? 'numeric' : 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      hour: 'numeric',
      minute: '2-digit',
    }).format(instant);
  }
  if (DAY.test(day)) return formatCalendarDay(day, style);
  return '';
}
