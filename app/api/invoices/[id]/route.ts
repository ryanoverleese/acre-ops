import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id, 10);

    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.sent_at !== undefined) updateData.sent_at = body.sent_at;
    if (body.deposit_at !== undefined) updateData.deposit_at = body.deposit_at;
    if (body.paid_at !== undefined) updateData.paid_at = body.paid_at;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.season !== undefined) updateData.season = body.season;
    if (body.checu_number !== undefined) updateData.checu_number = body.checu_number;
    if (body.actual_billed_amount !== undefined) updateData.actual_billed_amount = body.actual_billed_amount;
    if (body.billing_entity !== undefined) {
      updateData.billing_entity = body.billing_entity ? [body.billing_entity] : [];
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.invoices}/${invoiceId}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update invoice' },
        { status: response.status }
      );
    }

    const updated = await response.json();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id, 10);

    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    const url = `${BASEROW_API_URL}/${TABLE_IDS.invoices}/${invoiceId}/`;
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
        { error: 'Failed to delete invoice' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
