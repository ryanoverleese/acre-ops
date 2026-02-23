import { NextRequest, NextResponse } from 'next/server';
import { fetchSoilData } from '@/lib/geo';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 });
  }

  try {
    const { muname, musym } = await fetchSoilData(Number(lat), Number(lng));
    return NextResponse.json({ muname, musym });
  } catch (error) {
    console.error('Error fetching soil data:', error);
    return NextResponse.json({ error: 'Failed to fetch soil data' }, { status: 500 });
  }
}
