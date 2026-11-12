export type GrowerTabId = 'fields' | 'probes' | 'recs';

export const GROWER_TABS: Array<{ id: GrowerTabId; href: string; label: string }> = [
  { id: 'fields', href: '/grower/fields', label: 'Fields' },
  { id: 'probes', href: '/grower/hardware', label: 'Probes' },
  { id: 'recs', href: '/grower/recommendations', label: 'Recs' },
];

/** Field detail stays on Fields. Hardware is Probes. Recommendations is Recs. */
export function growerTabForPath(pathname: string): GrowerTabId | null {
  if (pathname.startsWith('/grower/hardware')) return 'probes';
  if (pathname.startsWith('/grower/recommendations')) return 'recs';
  if (pathname === '/grower' || pathname.startsWith('/grower/fields')) return 'fields';
  return null;
}
