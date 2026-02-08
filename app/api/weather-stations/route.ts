import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function GET() {
  try {
    const url = `${BASEROW_API_URL}/${TABLE_IDS.weather_stations}/?user_field_names=true&size=200`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to fetch weather stations' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data.results || []);
  } catch (error) {
    console.error('Error fetching weather stations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createData: Record<string, unknown> = {};
    if (body.model) createData.model = body.model;
    if (body.billing_entity) createData.billing_entity = Array.isArray(body.billing_entity) ? body.billing_entity : [parseInt(body.billing_entity, 10)];
    if (body.install_lat !== undefined) createData.install_lat = body.install_lat;
    if (body.install_lng !== undefined) createData.install_lng = body.install_lng;
    if (body.install_date) createData.install_date = body.install_date;
    if (body.connectivity_type) createData.connectivity_type = body.connectivity_type;
    if (body.status) createData.status = body.status;
    if (body.price_paid !== undefined) createData.price_paid = body.price_paid;
    if (body.notes) createData.notes = body.notes;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.weather_stations}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to create weather station' }, { status: response.status });
    }

    revalidatePath('/weather-stations');
    const newStation = await response.json();
    return NextResponse.json(newStation, { status: 201 });
  } catch (error) {
    console.error('Error creating weather station:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
