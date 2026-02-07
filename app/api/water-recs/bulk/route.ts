import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deleteIds, records } = body;

    if (!Array.isArray(records)) {
      return NextResponse.json({ error: 'records array is required' }, { status: 400 });
    }

    // Delete existing records if specified (for overwrite/re-save)
    if (deleteIds && Array.isArray(deleteIds) && deleteIds.length > 0) {
      await Promise.all(
        deleteIds.map((id: number) =>
          fetch(`${BASEROW_API_URL}/${TABLE_IDS.water_recs}/${id}/?user_field_names=true`, {
            method: 'DELETE',
            headers: { Authorization: `Token ${BASEROW_TOKEN}` },
          })
        )
      );
    }

    // Create new records
    const errors: string[] = [];
    const created = await Promise.all(
      records.map(async (rec: { field_season: number; date: string; recommendation?: string; suggested_water_day?: string; priority?: boolean; report_type?: string }) => {
        // Only send fields we know exist in Baserow
        const payload: Record<string, unknown> = {
          'field season': rec.field_season ? [rec.field_season] : [],
          'field_season': rec.field_season ? [rec.field_season] : [],
          date: rec.date,
          recommendation: rec.recommendation || '',
        };
        // Single select fields: only include when non-empty (empty string is invalid)
        if (rec.suggested_water_day) {
          payload.suggested_water_day = rec.suggested_water_day;
          payload['suggested water day'] = rec.suggested_water_day;
        }
        // Only include these if they have values - Baserow silently ignores unknown fields
        if (rec.priority !== undefined) payload.priority = rec.priority;
        if (rec.report_type) payload.report_type = rec.report_type;

        const response = await fetch(`${BASEROW_API_URL}/${TABLE_IDS.water_recs}/?user_field_names=true`, {
          method: 'POST',
          headers: {
            Authorization: `Token ${BASEROW_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('Failed to create water rec:', error, 'Payload:', JSON.stringify(payload));
          errors.push(error);
          return null;
        }
        return response.json();
      })
    );

    const successful = created.filter(Boolean);
    return NextResponse.json({
      success: successful.length > 0,
      created: successful.length,
      total: records.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Bulk water recs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
