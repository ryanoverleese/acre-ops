import { NextRequest, NextResponse } from 'next/server';
import {
  footprintsFromImageServer,
  lidarLabel,
  parseLidarPoint,
  sourcesFromIndex,
} from '@/lib/terrain/lidar-source';

const INDEX =
  'https://index.nationalmap.gov/arcgis/rest/services/3DEPElevationIndex/MapServer/11/query';
const FOOTPRINTS =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/query';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LONG_CACHE = {
  'Cache-Control': 'public, max-age=86400',
  // The point is a path segment, so it is part of the CDN cache key.
  // This lookup is public and changes only when USGS publishes a new DEM.
  'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
};

const NO_STORE = {
  'Cache-Control': 'private, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'no-store',
};

/**
 * Lidar project and collection year for one field point.
 * Does not touch the elevation raster proxy.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ point: string }> },
) {
  const { point } = await context.params;
  const parsed = parseLidarPoint(point);
  if (!parsed) {
    return NextResponse.json({ label: null }, { status: 400, headers: NO_STORE });
  }

  try {
    const [indexBody, footprintBody] = await Promise.all([
      fetchJson(indexUrl(parsed.lat, parsed.lng)),
      fetchJson(footprintUrl(parsed.lat, parsed.lng)),
    ]);
    const label = lidarLabel(
      footprintsFromImageServer(footprintBody),
      sourcesFromIndex(indexBody),
    );
    return NextResponse.json({ label }, { headers: LONG_CACHE });
  } catch (err) {
    console.error('USGS lidar source lookup failed', err);
    return NextResponse.json({ label: null }, { headers: NO_STORE });
  }
}

function indexUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'project,workunit,collect_start,collect_end,dem_gsd_meters,p_method',
    returnGeometry: 'false',
    f: 'json',
  });
  return `${INDEX}?${params.toString()}`;
}

function footprintUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Name,Best,LowPS,MaxPS',
    returnGeometry: 'false',
    where: "Name NOT LIKE 'Ov%'",
    f: 'json',
  });
  return `${FOOTPRINTS}?${params.toString()}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`usgs ${response.status}`);
  return response.json();
}
