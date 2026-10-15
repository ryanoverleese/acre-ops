// Browser-safe DTOs. No account logins, credentials, tokens, or raw responses.
export interface PivotReading {
  serial: string;
  name: string;
  angle: number | null;
  power: 'ON' | 'OFF' | 'IDLE' | null;
  direction: 'FWD' | 'REV' | 'IDLE' | 'N' | 'S' | 'E' | 'W' | null;
  isLateral: boolean;
  reportedLocalTime: string | null;
  observedAt: string | null;
  behind: boolean | null;
}
export type FieldPivotStatus = {
  state: 'ready' | 'unlinked' | 'unavailable';
  pivots: PivotReading[];
};
export interface ValleyStatusResponse {
  enabled: boolean;
  fields: Record<number, FieldPivotStatus>;
}

// A missing timestamp/offset is unknown, NOT fresh. Never infer time zone
// from the browser or server; Valley reports dates in the device's local zone.
export function readingFreshness(reading: PivotReading, now = Date.now()): 'recent' | 'stale' | 'unknown' {
  if (reading.behind === true) return 'stale';
  if (!reading.observedAt) return 'unknown';
  const age = now - Date.parse(reading.observedAt);
  if (!Number.isFinite(age) || age < -300000) return 'unknown';
  return age > 90 * 60000 ? 'stale' : 'recent';
}

export function pivotArm(angle: number): { x: number; y: number } {
  const radians = angle * Math.PI / 180;
  return { x: 20 + Math.sin(radians) * 14, y: 20 - Math.cos(radians) * 14 };
}
