import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function GET() {
  try {
    const url = `${BASEROW_API_URL}/${TABLE_IDS.orders}/?user_field_names=true&size=200`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data.results || []);
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createData: Record<string, unknown> = {};
    if (body.billing_entity) {
      createData.billing_entity = Array.isArray(body.billing_entity)
        ? body.billing_entity
        : [parseInt(body.billing_entity, 10)];
      createData['billing entity'] = createData.billing_entity;
    }
    if (body.order_date) {
      createData.order_date = body.order_date;
      createData['order date'] = body.order_date;
    }
    if (body.status) createData.status = body.status;
    if (body.notes !== undefined) createData.notes = body.notes;
    if (body.quote_valid_days !== undefined) {
      createData.quote_valid_days = body.quote_valid_days;
      createData['quote valid days'] = body.quote_valid_days;
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.orders}/?user_field_names=true`;
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
      return NextResponse.json({ error: 'Failed to create order', details: errorText }, { status: response.status });
    }

    revalidatePath('/orders');
    const newOrder = await response.json();
    return NextResponse.json(newOrder, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
