import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

// Persist a per-field, whole-season note onto the field_season row. It lives on
// field_seasons (not water_recs), so it shows all year and naturally resets each
// season when a new field_season row is created.
export async function POST(request: NextRequest) {
  try {
    const { fieldSeasonId, note } = (await request.json()) as {
      fieldSeasonId: number;
      note: string;
    };

    if (!fieldSeasonId) {
      return NextResponse.json({ error: 'fieldSeasonId is required' }, { status: 400 });
    }

    const res = await fetch(
      `${BASEROW_API_URL}/${TABLE_IDS.field_seasons}/${fieldSeasonId}/?user_field_names=true`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ field_note: note ?? '' }),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      console.error('Field note save failed:', error);
      return NextResponse.json({ success: false, error }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Field note error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
