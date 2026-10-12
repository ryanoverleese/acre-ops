import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';


// PATCH - Update inventory item
export const PATCH = withApiAuth(async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const payload: Record<string, unknown> = {};
    if (body.item_name !== undefined) payload.item_name = body.item_name;
    if (body.category !== undefined) payload.category = body.category;
    if (body.quantity !== undefined) payload.quantity = body.quantity;

    const response = await dataRequest({ table: 'inventory', id: id }, { method: 'PATCH', body: JSON.stringify(payload) });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Database error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    bustTableCache('inventory');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Update inventory error:', error);
    return NextResponse.json({ error: 'Failed to update inventory item' }, { status: 500 });
  }
});

// DELETE - Delete inventory item
export const DELETE = withApiAuth(async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await dataRequest({ table: 'inventory', id: id }, { method: 'DELETE' });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Database error: ${error}` }, { status: response.status });
    }

    bustTableCache('inventory');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete inventory error:', error);
    return NextResponse.json({ error: 'Failed to delete inventory item' }, { status: 500 });
  }
});
