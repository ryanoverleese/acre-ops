import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createData: Record<string, unknown> = {};
    if (body.order) {
      createData.order = Array.isArray(body.order) ? body.order : [parseInt(body.order, 10)];
    }
    if (body.product) {
      createData.product = Array.isArray(body.product) ? body.product : [parseInt(body.product, 10)];
    }
    if (body.quantity !== undefined) createData.quantity = body.quantity;
    if (body.unit_price !== undefined) {
      createData.unit_price = body.unit_price;
      createData['unit price'] = body.unit_price;
    }
    if (body.notes !== undefined) createData.notes = body.notes;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.order_items}/?user_field_names=true`;
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
      return NextResponse.json({ error: 'Failed to create order item', details: errorText }, { status: response.status });
    }

    revalidatePath('/orders');
    const newItem = await response.json();
    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error('Error creating order item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
