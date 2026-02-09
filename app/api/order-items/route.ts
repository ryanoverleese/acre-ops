import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Cache the order_items field names from Baserow schema
let cachedFieldNames: { orderField: string; productField: string } | null = null;

async function getOrderItemFieldNames(): Promise<{ orderField: string; productField: string }> {
  if (cachedFieldNames) return cachedFieldNames;

  try {
    const schemaUrl = `https://api.baserow.io/api/database/fields/table/${TABLE_IDS.order_items}/`;
    const res = await fetch(schemaUrl, {
      headers: { Authorization: `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });
    if (res.ok) {
      const fields = await res.json();
      let orderField = 'order';
      let productField = 'product';
      for (const f of fields) {
        if (f.type === 'link_row' && f.link_row_table_id === TABLE_IDS.orders) {
          orderField = f.name;
        }
        if (f.type === 'link_row' && f.link_row_table_id === TABLE_IDS.products_services) {
          productField = f.name;
        }
      }
      cachedFieldNames = { orderField, productField };
      console.log('[order-items] Resolved field names:', cachedFieldNames);
      return cachedFieldNames;
    }
  } catch (e) {
    console.error('[order-items] Failed to fetch schema, using defaults:', e);
  }

  return { orderField: 'order', productField: 'product' };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderField, productField } = await getOrderItemFieldNames();

    const createData: Record<string, unknown> = {};
    if (body.order) {
      const orderVal = Array.isArray(body.order) ? body.order : [parseInt(body.order, 10)];
      createData[orderField] = orderVal;
    }
    if (body.product) {
      const productVal = Array.isArray(body.product) ? body.product : [parseInt(body.product, 10)];
      createData[productField] = productVal;
    }
    if (body.quantity !== undefined) createData.quantity = body.quantity;
    if (body.unit_price !== undefined) {
      createData.unit_price = body.unit_price;
      createData['unit price'] = body.unit_price;
    }
    if (body.notes !== undefined) createData.notes = body.notes;

    console.log('[order-items] Creating item with data:', JSON.stringify(createData));

    const url = `${BASEROW_API_URL}/${TABLE_IDS.order_items}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to create order item', details: errorText }, { status: response.status });
    }

    revalidatePath('/orders');
    const newItem = await response.json();
    console.log('[order-items] Created item response:', JSON.stringify(newItem));
    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    console.error('Error creating order item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
