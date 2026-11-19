// Browser-safe geometry for the grower pivot icon. No Valley calls, no DB.
import { pivotArm } from './types';

export interface GrowerPivotIconData {
  /** Reported arm angle, degrees clockwise from north. */
  angle: number;
  /** True only when Valley reports power ON. OFF, IDLE and unknown are drawn gray. */
  on: boolean;
}
export interface IconPoint { x: number; y: number }

const ICON_CENTER = 20;
const ICON_RADIUS = 14;
const ACRE_M2 = 4046.8564224;

export function iconArmEnd(angle: number): IconPoint {
  return pivotArm(angle);
}

/**
 * Where the probe dot sits inside the 40x40 icon, using the same north-up,
 * clockwise convention as the arm. Bearing is from the field center to the
 * probe; distance is scaled by the radius of a circle with the field's acres
 * (clamped so the dot stays visibly inside the track). Null when unknown.
 */
export function probeDotPosition(
  center: { lat: number | null; lng: number | null },
  probe: { lat: number | null; lng: number | null } | null,
  acres: number | null,
): IconPoint | null {
  if (!probe || center.lat == null || center.lng == null || probe.lat == null || probe.lng == null) return null;
  if (![center.lat, center.lng, probe.lat, probe.lng].every(Number.isFinite)) return null;
  const metersPerDegLat = 111320;
  const north = (probe.lat - center.lat) * metersPerDegLat;
  const east = (probe.lng - center.lng) * metersPerDegLat * Math.cos(center.lat * Math.PI / 180);
  const distance = Math.hypot(north, east);
  if (!Number.isFinite(distance)) return null;
  let fraction = 0.6;
  if (acres != null && Number.isFinite(acres) && acres > 0) {
    const fieldRadius = Math.sqrt(acres * ACRE_M2 / Math.PI);
    fraction = Math.min(0.85, Math.max(0.25, distance / fieldRadius));
  }
  if (distance < 1) return { x: ICON_CENTER, y: ICON_CENTER - ICON_RADIUS * 0.25 };
  const bearing = Math.atan2(east, north);
  return {
    x: ICON_CENTER + Math.sin(bearing) * ICON_RADIUS * fraction,
    y: ICON_CENTER - Math.cos(bearing) * ICON_RADIUS * fraction,
  };
}
