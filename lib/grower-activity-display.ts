/** Plain labels for grower activity. Safe to import from client components. */

export type GrowerActivityEventType = 'login' | 'page_view' | 'logout';

export interface GrowerActivityEvent {
  eventType: GrowerActivityEventType;
  path: string | null;
  fieldId: number | null;
  fieldName: string | null;
  createdAt: string;
  when: string;
  label: string;
}

export interface GrowerActivityFarm {
  id: number;
  name: string;
  pilot: boolean;
  pinSet: boolean;
  loginCount: number;
  viewCount: number;
  lastLoginAt: string | null;
  lastLoginLabel: string | null;
  recent: GrowerActivityEvent[];
}

const PAGE_VIEWS = new Set([
  '/grower/fields',
  '/grower/hardware',
  '/grower/recommendations',
]);

const CHICAGO = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

export function normalizeGrowerActivityPath(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 300) return null;
  let path = trimmed.split('?')[0]?.split('#')[0] ?? '';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (!/^\/grower(?:\/[A-Za-z0-9_-]+)*$/.test(path)) return null;
  return path;
}

export function fieldIdFromGrowerPath(path: string | null | undefined): number | null {
  if (!path) return null;
  const match = /^\/grower\/fields\/([1-9]\d{0,14})$/.exec(path);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isGrowerPageViewPath(path: string): boolean {
  if (PAGE_VIEWS.has(path)) return true;
  return fieldIdFromGrowerPath(path) != null;
}

/** True when this request is a Next.js prefetch rather than a visit. */
export function isPrefetchRequestHeaders(
  header: (name: string) => string | null,
): boolean {
  const purpose = `${header('purpose') || ''} ${header('sec-purpose') || ''}`.toLowerCase();
  if (purpose.includes('prefetch')) return true;
  if (header('next-router-prefetch')) return true;
  if (header('next-router-segment-prefetch')) return true;
  if (header('x-middleware-prefetch')) return true;
  return false;
}

export function formatChicagoTime(value: unknown): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return CHICAGO.format(date);
}

export function describeGrowerActivity(event: {
  eventType: string;
  path: string | null;
  fieldName: string | null;
  fieldId: number | null;
}): string {
  if (event.eventType === 'login') return 'Signed in';
  if (event.eventType === 'logout') return 'Signed out';
  if (event.path === '/grower/hardware') return 'Probes';
  if (event.path === '/grower/recommendations') return 'Recommendations';
  if (event.path === '/grower/fields') return 'Fields';
  const name = event.fieldName?.trim();
  if (name) return `Field · ${name}`;
  const id = event.fieldId ?? fieldIdFromGrowerPath(event.path);
  if (id) return `Field · ${id}`;
  return 'Page';
}

export function growerAccessPhrase(pilot: boolean, pinSet: boolean): string {
  if (pilot && pinSet) return 'Pilot · PIN set';
  if (pilot) return 'Pilot · No PIN';
  if (pinSet) return 'PIN set · Outside the pilot';
  return 'No PIN · Outside the pilot';
}

export function growerActivityCounts(loginCount: number, viewCount: number): string {
  const signIns = loginCount === 1 ? '1 sign-in' : `${loginCount} sign-ins`;
  const views = viewCount === 1 ? '1 page view' : `${viewCount} page views`;
  return `${signIns} · ${views}`;
}

export function lastSignInPhrase(label: string | null): string {
  return label ? `Last sign-in ${label}` : 'Has not signed in';
}
