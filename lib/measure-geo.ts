/**
 * Pure geometry utility functions for the measure tool.
 * No side effects, no dependencies — safe for client or server use.
 */

const EARTH_RADIUS_M = 6_371_008.8; // mean Earth radius in meters (WGS-84)
const SQ_METERS_PER_ACRE = 4_046.856_422_4;
const FEET_PER_METER = 3.280_84;
const FEET_PER_MILE = 5_280;

/** Convert degrees to radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate the great-circle distance between two lat/lng points
 * using the Haversine formula.
 *
 * @returns distance in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Calculate the area of a polygon on a sphere using the spherical excess formula.
 *
 * Uses the shoelace-style summation of signed spherical excess for each edge,
 * which correctly handles polygons of any size on a sphere.
 *
 * @param points - Array of [lat, lng] pairs in degrees. The polygon is
 *   automatically closed (last point connects back to first).
 * @returns area in square meters
 */
export function polygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0;

  const n = points.length;
  let total = 0;

  // Spherical polygon area using the shoelace analog on a sphere.
  // For each vertex i, compute the cross-term:
  //   lng(i) * ( lat(i+1) - lat(i-1) )
  // then multiply by R^2 and take the absolute value.
  // This is valid for small-to-moderate polygons where the planar
  // approximation on projected coordinates holds well.
  //
  // More precisely: project to radians, apply the spherical excess formula
  // that accounts for the cos(lat) scaling of longitude.

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [lat_i, lng_i] = points[i];
    const [lat_j, lng_j] = points[j];

    // Spherical excess cross-product term:
    // sum of (lng2 - lng1) * (2 + sin(lat1) + sin(lat2))
    const lngDiff = toRad(lng_j) - toRad(lng_i);
    total += lngDiff * (2 + Math.sin(toRad(lat_i)) + Math.sin(toRad(lat_j)));
  }

  // The formula gives signed area on a unit sphere scaled by R^2/2
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/**
 * Convert square meters to acres.
 */
export function sqMetersToAcres(sqm: number): number {
  return sqm / SQ_METERS_PER_ACRE;
}

/**
 * Format a distance for display.
 * - Under 1000 feet: whole feet (e.g., "523 ft")
 * - 1000 feet and above: miles to two decimal places (e.g., "1.25 mi")
 */
export function formatDistance(meters: number): string {
  const feet = meters * FEET_PER_METER;

  if (feet < 1_000) {
    return `${Math.round(feet)} ft`;
  }

  const miles = feet / FEET_PER_MILE;
  return `${miles.toFixed(2)} mi`;
}

/**
 * Format an area for display.
 * - Under 0.01 acres: square feet, comma-separated (e.g., "4,356 sq ft")
 * - 0.01 acres and above: acres to two decimal places (e.g., "12.34 ac")
 */
export function formatArea(sqMeters: number): string {
  const acres = sqMetersToAcres(sqMeters);

  if (acres < 0.01) {
    const sqFeet = sqMeters * FEET_PER_METER * FEET_PER_METER;
    return `${Math.round(sqFeet).toLocaleString("en-US")} sq ft`;
  }

  return `${acres.toFixed(2)} ac`;
}
