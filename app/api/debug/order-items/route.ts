import { NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Diagnostic endpoint: returns actual Baserow field names and sample data for order_items
// Call: GET /api/debug/order-items
export async function GET() {
  try {
    // Fetch order_items table schema
    const schemaUrl = `https://api.baserow.io/api/database/fields/table/${TABLE_IDS.order_items}/`;
    const schemaRes = await fetch(schemaUrl, {
      headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });

    if (!schemaRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch schema', status: schemaRes.status }, { status: 500 });
    }

    const fields = await schemaRes.json();
    const allFields = fields.map((f: { name: string; type: string; id: number; link_row_table_id?: number }) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      link_row_table_id: f.link_row_table_id,
    }));

    // Fetch sample rows (raw, before normalizeKeys)
    const rowUrl = `https://api.baserow.io/api/database/rows/table/${TABLE_IDS.order_items}/?user_field_names=true&size=5`;
    const rowRes = await fetch(rowUrl, {
      headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });
    const rowData = rowRes.ok ? await rowRes.json() : { results: [] };
    const sampleRows = (rowData.results || []).map((row: Record<string, unknown>) => {
      const keys = Object.keys(row);
      return { id: row.id, keys, data: row };
    });

    // Also check orders table schema for reference
    const ordersSchemaUrl = `https://api.baserow.io/api/database/fields/table/${TABLE_IDS.orders}/`;
    const ordersSchemaRes = await fetch(ordersSchemaUrl, {
      headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });
    const ordersFields = ordersSchemaRes.ok ? await ordersSchemaRes.json() : [];
    const ordersAllFields = ordersFields.map((f: { name: string; type: string; id: number }) => ({
      id: f.id,
      name: f.name,
      type: f.type,
    }));

    return NextResponse.json({
      order_items_schema: allFields,
      order_items_sample_rows: sampleRows,
      orders_schema: ordersAllFields,
      table_ids: {
        orders: TABLE_IDS.orders,
        order_items: TABLE_IDS.order_items,
        products_services: TABLE_IDS.products_services,
      },
    });
  } catch (error) {
    console.error('Debug order-items error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
