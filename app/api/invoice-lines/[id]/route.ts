import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';


interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = withApiAuth(async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const invoiceLineId = parseInt(id, 10);

    if (isNaN(invoiceLineId)) {
      return NextResponse.json(
        { error: 'Invalid invoice line ID' },
        { status: 400 }
      );
    }

    const body = await request.json();

    const url = { table: 'invoice_lines', id: invoiceLineId };
    const response = await dataRequest(url, { method: 'PATCH', body: JSON.stringify(body) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update invoice line' },
        { status: response.status }
      );
    }

    const data = await response.json();
    bustTableCache('invoice_lines');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating invoice line:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withApiAuth(async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const invoiceLineId = parseInt(id, 10);

    if (isNaN(invoiceLineId)) {
      return NextResponse.json(
        { error: 'Invalid invoice line ID' },
        { status: 400 }
      );
    }

    const url = { table: 'invoice_lines', id: invoiceLineId };
    const response = await dataRequest(url, { method: 'DELETE' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to delete invoice line' },
        { status: response.status }
      );
    }

    bustTableCache('invoice_lines');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invoice line:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
