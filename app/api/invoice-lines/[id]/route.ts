import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const invoiceLineId = parseInt(id, 10);

    if (isNaN(invoiceLineId)) {
      return NextResponse.json(
        { error: 'Invalid invoice line ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.invoice_lines}/${invoiceLineId}/`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to delete invoice line' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invoice line:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
