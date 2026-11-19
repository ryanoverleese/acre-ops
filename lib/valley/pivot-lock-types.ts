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
