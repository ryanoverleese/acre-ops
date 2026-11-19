import 'server-only';
import { cache } from 'react';
import { query } from '../supabase/database';
import { growerQuery, withGrowerOperation } from '../supabase/grower';
import { positiveId } from '../supabase/registry';
import { createValleyClient, readCredentials, valleyEnabled } from './client';
import { cachedReader, type PivotLink } from './service';
import { readingFreshness } from './types';
import type { GrowerPivotIconData } from './grower-icon';

/**
 * Live pivot snapshot for ONE field on the signed-in grower's own farm.
 *
 * - Ownership: the field must be visible through public.grower_fields while
 *   app.grower_operation_id is set to the session's operation (same RLS gate
 *   the field page uses). Otherwise nothing is read from Valley.
 * - Read-only: SELECT on field_valley_pivots, GET-only Valley status. Nothing
 *   is written; readings live only in the 5-minute server memory cache shared
 *   with the staff badges. No history, control, scheduling, or API route.
 * - Only angle + ON/not-ON leave this function. Laterals, stale, age-unknown
 *   and failed readings return nothing (icon hidden, no words).
 */
export const growerFieldPivots = cache(async (operationId: number, fieldId: number): Promise<GrowerPivotIconData[]> => {
  if (!valleyEnabled()) return [];
  let op: number, field: number;
  try { op = positiveId(operationId); field = positiveId(fieldId); } catch { return []; }
  try {
    const owned = await withGrowerOperation(op, () =>
      growerQuery<{ id: unknown }>('SELECT id FROM public.grower_fields WHERE id = $1 LIMIT 1', [field]));
    if (!owned.length || positiveId(owned[0].id) !== field) return [];

    const links = await query<PivotLink & Record<string, unknown>>(
      'SELECT field_id, valley_username, serial FROM public.field_valley_pivots WHERE field_id = $1 ORDER BY serial LIMIT 4',
      [field],
    );
    if (!links.length) return [];

    const client = createValleyClient(readCredentials(), fetch, Date.now, AbortSignal.timeout(8000));
    const read = cachedReader(client.latestPivot);
    const now = Date.now();
    const readings = await Promise.all(links.map(link => read(link.valley_username, link.serial).catch(() => null)));
    // A partial failure must not look like an all-clear: show nothing.
    if (readings.some(r => r === null)) return [];
    return readings.flatMap(r => {
      if (!r || r.isLateral || r.angle === null || readingFreshness(r, now) !== 'recent') return [];
      return [{ angle: r.angle, on: r.power === 'ON' }];
    });
  } catch {
    return [];
  }
});
