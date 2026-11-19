// Browser-safe shapes for the locked pivot snapshot. No Valley calls, no DB.
export interface LockedPivot {
  /** Pivot link: device serial from field_valley_pivots. */
  serial: string;
  /** Arm angle at lock time, degrees clockwise from north, 0 to <360. */
  angle: number;
  /** True only when the pivot reported power ON. */
  on: boolean;
}
export interface PivotLockPreview {
  fieldSeasonId: number;
  date: string;
  capturedAt: string;
  pivots: LockedPivot[];
  /** Server-signed lock; sent back with the rec save. */
  token: string;
}
export type PivotLockSaveResult =
  | { status: 'saved' | 'kept'; capturedAt: string; pivots: LockedPivot[] }
  | { status: 'failed' | 'invalid' };

// "Live, 4 min ago" from the device's own report time. Unknown is never shown as fresh.
export function liveAgeLabel(observedAt: string | null, behind: boolean | null, now: number | undefined): string {
  if (!observedAt || now === undefined) return 'Live, age unknown';
  const ms = now - Date.parse(observedAt);
  if (!Number.isFinite(ms) || ms < -300000) return 'Live, age unknown';
  const min = Math.max(0, Math.round(ms / 60000));
  const age = min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} hr ${min % 60} min ago`;
  const stale = behind === true || ms > 90 * 60000;
  return `Live, ${age}${stale ? ' (old reading)' : ''}`;
}
