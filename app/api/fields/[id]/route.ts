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
    const fieldId = parseInt(id, 10);

    if (isNaN(fieldId)) {
      return NextResponse.json(
        { error: 'Invalid field ID' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Build the update payload - only include fields that were provided
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.acres !== undefined) {
      updateData.acres = body.acres;
    }
    if (body.lat !== undefined) {
      updateData.lat = body.lat;
    }
    if (body.lng !== undefined) {
      updateData.lng = body.lng;
    }

    // Make the PATCH request to Baserow
    const url = `${BASEROW_API_URL}/${TABLE_IDS.fields}/${fieldId}/?user_field_names=true`;

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
        { error: 'Failed to update field in database' },
        { status: response.status }
      );
    }

    const updatedField = await response.json();

    return NextResponse.json(updatedField);
  } catch (error) {
    console.error('Error updating field:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const fieldId = parseInt(id, 10);

    if (isNaN(fieldId)) {
      return NextResponse.json(
        { error: 'Invalid field ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.fields}/${fieldId}/?user_field_names=true`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Field not found' },
        { status: response.status }
      );
    }

    const field = await response.json();

    return NextResponse.json(field);
  } catch (error) {
    console.error('Error fetching field:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
