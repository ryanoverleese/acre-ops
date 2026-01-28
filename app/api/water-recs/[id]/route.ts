import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const recId = parseInt(id, 10);

    if (isNaN(recId)) {
      return NextResponse.json(
        { error: 'Invalid water recommendation ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.recommendation !== undefined) updateData.recommendation = body.recommendation;
    if (body.suggested_water_day !== undefined) updateData.suggested_water_day = body.suggested_water_day;
    if (body.date !== undefined) updateData.date = body.date;
    if (body.field_season !== undefined) {
      updateData.field_season = body.field_season ? [body.field_season] : [];
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.water_recs}/${recId}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update water recommendation' },
        { status: response.status }
      );
    }

    const updated = await response.json();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating water recommendation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const recId = parseInt(id, 10);

    if (isNaN(recId)) {
      return NextResponse.json(
        { error: 'Invalid water recommendation ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.water_recs}/${recId}/`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to delete water recommendation' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting water recommendation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
