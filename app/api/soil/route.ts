import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 });
  }

  try {
    const query = `
      SELECT TOP 1 mu.muname, mu.musym
      FROM mapunit mu
      INNER JOIN SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${lng} ${lat})') AS res ON mu.mukey = res.mukey
    `;

    const response = await fetch('https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `query=${encodeURIComponent(query)}&format=JSON`,
    });

    const data = await response.json();

    // Log what USDA returns so we can debug
    console.log('USDA SDA Response:', JSON.stringify(data, null, 2));

    // SDA returns { Table: [ [col1, col2], [val1, val2], ... ] } - first row is headers
    if (data?.Table && data.Table.length > 1) {
      const row = data.Table[1];
      return NextResponse.json({
        muname: row[0],
        musym: row[1]
      });
    }

    // Return the raw data for debugging if Table format doesn't match
    return NextResponse.json({ muname: null, musym: null, debug: data });
  } catch (error) {
    console.error('Error fetching soil data:', error);
    return NextResponse.json({ error: 'Failed to fetch soil data' }, { status: 500 });
  }
}
