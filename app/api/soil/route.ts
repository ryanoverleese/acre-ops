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
    const query = `SELECT TOP 1 mu.muname, mu.musym FROM mapunit mu INNER JOIN SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${lng} ${lat})') AS res ON mu.mukey = res.mukey`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let rawStatus: number | null = null;
    let rawBody: unknown = null;
    try {
      const res = await fetch('https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `query=${encodeURIComponent(query)}&format=JSON`,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      rawStatus = res.status;
      rawBody = await res.json().catch((e: unknown) => ({ parseError: String(e) }));
    } catch (fetchErr) {
      clearTimeout(timeout);
      return NextResponse.json({ muname: null, musym: null, debug: { error: String(fetchErr) } });
    }
    const data = rawBody as { Table?: unknown[][] };
    if (data?.Table && data.Table.length > 0) {
      const row = data.Table[0];
      return NextResponse.json({ muname: row[0] ?? null, musym: row[1] ?? null });
    }
    return NextResponse.json({ muname: null, musym: null, debug: { status: rawStatus, body: rawBody } });
  } catch (error) {
    return NextResponse.json({ muname: null, musym: null, debug: { error: String(error) } }, { status: 500 });
  }
}
