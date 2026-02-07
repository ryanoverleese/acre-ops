import { NextRequest, NextResponse } from 'next/server';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;
const TABLE_ID = 817302; // water_recs

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
          fetch(`${BASEROW_API_URL}/${TABLE_ID}/${id}/`, {
            method: 'DELETE',
            headers: { Authorization: `Token ${BASEROW_TOKEN}` },
          })
        )
      );
    }

    // Create new records
    const created = await Promise.all(
      records.map(async (rec: { field_season: number; date: string; recommendation?: string; suggested_water_day?: string; priority?: boolean; report_type?: string }) => {
        const payload: Record<string, unknown> = {
          field_season: rec.field_season ? [rec.field_season] : [],
          date: rec.date,
          recommendation: rec.recommendation || '',
          suggested_water_day: rec.suggested_water_day || '',
        };
        if (rec.priority !== undefined) payload.priority = rec.priority;
        if (rec.report_type) payload.report_type = rec.report_type;

        const response = await fetch(`${BASEROW_API_URL}/${TABLE_ID}/?user_field_names=true`, {
          method: 'POST',
          headers: {
            Authorization: `Token ${BASEROW_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('Failed to create water rec:', error);
          return null;
        }
        return response.json();
      })
    );

    const successful = created.filter(Boolean);
    return NextResponse.json({ success: true, created: successful.length, total: records.length });
  } catch (error) {
    console.error('Bulk water recs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
