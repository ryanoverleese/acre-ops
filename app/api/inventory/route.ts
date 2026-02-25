import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// POST - Create new inventory item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.item_name) payload.item_name = body.item_name;
    if (body.category) payload.category = body.category;
    if (body.quantity !== undefined) payload.quantity = body.quantity;

    const response = await fetch(`${BASEROW_API_URL}/${TABLE_IDS.inventory}/?user_field_names=true`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Baserow error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Create inventory error:', error);
    return NextResponse.json({ error: 'Failed to create inventory item' }, { status: 500 });
  }
}
