import { NextRequest, NextResponse } from 'next/server';
import { fetchElevation } from '@/lib/geo';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 });
  }

  try {
    const elevation = await fetchElevation(Number(lat), Number(lng));
    return NextResponse.json({ elevation });
  } catch (error) {
    console.error('Error fetching elevation:', error);
    return NextResponse.json({ error: 'Failed to fetch elevation' }, { status: 500 });
  }
}
