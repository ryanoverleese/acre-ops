import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Field name is required' },
        { status: 400 }
      );
    }

    // Build the create payload
    const createData: Record<string, unknown> = {
      name: body.name,
    };

    if (body.acres !== undefined) {
      createData.acres = body.acres;
    }
    if (body.lat !== undefined) {
      createData.lat = body.lat;
    }
    if (body.lng !== undefined) {
      createData.lng = body.lng;
    }
    if (body.billing_entity !== undefined) {
      createData.billing_entity = body.billing_entity;
    }

    // Make the POST request to Baserow
    const url = `${BASEROW_API_URL}/${TABLE_IDS.fields}/?user_field_names=true`;

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
        { error: 'Failed to create field in database' },
        { status: response.status }
      );
    }

    const newField = await response.json();

    return NextResponse.json(newField, { status: 201 });
  } catch (error) {
    console.error('Error creating field:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
