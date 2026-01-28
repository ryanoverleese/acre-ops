import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.field_season) {
      return NextResponse.json(
        { error: 'Field season is required' },
        { status: 400 }
      );
    }

    const createData: Record<string, unknown> = {
      field_season: [body.field_season],
      date: body.date || new Date().toISOString().split('T')[0],
    };

    if (body.recommendation) createData.recommendation = body.recommendation;
    if (body.suggested_water_day) createData.suggested_water_day = body.suggested_water_day;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.water_recs}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create water recommendation' },
        { status: response.status }
      );
    }

    const newRec = await response.json();
    return NextResponse.json(newRec, { status: 201 });
  } catch (error) {
    console.error('Error creating water recommendation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
