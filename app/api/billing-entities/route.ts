import { NextRequest, NextResponse } from 'next/server';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const TABLE_ID = 817297; // billing_entities table

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BASEROW_API_URL}/${TABLE_ID}/?user_field_names=true`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating billing entity:', error);
    return NextResponse.json({ error: 'Failed to create billing entity' }, { status: 500 });
  }
}
