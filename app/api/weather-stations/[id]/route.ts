import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.station_name !== undefined) {
      updateData.station_name = body.station_name;
      updateData['station name'] = body.station_name;
    }
    if (body.model !== undefined) updateData.model = body.model;
    if (body.billing_entity !== undefined) {
      updateData.billing_entity = Array.isArray(body.billing_entity) ? body.billing_entity : body.billing_entity ? [parseInt(body.billing_entity, 10)] : [];
    }
    if (body.install_lat !== undefined) updateData.install_lat = body.install_lat;
    if (body.install_lng !== undefined) updateData.install_lng = body.install_lng;
    if (body.install_date !== undefined) updateData.install_date = body.install_date;
    if (body.connectivity_type !== undefined) updateData.connectivity_type = body.connectivity_type;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.price_paid !== undefined) updateData.price_paid = body.price_paid;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.weather_stations}/${id}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to update weather station' }, { status: response.status });
    }

    revalidatePath('/weather-stations');
    const updated = await response.json();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating weather station:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.weather_stations}/${id}/`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Token ${BASEROW_TOKEN}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to delete weather station' }, { status: response.status });
    }

    revalidatePath('/weather-stations');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting weather station:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
