import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { query } from '../supabase/database';
import { DataError, positiveId } from '../supabase/registry';
import { createValleyClient, readCredentials, valleyEnabled } from './client';
import type { PivotLink } from './service';
import { readingFreshness, type PivotReading } from './types';
import type { LockedPivot, PivotLockPreview } from './pivot-lock-types';

/**
 * "Lock pivot position" for a water rec.
 *
 * - capturePivotLock: staff-only (route is admin-gated). Reads the field's
 *   linked pivot(s) ONCE with GET-only Valley status, bypassing the 5-minute
 *   badge cache so the lock is as fresh as the device's last report. Keeps only
 *   serial, arm angle and ON/not-ON. Returns a preview plus a signed lock token.
 *   Nothing is stored yet, so staff can re-lock as often as they like.
 * - verifyPivotLock: the save route accepts only a token this server signed for
 *   the same field season and report date, so the browser cannot invent angles.
 * - savePivotSnapshot: stores the lock with the saved rec. If that rec already
 *   has a snapshot it is kept (fixed once saved) and returned instead.
 */

const LOCK_VERSION = 'rec-pivot-lock-v1';
const LOCK_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PIVOTS = 4;

function lockKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) throw new DataError('Authentication is not configured', 500);
  // Derived key: a lock token can never be confused with a session cookie.
  return createHmac('sha256', secret).update(LOCK_VERSION).digest();
}
function sign(payload: string, env?: NodeJS.ProcessEnv): string {
  return createHmac('sha256', lockKey(env)).update(payload).digest('base64url');
}

export function normalizeAngle(angle: number): number {
  const a = Math.round((((angle % 360) + 360) % 360) * 10) / 10;
  return a >= 360 ? 0 : a;
}

interface LockPayload { v: 1; fs: number; d: string; at: string; p: [string, number, boolean][] }

