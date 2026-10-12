import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';


// POST - Create new inventory item
export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.item_name) payload.item_name = body.item_name;
    if (body.category) payload.category = body.category;
    if (body.quantity !== undefined) payload.quantity = body.quantity;

    const response = await dataRequest({ table: 'inventory' }, { method: 'POST', body: JSON.stringify(payload) });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Database error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    bustTableCache('inventory');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Create inventory error:', error);
    return NextResponse.json({ error: 'Failed to create inventory item' }, { status: 500 });
  }
});
