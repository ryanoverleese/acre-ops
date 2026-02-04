import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface InvoiceRow {
  id: number;
  billing_entity?: { id: number; value: string }[];
  season?: number;
  amount?: number;
  status?: { id: number; value: string };
}

// Find or create an invoice and add an invoice line for a field season
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const { billing_entity_id, season, field_season_id, service_type, rate } = body;

    if (!billing_entity_id || !season || !field_season_id) {
      return NextResponse.json(
        { error: 'billing_entity_id, season, and field_season_id are required' },
        { status: 400 }
      );
    }

    // Skip if no rate provided
    if (!rate || parseFloat(rate) === 0) {
      return NextResponse.json({
        message: 'Skipped billing - no rate provided',
        invoice: null,
        invoiceLine: null
      });
    }

    // Step 1: Find existing invoice for this billing_entity + season
    const searchUrl = `${BASEROW_API_URL}/${TABLE_IDS.invoices}/?user_field_names=true&filter__billing_entity__link_row_has=${billing_entity_id}&filter__season__equal=${season}`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      console.error('Failed to search invoices:', await searchResponse.text());
      return NextResponse.json(
        { error: 'Failed to search for existing invoice' },
        { status: searchResponse.status }
      );
    }

    const searchData = await searchResponse.json();
    let invoice: InvoiceRow | null = null;

    if (searchData.results.length > 0) {
      // Use existing invoice
      invoice = searchData.results[0];
    } else {
      // Step 2: Create new invoice for this billing_entity + season
      const createInvoiceUrl = `${BASEROW_API_URL}/${TABLE_IDS.invoices}/?user_field_names=true`;
      const createInvoiceResponse = await fetch(createInvoiceUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          billing_entity: [billing_entity_id],
          season: parseInt(season),
          status: 'Draft',
          amount: 0, // Will be updated as lines are added
        }),
      });

      if (!createInvoiceResponse.ok) {
        console.error('Failed to create invoice:', await createInvoiceResponse.text());
        return NextResponse.json(
          { error: 'Failed to create invoice' },
          { status: createInvoiceResponse.status }
        );
      }

      invoice = await createInvoiceResponse.json();
    }

    if (!invoice) {
      return NextResponse.json(
        { error: 'Failed to get or create invoice' },
        { status: 500 }
      );
    }

    // Step 3: Check if an invoice line already exists for this field_season
    const existingLineUrl = `${BASEROW_API_URL}/${TABLE_IDS.invoice_lines}/?user_field_names=true&filter__field_season__link_row_has=${field_season_id}`;
    const existingLineResponse = await fetch(existingLineUrl, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (existingLineResponse.ok) {
      const existingLineData = await existingLineResponse.json();
      if (existingLineData.results.length > 0) {
        // Update existing line instead of creating a new one
        const existingLine = existingLineData.results[0];
        const updateLineUrl = `${BASEROW_API_URL}/${TABLE_IDS.invoice_lines}/${existingLine.id}/?user_field_names=true`;
        const updateLineResponse = await fetch(updateLineUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Token ${BASEROW_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invoice: [invoice.id],
            service_type: service_type || '',
            rate: parseFloat(rate) || 0,
          }),
        });

        if (!updateLineResponse.ok) {
          console.error('Failed to update invoice line:', await updateLineResponse.text());
          return NextResponse.json(
            { error: 'Failed to update invoice line' },
            { status: updateLineResponse.status }
          );
        }

        const updatedLine = await updateLineResponse.json();

        // Recalculate invoice total
        await updateInvoiceTotal(invoice.id);

        return NextResponse.json({
          message: 'Updated existing invoice line',
          invoice,
          invoiceLine: updatedLine,
        });
      }
    }

    // Step 4: Create invoice line
    const createLineUrl = `${BASEROW_API_URL}/${TABLE_IDS.invoice_lines}/?user_field_names=true`;
    const createLineResponse = await fetch(createLineUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoice: [invoice.id],
        field_season: [field_season_id],
        service_type: service_type || '',
        rate: parseFloat(rate) || 0,
      }),
    });

    if (!createLineResponse.ok) {
      console.error('Failed to create invoice line:', await createLineResponse.text());
      return NextResponse.json(
        { error: 'Failed to create invoice line' },
        { status: createLineResponse.status }
      );
    }

    const invoiceLine = await createLineResponse.json();

    // Step 5: Update invoice total
    await updateInvoiceTotal(invoice.id);

    return NextResponse.json({
      message: 'Created invoice line',
      invoice,
      invoiceLine,
    }, { status: 201 });

  } catch (error) {
    console.error('Error in billing enrollment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper function to recalculate invoice total from line items
async function updateInvoiceTotal(invoiceId: number) {
  try {
    // Get all lines for this invoice
    const linesUrl = `${BASEROW_API_URL}/${TABLE_IDS.invoice_lines}/?user_field_names=true&filter__invoice__link_row_has=${invoiceId}`;
    const linesResponse = await fetch(linesUrl, {
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!linesResponse.ok) {
      console.error('Failed to fetch invoice lines for total calculation');
      return;
    }

    const linesData = await linesResponse.json();
    const total = linesData.results.reduce((sum: number, line: { rate?: number }) => {
      return sum + (line.rate || 0);
    }, 0);

    // Update invoice amount
    const updateUrl = `${BASEROW_API_URL}/${TABLE_IDS.invoices}/${invoiceId}/?user_field_names=true`;
    await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: total }),
    });
  } catch (error) {
    console.error('Error updating invoice total:', error);
  }
}
