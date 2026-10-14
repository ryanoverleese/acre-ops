import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';


// DELETE - Delete document
export const DELETE = withApiAuth(async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await dataRequest({ table: 'documents', id: id }, { method: 'DELETE' });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Database error: ${error}` }, { status: response.status });
    }

    bustTableCache('documents');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
});
