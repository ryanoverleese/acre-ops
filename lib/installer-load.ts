import 'server-only';
import { getCachedRows, getRows } from '@/lib/supabase/adapter';

type Table = Parameters<typeof getCachedRows>[0];

/** Shared installer-route TTLs so cache lifetime does not drift per endpoint. */
export const INSTALLER_TTL = {
  repairs: 30,
  probe_assignments: 30,
  field_seasons: 60,
  fields: 120,
  probes: 120,
  probe_rack: 120,
  billing_entities: 300,
  operations: 300,
  contacts: 300,
} as const;

export function parseFresh(searchParams: URLSearchParams): boolean {
  return searchParams.get('fresh') === '1';
}

/**
 * Read a table for an installer API route.
 * `fresh=1` skips the cache (crew pull-to-refresh); otherwise use the shared TTL.
 */
export function loadTable<T>(table: Table, ttlSeconds: number, fresh = false): Promise<T[]> {
  return fresh ? getRows<T>(table) : getCachedRows<T>(table, undefined, ttlSeconds);
}
