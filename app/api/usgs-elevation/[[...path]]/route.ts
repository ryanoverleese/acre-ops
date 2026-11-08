import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer';

/**
 * Same-origin proxy for USGS 3DEP ImageServer tiles.
 * Browser → Acre Ops → USGS avoids CORS failures (esp. localhost / some WebViews).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const suffix = (path ?? []).map(encodeURIComponent).join('/');
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
  headers.set('Cache-Control', 'public, max-age=900');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
