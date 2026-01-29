import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Feet&wkid=4326`
    );

    if (!response.ok) {
      console.error('USGS API error:', response.status, response.statusText);
      return NextResponse.json({ error: 'Failed to fetch elevation' }, { status: 500 });
    }

    const data = await response.json();

    if (data && data.value !== undefined && data.value !== -1000000) {
      return NextResponse.json({ elevation: Math.round(data.value) });
    }

    return NextResponse.json({ elevation: null });
  } catch (error) {
    console.error('Error fetching elevation:', error);
    return NextResponse.json({ error: 'Failed to fetch elevation' }, { status: 500 });
  }
}
