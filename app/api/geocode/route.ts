import { NextRequest, NextResponse } from 'next/server';

// US Census Bureau Geocoding API - free, no API key required
const CENSUS_GEOCODE_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address parameter is required' }, { status: 400 });
    }

    const params = new URLSearchParams({
      address: address,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });

    const response = await fetch(`${CENSUS_GEOCODE_URL}?${params.toString()}`);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Geocoding service unavailable' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Check if we got any matches
    const matches = data.result?.addressMatches;
    if (!matches || matches.length === 0) {
      return NextResponse.json(
        { error: 'No location found for this address. Try a different format or use the map picker.' },
        { status: 404 }
      );
    }

    // Get the first (best) match
    const match = matches[0];
    const coordinates = match.coordinates;

    // Round to 6 decimal places (Baserow limit)
    const lat = Math.round(coordinates.y * 1000000) / 1000000;
    const lng = Math.round(coordinates.x * 1000000) / 1000000;

    return NextResponse.json({
      lat,
      lng,
      matchedAddress: match.matchedAddress,
      tigerLineId: match.tigerLine?.tigerLineId,
    });
  } catch (error) {
    console.error('Geocoding error:', error);
    return NextResponse.json({ error: 'Failed to geocode address' }, { status: 500 });
  }
}
