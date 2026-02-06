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
  battery_type?: string;
  probe?: number;
  copy_probe?: boolean;
  source_field_season_id?: number; // For rollover - to track which field_season this came from
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
    const results: { id: number; source_field_season_id?: number }[] = [];
    const errors: string[] = [];

    // Track source_field_season_id for each item so we can map back after creation
    const itemSourceMap: (number | undefined)[] = items.map(item => item.source_field_season_id);

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const createItems = batch.map((item) => {
        const data: Record<string, unknown> = {
          field: [item.field],
          season: parseInt(item.season, 10),
          probe_status: 'Unassigned',
        };

        if (item.crop) data.crop = item.crop;
        // service_type is a Link field to service_rates — needs array of row IDs
        if (item.service_type) data.service_type = [parseInt(item.service_type, 10)];
        if (item.antenna_type) data.antenna_type = item.antenna_type;
        if (item.battery_type) data.battery_type = item.battery_type;
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
        // Map the created items back to their source field_season_ids
        const createdItems = created.items || [];
        createdItems.forEach((createdItem: { id: number }, idx: number) => {
          const globalIdx = i + idx;
          results.push({
            id: createdItem.id,
            source_field_season_id: itemSourceMap[globalIdx],
          });
        });
      }
    }

    return NextResponse.json({
      success: true,
      created: results.length,
      total: items.length,
      results, // Include the created field_season IDs with their source mapping
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
