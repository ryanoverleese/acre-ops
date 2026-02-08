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
    if (body.billing_entity !== undefined) {
      updateData.billing_entity = Array.isArray(body.billing_entity)
        ? body.billing_entity
        : body.billing_entity ? [parseInt(body.billing_entity, 10)] : [];
      updateData['billing entity'] = updateData.billing_entity;
    }
    if (body.order_date !== undefined) {
      updateData.order_date = body.order_date;
      updateData['order date'] = body.order_date;
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.quote_valid_days !== undefined) {
      updateData.quote_valid_days = body.quote_valid_days;
      updateData['quote valid days'] = body.quote_valid_days;
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.orders}/${id}/?user_field_names=true`;
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
      return NextResponse.json({ error: 'Failed to update order', details: errorText }, { status: response.status });
    }

    revalidatePath('/orders');
    const updated = await response.json();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.orders}/${id}/`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Token ${BASEROW_TOKEN}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to delete order' }, { status: response.status });
    }

    revalidatePath('/orders');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
