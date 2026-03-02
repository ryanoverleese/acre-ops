import { NextRequest, NextResponse } from 'next/server';
import { plssForwardLookup, plssReverseLookup } from '@/lib/plss';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = params.get('lat');
  const lng = params.get('lng');
  const township = params.get('township');
  const range = params.get('range');
  const section = params.get('section');

  // Reverse lookup: lat/lng -> T/R/S
  if (lat && lng) {
    try {
      const result = await plssReverseLookup(Number(lat), Number(lng));
      if (!result) {
        return NextResponse.json({ error: 'No PLSS data found for this location' }, { status: 404 });
      }
      return NextResponse.json(result);
    } catch (error) {
      console.error('PLSS reverse lookup error:', error);
      return NextResponse.json({ error: 'Failed to look up PLSS data' }, { status: 500 });
    }
  }

  // Forward lookup: T/R/S -> coordinates
  if (township && range && section) {
    try {
      const result = await plssForwardLookup(Number(township), Number(range), Number(section));
      if (!result) {
        return NextResponse.json({ error: 'Section not found' }, { status: 404 });
      }
      return NextResponse.json(result);
    } catch (error) {
      console.error('PLSS forward lookup error:', error);
      return NextResponse.json({ error: 'Failed to look up section' }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: 'Provide lat+lng (reverse) or township+range+section (forward)' },
    { status: 400 },
  );
}
