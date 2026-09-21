/**
 * Shared A | B | All route filter for Removals list + pull map.
 * Baserow field_seasons.route_order is stamped "A" or "B" for removals.
 * Install mode keeps numeric route_order separately — do not reuse this there.
 */

export type RemovalsRouteFilter = 'A' | 'B' | 'all';

export const REMOVALS_ROUTE_FILTER_KEY = 'acre-removals-route-filter';

export function normalizeRouteOrder(routeOrder: string | undefined | null): string {
  return (routeOrder ?? '').trim().toUpperCase();
}

/** A/B match stamped route; empty/other only under All. */
export function matchesRouteFilter(
  routeOrder: string | undefined | null,
  filter: RemovalsRouteFilter,
): boolean {
  if (filter === 'all') return true;
  return normalizeRouteOrder(routeOrder) === filter;
}

export function loadRouteFilter(): RemovalsRouteFilter | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = (localStorage.getItem(REMOVALS_ROUTE_FILTER_KEY) || '').trim().toUpperCase();
    if (v === 'A' || v === 'B') return v;
    if (v === 'ALL') return 'all';
  } catch { /* private mode / quota */ }
  return null;
}

export function saveRouteFilter(filter: RemovalsRouteFilter): void {
  try {
    localStorage.setItem(REMOVALS_ROUTE_FILTER_KEY, filter);
  } catch { /* private mode / quota */ }
}

/** Default: A if any still-out A; else B if any B; else All. */
export function defaultRouteFilter(
  rows: Array<{ routeOrder?: string; removed?: boolean }>,
): RemovalsRouteFilter {
  const stillOut = rows.filter((r) => !r.removed);
  if (stillOut.some((r) => normalizeRouteOrder(r.routeOrder) === 'A')) return 'A';
  if (stillOut.some((r) => normalizeRouteOrder(r.routeOrder) === 'B')) return 'B';
  return 'all';
}

export function routeFilterLabel(filter: RemovalsRouteFilter): string {
  return filter === 'all' ? 'all routes' : `route ${filter}`;
}
