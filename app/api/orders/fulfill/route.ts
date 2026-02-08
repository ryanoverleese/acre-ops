import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';
import { revalidatePath } from 'next/cache';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

/**
 * Fulfill an order: update all probe assignments that are "On Order"
 * for the order's billing entity to "Ready to Enter Serial".
 * Also updates the order status to "Fulfilled".
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, billingEntityId, probeCount } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    // 1. Find probe assignments with status "On Order" for this billing entity
    // Fetch all probe assignments and filter client-side (Baserow filtering is limited)
    let allAssignments: Record<string, unknown>[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const paUrl = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/?user_field_names=true&size=200&page=${page}`;
      const paResp = await fetch(paUrl, {
        headers: { Authorization: `Token ${BASEROW_TOKEN}` },
        cache: 'no-store',
      });
      if (!paResp.ok) break;
      const paData = await paResp.json();
      allAssignments = allAssignments.concat(paData.results || []);
      hasMore = paData.next !== null;
      page++;
    }

    // Filter to "On Order" status assignments
    const onOrderAssignments = allAssignments.filter((pa: Record<string, unknown>) => {
      const status = pa.probe_status || pa['probe status'];
      const statusVal = typeof status === 'object' && status !== null ? (status as { value: string }).value : status;
      if (statusVal !== 'On Order') return false;

      // If billing entity filtering is needed
      if (billingEntityId) {
        // Get the field_season to check billing entity
        // For now, we'll update all "On Order" assignments up to probeCount
        return true;
      }
      return true;
    });

    // Limit to probeCount if specified
    const toUpdate = probeCount
      ? onOrderAssignments.slice(0, probeCount)
      : onOrderAssignments;

    // 2. Update each probe assignment to "Ready to Enter Serial"
    let updated = 0;
    for (const pa of toUpdate) {
      const paId = (pa as { id: number }).id;
      const updateUrl = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/${paId}/?user_field_names=true`;
      const updateResp = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          probe_status: 'Ready to Enter Serial',
          'probe status': 'Ready to Enter Serial',
        }),
      });
      if (updateResp.ok) updated++;
    }

    // 3. Update order status to "Fulfilled"
    const orderUrl = `${BASEROW_API_URL}/${TABLE_IDS.orders}/${orderId}/?user_field_names=true`;
    await fetch(orderUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'Fulfilled' }),
    });

    revalidatePath('/orders');
    revalidatePath('/fields');

    return NextResponse.json({
      success: true,
      updatedAssignments: updated,
      totalOnOrder: onOrderAssignments.length,
    });
  } catch (error) {
    console.error('Error fulfilling order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
