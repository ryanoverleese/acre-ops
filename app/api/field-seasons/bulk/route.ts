import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

interface BulkCreateItem {
  field: number;
  season: string;
  crop?: string;
  service_type?: string;
  antenna_type?: string;
  probe?: number;
  copy_probe?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: BulkCreateItem[] = body.items;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      );
    }

    // Baserow batch API supports up to 200 items at a time
    const batchSize = 200;
    const results: unknown[] = [];
    const errors: string[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const createItems = batch.map((item) => {
        const data: Record<string, unknown> = {
          field: [item.field],
          season: parseInt(item.season, 10),
          probe_status: 'Unassigned',
        };

        if (item.crop) data.crop = item.crop;
        if (item.service_type) data.service_type = item.service_type;
        if (item.antenna_type) data.antenna_type = item.antenna_type;
        if (item.probe && item.copy_probe) {
          data.probe = [item.probe];
          data.probe_status = 'Assigned';
        }

        return data;
      });

      const url = `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/batch/?user_field_names=true`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: createItems }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Baserow batch API error:', response.status, errorText);
        errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${errorText}`);
      } else {
        const created = await response.json();
        results.push(...(created.items || []));
      }
    }

    return NextResponse.json({
      success: true,
      created: results.length,
      total: items.length,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: 201 });
  } catch (error) {
    console.error('Error bulk creating field seasons:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
