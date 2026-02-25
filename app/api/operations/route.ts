import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: 'Operation name is required' },
        { status: 400 }
      );
    }

    const createData: Record<string, unknown> = {
      name: body.name,
    };

    if (body.notes) createData.notes = body.notes;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.operations}/?user_field_names=true`;
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
        { error: 'Failed to create operation' },
        { status: response.status }
      );
    }

    const newOperation = await response.json();
    return NextResponse.json(newOperation, { status: 201 });
  } catch (error) {
    console.error('Error creating operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
