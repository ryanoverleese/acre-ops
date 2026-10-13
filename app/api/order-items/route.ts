import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';


export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createData: Record<string, unknown> = {};
    if (body.order) {
      const orderVal = Array.isArray(body.order) ? body.order : [parseInt(body.order, 10)];
      createData.order_link = orderVal;
      createData['order link'] = orderVal;
    }
    if (body.product) {
      const productVal = Array.isArray(body.product) ? body.product : [parseInt(body.product, 10)];
      createData.product = productVal;
    }
    if (body.quantity !== undefined) createData.quantity = body.quantity;
    if (body.unit_price !== undefined) {
      createData.unit_price = body.unit_price;
      createData['unit price'] = body.unit_price;
    }
    if (body.notes !== undefined) createData.notes = body.notes;

    const url = { table: 'order_items' };
    const response = await dataRequest(url, { method: 'POST', body: JSON.stringify(createData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to create order item', details: errorText }, { status: response.status });
    }

    bustTableCache('order_items');
    revalidatePath('/orders');
    const newItem = await response.json();
    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error('Error creating order item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
