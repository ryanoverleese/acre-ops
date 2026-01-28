import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.billing_entity) {
      return NextResponse.json(
        { error: 'Billing entity is required' },
        { status: 400 }
      );
    }

    const createData: Record<string, unknown> = {
      billing_entity: [body.billing_entity],
      season: body.season || new Date().getFullYear(),
      status: body.status || 'Draft',
    };

    if (body.amount !== undefined) createData.amount = body.amount;
    if (body.sent_at) createData.sent_at = body.sent_at;
    if (body.paid_at) createData.paid_at = body.paid_at;
    if (body.notes) createData.notes = body.notes;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.invoices}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create invoice' },
        { status: response.status }
      );
    }

    const newInvoice = await response.json();
    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
