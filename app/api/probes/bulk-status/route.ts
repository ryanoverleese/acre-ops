import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const { from, to } = await request.json();

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to status' }, { status: 400 });
    }

    // Fetch all probes with the "from" status using Baserow filter
    const tableId = TABLE_IDS.probes;
    const filterParam = encodeURIComponent(JSON.stringify({
      filter_type: 'AND',
      filters: [{ type: 'single_select_equal', field: 'status', value: from }],
    }));

    let allProbes: { id: number }[] = [];
    let page = 1;
    while (true) {
      const url = `${BASEROW_API_URL}/${tableId}/?user_field_names=true&size=200&page=${page}&filters=${filterParam}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Token ${BASEROW_TOKEN}` },
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Baserow fetch error:', res.status, errorText);
        return NextResponse.json({ error: 'Failed to fetch probes' }, { status: res.status });
      }
      const data = await res.json();
      allProbes = allProbes.concat(data.results.map((r: { id: number }) => ({ id: r.id })));
      if (!data.next) break;
      page++;
    }

    if (allProbes.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    // Batch update using Baserow batch endpoint
    const batchSize = 200;
    let updated = 0;
    for (let i = 0; i < allProbes.length; i += batchSize) {
      const batch = allProbes.slice(i, i + batchSize);
      const items = batch.map((p) => ({ id: p.id, status: to }));
      const batchUrl = `${BASEROW_API_URL}/${tableId}/batch/?user_field_names=true`;
      const res = await fetch(batchUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Baserow batch update error:', res.status, errorText);
        return NextResponse.json({ error: 'Batch update failed', updated }, { status: res.status });
      }
      updated += batch.length;
    }

    return NextResponse.json({ updated });
  } catch (error) {
    console.error('Error in bulk status update:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
