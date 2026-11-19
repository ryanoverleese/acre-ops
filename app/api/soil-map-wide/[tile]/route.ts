import { NextRequest, NextResponse } from 'next/server';
import { fetchWideSoils } from '@/lib/soils/fetch-ssurgo';
import { parseWideTileKey } from '@/lib/soils/wide';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Public USDA data keyed by a fixed 0.1° tile in the path, so the CDN can cache it.
const CACHE = {
  'Cache-Control': 'public, max-age=86400',
  'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=86400',
};
const NO_STORE = {
  'Cache-Control': 'private, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'no-store',
};

/** Simplified SSURGO map units for one 0.1° tile, for the zoomed-out Soils view. */
export async function GET(_request: NextRequest, context: { params: Promise<{ tile: string }> }) {
  const { tile } = await context.params;
  const box = parseWideTileKey(decodeURIComponent(tile));
  if (!box) return NextResponse.json({ error: 'Bad tile' }, { status: 400, headers: NO_STORE });
  try {
    const map = await fetchWideSoils(box);
    return NextResponse.json(map, { headers: CACHE });
  } catch (err) {
    console.error('Wide soil map lookup failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'USDA soil service is not responding' }, { status: 502, headers: NO_STORE });
  }
}
