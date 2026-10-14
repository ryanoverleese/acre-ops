import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';
import { revalidatePath } from 'next/cache';


export const PATCH = withApiAuth(async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.quantity !== undefined) updateData.quantity = body.quantity;
    if (body.unit_price !== undefined) {
      updateData.unit_price = body.unit_price;
      updateData['unit price'] = body.unit_price;
    }
    if (body.notes !== undefined) updateData.notes = body.notes;

    const url = { table: 'order_items', id: id };
    const response = await dataRequest(url, { method: 'PATCH', body: JSON.stringify(updateData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to update order item', details: errorText }, { status: response.status });
    }

    bustTableCache('order_items');
    revalidatePath('/orders');
    const updated = await response.json();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating order item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const DELETE = withApiAuth(async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const url = { table: 'order_items', id: id };
    const response = await dataRequest(url, { method: 'DELETE' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to delete order item' }, { status: response.status });
    }

    bustTableCache('order_items');
    revalidatePath('/orders');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting order item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