export function signPivotLock(fieldSeasonId: number, date: string, capturedAt: string, pivots: LockedPivot[], env?: NodeJS.ProcessEnv): string {
  const payload: LockPayload = { v: 1, fs: fieldSeasonId, d: date, at: capturedAt, p: pivots.map(x => [x.serial, x.angle, x.on]) };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, env)}`;
}

export function verifyPivotLock(token: unknown, fieldSeasonId: number, date: string, now = Date.now(), env?: NodeJS.ProcessEnv):
  { capturedAt: string; pivots: LockedPivot[] } | null {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const at = token.lastIndexOf('.');
  if (at <= 0) return null;
  const body = token.slice(0, at), mac = Buffer.from(token.slice(at + 1));
  const expected = Buffer.from(sign(body, env));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  let payload: LockPayload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || payload.v !== 1 || payload.fs !== fieldSeasonId || payload.d !== date) return null;
  const captured = Date.parse(payload.at);
  if (!Number.isFinite(captured) || captured > now + 60000 || now - captured > LOCK_TTL_MS) return null;
  if (!Array.isArray(payload.p) || !payload.p.length || payload.p.length > MAX_PIVOTS) return null;
  const pivots: LockedPivot[] = [];
  for (const entry of payload.p) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [serial, angle, on] = entry;
    if (typeof serial !== 'string' || !/^\d{1,20}$/.test(serial)) return null;
    if (typeof angle !== 'number' || !(angle >= 0 && angle < 360)) return null;
    if (typeof on !== 'boolean') return null;
    pivots.push({ serial, angle, on });
  }
  return { capturedAt: new Date(captured).toISOString(), pivots };
}

/** Turn live readings into a lock, or explain plainly why it cannot lock. */
export function lockFromReadings(readings: PivotReading[], now: number): LockedPivot[] {
  if (!readings.length) throw new DataError('No pivot is linked to this field', 404);
  const out: LockedPivot[] = [];
  for (const r of readings) {
    if (r.isLateral) throw new DataError('Lateral pivot: there is no arm position to lock', 409);
    if (r.angle === null) throw new DataError('Pivot did not report an arm position. Try again shortly', 409);
    const fresh = readingFreshness(r, now);
    if (fresh === 'stale') throw new DataError('Pivot reading is old, so it cannot be locked. Try again after it reports', 409);
    if (fresh === 'unknown') throw new DataError('Pivot reading time is unknown, so it cannot be locked', 409);
    out.push({ serial: r.serial, angle: normalizeAngle(r.angle), on: r.power === 'ON' });
  }
  return out.sort((a, b) => a.serial.localeCompare(b.serial));
}

export async function capturePivotLock(fieldSeasonIdRaw: unknown, dateRaw: unknown, deps: {
  read?: (username: string, serial: string) => Promise<PivotReading>;
  now?: () => number;
} = {}): Promise<PivotLockPreview> {
  if (!valleyEnabled()) throw new DataError('Pivot readings are turned off', 409);
  const fieldSeasonId = positiveId(fieldSeasonIdRaw);
  if (typeof dateRaw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) throw new DataError('Report date is required', 400);
  const seasons = await query<{ field_id: unknown }>('SELECT field_id FROM public.field_seasons WHERE id = $1', [fieldSeasonId]);
  if (!seasons.length || seasons[0].field_id == null) throw new DataError('Field season not found', 404);
  const fieldId = positiveId(seasons[0].field_id);
  const links = await query<PivotLink & Record<string, unknown>>(
    'SELECT field_id, valley_username, serial FROM public.field_valley_pivots WHERE field_id = $1 ORDER BY serial LIMIT 5',
    [fieldId],
  );
  if (!links.length) throw new DataError('No pivot is linked to this field', 404);
  if (links.length > MAX_PIVOTS) throw new DataError('Too many pivots linked to this field', 409);
  // Fresh GET per lock (no 5-minute cache): the lock should be the newest report.
  const read = deps.read ?? createValleyClient(readCredentials(), fetch, Date.now, AbortSignal.timeout(12000)).latestPivot;
  let readings: PivotReading[];
  try {
    readings = await Promise.all(links.map(link => read(link.valley_username, link.serial)));
  } catch {
    // A partial failure must not lock a partial picture.
    throw new DataError('Pivot reading unavailable. Try again shortly', 503);
  }
  const now = (deps.now ?? Date.now)();
  const pivots = lockFromReadings(readings, now);
  const capturedAt = new Date(now).toISOString();
  return { fieldSeasonId, date: dateRaw, capturedAt, pivots, token: signPivotLock(fieldSeasonId, dateRaw, capturedAt, pivots) };
}

/** Rows already locked for a rec, oldest-serial first. */
export async function snapshotForRec(recId: number): Promise<{ capturedAt: string; pivots: LockedPivot[] } | null> {
  const rows = await query<{ pivot_serial: string; arm_angle: unknown; pivot_on: boolean; captured_at: Date | string }>(
    `SELECT pivot_serial, arm_angle, pivot_on, captured_at
       FROM public.water_rec_pivot_snapshots WHERE water_rec_id = $1 ORDER BY pivot_serial`,
    [recId],
  );
  if (!rows.length) return null;
  return {
    capturedAt: new Date(rows[0].captured_at).toISOString(),
    pivots: rows.map(r => ({ serial: r.pivot_serial, angle: Number(r.arm_angle), on: r.pivot_on === true })),
  };
}

/**
 * Store a verified lock with a saved rec. Must run inside the save transaction.
 * Wrapped in a savepoint so a missing table (migration not applied yet) or any
 * snapshot error never loses the rec itself.
 */
export async function savePivotSnapshot(recId: number, lock: { capturedAt: string; pivots: LockedPivot[] }):
  Promise<{ status: 'saved' | 'kept'; capturedAt: string; pivots: LockedPivot[] } | { status: 'failed' }> {
  await query('SAVEPOINT rec_pivot_lock');
  try {
    const existing = await snapshotForRec(recId);
    if (existing) { await query('RELEASE SAVEPOINT rec_pivot_lock'); return { status: 'kept', ...existing }; }
    await query(
      `INSERT INTO public.water_rec_pivot_snapshots (water_rec_id, pivot_serial, arm_angle, pivot_on, captured_at)
       SELECT $1, x.serial, x.angle, x.pivot_on, $5::timestamptz
         FROM unnest($2::text[], $3::numeric[], $4::boolean[]) AS x(serial, angle, pivot_on)`,
      [recId, lock.pivots.map(p => p.serial), lock.pivots.map(p => p.angle), lock.pivots.map(p => p.on), lock.capturedAt],
    );
    await query('RELEASE SAVEPOINT rec_pivot_lock');
    return { status: 'saved', capturedAt: lock.capturedAt, pivots: lock.pivots };
  } catch {
    await query('ROLLBACK TO SAVEPOINT rec_pivot_lock').catch(() => {});
    await query('RELEASE SAVEPOINT rec_pivot_lock').catch(() => {});
    return { status: 'failed' };
  }
}

/** Staff page: every saved snapshot, keyed by rec id. Empty if the table is not there yet. */
export async function loadRecPivotSnapshots(): Promise<Record<number, { capturedAt: string; pivots: LockedPivot[] }>> {
  try {
    const rows = await query<{ water_rec_id: unknown; pivot_serial: string; arm_angle: unknown; pivot_on: boolean; captured_at: Date | string }>(
      `SELECT water_rec_id, pivot_serial, arm_angle, pivot_on, captured_at
         FROM public.water_rec_pivot_snapshots ORDER BY water_rec_id, pivot_serial`,
    );
    const out: Record<number, { capturedAt: string; pivots: LockedPivot[] }> = {};
    for (const r of rows) {
      const id = Number(r.water_rec_id);
      out[id] ??= { capturedAt: new Date(r.captured_at).toISOString(), pivots: [] };
      out[id].pivots.push({ serial: r.pivot_serial, angle: Number(r.arm_angle), on: r.pivot_on === true });
    }
    return out;
  } catch {
    return {};
  }
}
