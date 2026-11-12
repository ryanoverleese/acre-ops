import { LEGACY_EQUIPMENT_ROUTES } from '@/lib/equipment-navigation';

/**
 * Routes the app actually serves. Middleware uses this so unknown URLs can
 * 404, while every real page and API keeps the existing auth check.
 * New pages or API roots must be added here; tests/readiness.test.mjs fails
 * when the app directory and this list drift.
 */
const EXACT_PAGES = new Set<string>([
  '/',
  '/login',
  '/map',
  '/operations',
  '/operations/grower-activity',
  '/orders',
  '/install',
  '/inventory',
  '/workflows',
  '/crm',
  '/cropx',
  '/documents',
  '/fields',
  '/route',
  '/season-readiness',
  '/settings',
  '/valley-pivots',
  '/water-recs',
  '/weather-stations',
  '/billing',
  '/billing-entities',
  '/contacts',
  '/probes',
  '/racks',
  '/repairs',
  '/approvals',
  '/planting',
  ...Object.keys(LEGACY_EQUIPMENT_ROUTES),
]);

/** Exact path and its children. Do not use this for "/" . */
const PAGE_PREFIXES = ['/equipment', '/installer', '/pulled', '/mobile', '/grower'];

const DYNAMIC_PAGES = [
  /^\/approve\/[^/]+\/[^/]+$/,
  /^\/review\/[^/]+\/[^/]+$/,
  /^\/field-info\/[^/]+\/[^/]+$/,
];

export const API_ROOTS = new Set<string>([
  'auth',
  'backup',
  'billing',
  'billing-entities',
  'bookings',
  'contacts',
  'debug',
  'documents',
  'elevation',
  'equipment',
  'field-boundaries',
  'field-info',
  'field-seasons',
  'fields',
  'files',
  'gdu',
  'geocode',
  'grower-activity',
  'grower-auth',
  'install',
  'installer',
  'installer-auth',
  'installer-pins',
  'inventory',
  'invoice-lines',
  'invoices',
  'log-removal',
  'mileage',
  'notifications',
  'operations',
  'order-items',
  'orders',
  'ping',
  'plss',
  'probe-assignments',
  'probe-rack',
  'probes',
  'products-services',
  'pulled-today',
  'register',
  'removal',
  'repairs',
  'select-options',
  'soil',
  'usgs-elevation',
  'usgs-lidar',
  'valley',
  'water-recs',
  'weather-stations',
]);

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export function isKnownAppRoute(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (EXACT_PAGES.has(path)) return true;
  if (PAGE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return true;
  if (DYNAMIC_PAGES.some((pattern) => pattern.test(path))) return true;
  const api = /^\/api\/([^/]+)/.exec(path);
  if (api) return API_ROOTS.has(api[1]);
  return false;
}
