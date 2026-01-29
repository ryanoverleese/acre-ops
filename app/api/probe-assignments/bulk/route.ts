import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Bulk create probe assignments (for season rollover)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      );
    }

    // Process in batches of 200 (Baserow limit)
    const batchSize = 200;
    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const batchItems = batch.map((item: {
        field_season: number;
        probe_number?: number;
        probe?: number;
        probe_status?: string;
        // Placement data (copied from source)
        placement_lat?: number;
        placement_lng?: number;
        elevation?: number | string;
        soil_type?: string;
        placement_notes?: string;
      }) => {
        const record: Record<string, unknown> = {
          field_season: [item.field_season],
          probe_number: item.probe_number || 1,
          // Reset install/approval fields for new season
          probe_status: 'Unassigned',
        };

        // Copy placement data from source
        if (item.placement_lat !== undefined) record.placement_lat = item.placement_lat;
        if (item.placement_lng !== undefined) record.placement_lng = item.placement_lng;
        if (item.elevation !== undefined) record.elevation = item.elevation;
        if (item.soil_type !== undefined) record.soil_type = item.soil_type;
        if (item.placement_notes !== undefined) record.placement_notes = item.placement_notes;

        return record;
      });

      const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/batch/?user_field_names=true`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: batchItems }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Baserow batch API error:', response.status, errorText);
        errors.push(`Batch ${i / batchSize + 1} failed: ${errorText}`);
      } else {
        const result = await response.json();
        created += result.items?.length || 0;
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { created, errors },
        { status: 207 } // Multi-Status
      );
    }

    return NextResponse.json({ created }, { status: 201 });
  } catch (error) {
    console.error('Error bulk creating probe assignments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
