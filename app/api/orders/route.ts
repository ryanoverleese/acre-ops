import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';
import { revalidatePath } from 'next/cache';


export const GET = withApiAuth(async function GET() {
  try {
    const url = { table: 'orders' };
    const response = await dataRequest(url, {  });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data.results || []);
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const POST = withApiAuth(async function POST(request: NextRequest) {
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

    const url = { table: 'orders' };
    const response = await dataRequest(url, { method: 'POST', body: JSON.stringify(createData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to create order', details: errorText }, { status: response.status });
    }

    bustTableCache('orders');
    revalidatePath('/orders');
    const newOrder = await response.json();
    return NextResponse.json(newOrder, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
