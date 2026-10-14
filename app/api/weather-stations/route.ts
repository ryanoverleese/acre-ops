import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';
import { revalidatePath } from 'next/cache';


export const GET = withApiAuth(async function GET() {
  try {
    const url = { table: 'weather_stations' };
    const response = await dataRequest(url, {  });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to fetch weather stations' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data.results || []);
  } catch (error) {
    console.error('Error fetching weather stations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createData: Record<string, unknown> = {};
    if (body.station_name !== undefined) {
      createData.station_name = body.station_name;
      createData['station name'] = body.station_name;
    }
    if (body.model) createData.model = body.model;
    if (body.billing_entity) createData.billing_entity = Array.isArray(body.billing_entity) ? body.billing_entity : [parseInt(body.billing_entity, 10)];
    if (body.install_lat !== undefined) createData.install_lat = body.install_lat;
    if (body.install_lng !== undefined) createData.install_lng = body.install_lng;
    if (body.install_date) createData.install_date = body.install_date;
    if (body.connectivity_type) createData.connectivity_type = body.connectivity_type;
    if (body.status) createData.status = body.status;
    if (body.price_paid !== undefined) createData.price_paid = body.price_paid;
    if (body.notes) createData.notes = body.notes;

    const url = { table: 'weather_stations' };
    const response = await dataRequest(url, { method: 'POST', body: JSON.stringify(createData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to create weather station' }, { status: response.status });
    }

    bustTableCache('weather_stations');
    revalidatePath('/weather-stations');
    const newStation = await response.json();
    return NextResponse.json(newStation, { status: 201 });
  } catch (error) {
    console.error('Error creating weather station:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
