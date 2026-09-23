/**
 * Daily pull scoreboard for the Removals list + pull map.
 * Counts Removed probe assignments with removal_date = America/Chicago today,
 * broken out by removed_by for Ryan / Brandon / Carter.
 */

export const TODAY_PULL_CREW = ['Ryan', 'Brandon', 'Carter'] as const;
export type TodayPullCrew = (typeof TODAY_PULL_CREW)[number];
export type TodayPullCounts = Record<TodayPullCrew, number>;

export type PullCountRow = {
  removed: boolean;
  removedOn?: string;
  removedBy?: string;
};

/**
 * YYYY-MM-DD for the current America/Chicago calendar day.
 * Same rule as /api/pulled-today `todayChicago` (shareable /pulled dashboard).
 */
export function chicagoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Match planned_remover to the logged-in installer (same rules as removals API). */
export function matchesPlannedRemover(plannedRemover: string | undefined, installer: string): boolean {
  if (!plannedRemover) return false;
  if (plannedRemover === installer) return true;
  if (installer === 'Ryan and Kasen' && plannedRemover === 'Ryan') return true;
  return false;
}

function matchesCrewName(removedBy: string, name: TodayPullCrew): boolean {
  const who = removedBy.trim().toLowerCase();
  if (!who) return false;
  const n = name.toLowerCase();
  if (who === n) return true;
  // "Ryan and Kasen" (and similar) counts toward Ryan
  if (who.startsWith(`${n} `) || who.startsWith(`${n}/`) || who.startsWith(`${n},`)) return true;
  return false;
}

export function emptyTodayPullCounts(): TodayPullCounts {
  return { Ryan: 0, Brandon: 0, Carter: 0 };
}

/** Fleet-wide today counts — ignore Mine / A|B route filters. */
export function countTodayPulls(rows: PullCountRow[]): TodayPullCounts {
  const today = chicagoToday();
  const counts = emptyTodayPullCounts();
  for (const r of rows) {
    if (!r.removed) continue;
    const on = (r.removedOn || '').slice(0, 10);
    if (on !== today) continue;
    const who = r.removedBy || '';
    for (const name of TODAY_PULL_CREW) {
      if (matchesCrewName(who, name)) {
        counts[name] += 1;
        break;
      }
    }
  }
  return counts;
}

/** Tiny muted one-liner: `Ryan 12 · Brandon 28 · Carter 5` */
export function formatTodayPullCounts(counts: TodayPullCounts): string {
  return TODAY_PULL_CREW.map((name) => `${name} ${counts[name]}`).join(' · ');
}
