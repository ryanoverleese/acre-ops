import { probeCalendarDay } from '@/lib/probe-row';

export type ProbeListItem = {
  id: number;
  fieldId: number;
  fieldName: string;
  serial: string | null;
  status: string | null;
  installDate: string | null;
  removalDate: string | null;
  ageSeasons: number | null;
  brand: string | null;
  ownerName: string | null;
  lat: number | null;
  lng: number | null;
};

type DayParts = { y: number; m: number; d: number };

function dayParts(value: string | null): DayParts | null {
  const day = probeCalendarDay(value);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function formatDay(parts: DayParts, withYear: boolean): string {
  const instant = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
  }).format(instant);
}

/** One date line. Same year keeps the year once. Install-only says Installed. */
export function formatProbeListDates(install: string | null, removal: string | null): string | null {
  const start = dayParts(install);
  const end = dayParts(removal);
  if (start && end) {
    if (start.y === end.y) return `${formatDay(start, false)} – ${formatDay(end, true)}`;
    return `${formatDay(start, true)} – ${formatDay(end, true)}`;
  }
  if (start) return `Installed ${formatDay(start, true)}`;
  if (end) return formatDay(end, true);
  return null;
}

export function isRemovedStatus(status: string | null | undefined): boolean {
  return (status || '').trim().toLowerCase() === 'removed';
}

export function isInstalledStatus(status: string | null | undefined): boolean {
  return (status || '').trim().toLowerCase() === 'installed';
}

export function probeStatusesMixed(items: Array<{ status: string | null }>): boolean {
  const seen = new Set<string>();
  for (const item of items) seen.add((item.status || '').trim().toLowerCase());
  return seen.size > 1;
}

/** The shared status label when every probe has that same non-empty status. */
export function uniformStatusLabel(items: Array<{ status: string | null }>): string | null {
  if (!items.length || probeStatusesMixed(items)) return null;
  const text = (items[0].status || '').trim();
  return text || null;
}

export function probesSubline(season: number, count: number, uniform: string | null): string {
  const noun = count === 1 ? 'probe' : 'probes';
  const base = `${season} season · ${count} ${noun}`;
  return uniform ? `${base} · ${uniform}` : base;
}

export function removedCount(items: Array<{ status: string | null }>): number {
  return items.filter((item) => isRemovedStatus(item.status)).length;
}

/** Collapse removed rows only when they outnumber the rows that stay visible. */
export function canCollapseRemoved(items: Array<{ status: string | null }>): boolean {
  let removed = 0;
  let active = 0;
  for (const item of items) {
    if (isRemovedStatus(item.status)) removed += 1;
    else active += 1;
  }
  return removed > active && active >= 1;
}

export type ProbeGroupView = {
  fieldId: number;
  fieldName: string;
  probes: ProbeListItem[];
};

export function groupProbes(items: ProbeListItem[], showRemoved: boolean): ProbeGroupView[] {
  const visible = !canCollapseRemoved(items) || showRemoved
    ? items
    : items.filter((item) => !isRemovedStatus(item.status));
  const byField = new Map<number, ProbeGroupView>();
  for (const item of visible) {
    let group = byField.get(item.fieldId);
    if (!group) {
      group = { fieldId: item.fieldId, fieldName: item.fieldName, probes: [] };
      byField.set(item.fieldId, group);
    }
    group.probes.push(item);
  }
  for (const group of byField.values()) {
    group.probes.sort((a, b) => {
      const rank = Number(isInstalledStatus(b.status)) - Number(isInstalledStatus(a.status));
      return rank || a.id - b.id;
    });
  }
  return [...byField.values()].sort((a, b) => {
    const rank = Number(b.probes.some((probe) => isInstalledStatus(probe.status)))
      - Number(a.probes.some((probe) => isInstalledStatus(probe.status)));
    if (rank) return rank;
    const name = a.fieldName.localeCompare(b.fieldName, 'en');
    return name || a.fieldId - b.fieldId;
  });
}

export function mapsSearchUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}
