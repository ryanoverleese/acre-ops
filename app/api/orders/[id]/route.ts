import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';


export const PATCH = withApiAuth(async function PATCH(
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

    const url = { table: 'orders', id: id };
    const response = await dataRequest(url, { method: 'PATCH', body: JSON.stringify(updateData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to update order', details: errorText }, { status: response.status });
    }

    bustTableCache('orders');
    revalidatePath('/orders');
    const updated = await response.json();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const DELETE = withApiAuth(async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const url = { table: 'orders', id: id };
    const response = await dataRequest(url, { method: 'DELETE' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to delete order' }, { status: response.status });
    }

    bustTableCache('orders');
    revalidatePath('/orders');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
