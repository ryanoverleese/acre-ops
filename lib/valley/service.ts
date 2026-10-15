import 'server-only';
import { query } from '../supabase/database';
import { createValleyClient, readCredentials } from './client';
import type { FieldPivotStatus, PivotReading } from './types';

export interface PivotLink { field_id: string | number; valley_username: string; serial: string }
type Entry = { expires: number; value: Promise<PivotReading> };
const cache = new Map<string, Entry>();

// Short server-memory cache contains only allowlisted telemetry, never tokens.
// Cache by account AND serial; failures are not retained as successful readings.
export function cachedReader(read: (username: string, serial: string) => Promise<PivotReading>, now = Date.now, entries = cache) {
  return (username: string, serial: string) => {
    const key = JSON.stringify([username, serial]);
    const found = entries.get(key);
    if (found && found.expires > now()) return found.value;
    if (entries.size >= 1000) entries.clear();
    const entry: Entry = { expires: now()+300000, value: Promise.resolve().then(() => read(username,serial)) };
    entry.value = entry.value.catch(error => { if (entries.get(key) === entry) entries.delete(key); throw error; });
    entries.set(key, entry);
    return entry.value;
  };
}
export async function collectFieldPivots(ids: number[], links: PivotLink[], read: (user: string, serial: string) => Promise<PivotReading>) {
  const fields: Record<number, FieldPivotStatus> = Object.fromEntries(ids.map(id => [id,{state:'unlinked',pivots:[]}]));
  const allowed = new Set(ids);
  const jobs = links.filter(link => allowed.has(Number(link.field_id)));
  if (jobs.length > 100) throw new Error('Too many linked pivots');
  let next = 0;
  await Promise.all(Array.from({length: Math.min(4,jobs.length)}, async () => {
    while (next < jobs.length) {
      const link = jobs[next++], row = fields[Number(link.field_id)];
      try {
        const pivot = await read(link.valley_username, link.serial);
        row.pivots.push(pivot);
        if (row.state !== 'unavailable') row.state = 'ready';
      } catch { row.state = 'unavailable'; }
    }
  }));
  for (const row of Object.values(fields)) row.pivots.sort((a,b) => a.serial.localeCompare(b.serial));
  return fields;
}
export async function fieldPivotStatuses(ids: number[]) {
  // Bound the whole batch as well as individual calls; a slow device must not
  // keep a serverless invocation alive while all remaining devices queue up.
  const client = createValleyClient(readCredentials(), fetch, Date.now, AbortSignal.timeout(12000));
  // No name matching. Links must be reviewed before a device is assigned to
  // an Acre field. This is the only DB operation in this integration: SELECT.
  const links = await query<PivotLink & Record<string, unknown>>(
    'SELECT field_id, valley_username, serial FROM public.field_valley_pivots WHERE field_id = ANY($1::bigint[]) ORDER BY field_id, serial', [ids]);
  return collectFieldPivots(ids, links, cachedReader(client.latestPivot));
}
