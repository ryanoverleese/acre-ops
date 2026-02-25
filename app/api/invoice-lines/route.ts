import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Get all invoice lines (with optional filtering by invoice)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get('invoice_id');

    let url = `${BASEROW_API_URL}/${TABLE_IDS.invoice_lines}/?user_field_names=true&size=200`;

    // If filtering by invoice, add filter parameter
    if (invoiceId) {
      url += `&filter__invoice__link_row_has=${invoiceId}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch invoice lines' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data.results);
  } catch (error) {
    console.error('Error fetching invoice lines:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Create a new invoice line
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.invoice_id || !body.field_season_id) {
      return NextResponse.json(
        { error: 'invoice_id and field_season_id are required' },
        { status: 400 }
      );
    }

    const createData: Record<string, unknown> = {
      invoice: [body.invoice_id],
      field_season: [body.field_season_id],
    };

    if (body.service_type) createData.service_type = body.service_type;
    if (body.rate !== undefined) createData.rate = parseFloat(body.rate) || 0;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.invoice_lines}/?user_field_names=true`;
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
        { error: 'Failed to create invoice line' },
        { status: response.status }
      );
    }

    const newLine = await response.json();
    return NextResponse.json(newLine, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice line:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
