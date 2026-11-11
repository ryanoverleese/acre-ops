import { NextRequest, NextResponse } from 'next/server';
import { usgsImageSuffix } from '@/lib/terrain/elevation-request';

const UPSTREAM =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Same-origin proxy for USGS 3DEP ImageServer tiles.
 * Browser → Acre Ops → USGS avoids CORS failures (esp. localhost / some WebViews).
 *
 * The response must not be stored in a shared cache. Netlify's cache key
 * varies the query string only on `__nextDataReq` and `_rsc`, so
 * `Cache-Control: public` made every bbox and size return one raster.
 * Callers also put the bbox and size in the path; those segments are a
 * cache key only and are not forwarded to USGS.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const suffix = usgsImageSuffix(path);
  const dest = new URL(suffix ? `${UPSTREAM}/${suffix}` : UPSTREAM);
  request.nextUrl.searchParams.forEach((value, key) => {
    dest.searchParams.set(key, value);
  });

  let upstream: Response;
  try {
    upstream = await fetch(dest.toString(), {
      headers: { Accept: request.headers.get('Accept') || '*/*' },
      // USGS is occasionally flaky; fail fast enough for map pans.
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('USGS elevation proxy fetch failed', err);
    return NextResponse.json({ error: 'Elevation upstream unreachable' }, { status: 502 });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);
  // Browser may reuse one bbox. The CDN must not: its cache key drops the
  // query string, and a public max-age aliased every tile onto one raster.
  headers.set('Cache-Control', 'private, max-age=900');
  headers.set('Netlify-CDN-Cache-Control', 'no-store');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
