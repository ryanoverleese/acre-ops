import { NextRequest, NextResponse } from 'next/server';
import { fetchSoilMap } from '@/lib/soils/fetch-ssurgo';
import { parseSoilBboxKey } from '@/lib/soils/ssurgo';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public USDA data keyed by a snapped box in the path, so the CDN can cache it.
const CURRENT_CACHE = {
  'Cache-Control': 'public, max-age=86400',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
};
// Backup answers are cached briefly so the current survey replaces them once SDA is back.
const BACKUP_CACHE = {
  'Cache-Control': 'public, max-age=900',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=900',
};
const NO_STORE = {
  'Cache-Control': 'private, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'no-store',
};

/** SSURGO soil map units (symbol, name, outlines) inside one small box around a field. */
export async function GET(_request: NextRequest, context: { params: Promise<{ bbox: string }> }) {
  const { bbox } = await context.params;
  const box = parseSoilBboxKey(decodeURIComponent(bbox));
  if (!box) return NextResponse.json({ error: 'Bad box' }, { status: 400, headers: NO_STORE });
  try {
    const map = await fetchSoilMap(box);
    return NextResponse.json(map, { headers: map.source === 'sda' ? CURRENT_CACHE : BACKUP_CACHE });
  } catch (err) {
    console.error('Soil map lookup failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'USDA soil service is not responding' }, { status: 502, headers: NO_STORE });
  }
}
