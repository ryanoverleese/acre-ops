import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';

const TABLE_ID = 817297; // billing_entities table

export const PATCH = withApiAuth(async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await dataRequest({ table: 'billing_entities', id: id }, { method: 'PATCH', body: JSON.stringify(body) });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: response.status });
    }

    const data = await response.json();
    bustTableCache('billing_entities');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating billing entity:', error);
    return NextResponse.json({ error: 'Failed to update billing entity' }, { status: 500 });
  }
});

export const DELETE = withApiAuth(async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await dataRequest({ table: 'billing_entities', id: id }, { method: 'DELETE' });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: response.status });
    }

    bustTableCache('billing_entities');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting billing entity:', error);
    return NextResponse.json({ error: 'Failed to delete billing entity' }, { status: 500 });
  }
});
