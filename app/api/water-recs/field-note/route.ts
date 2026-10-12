import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';


// Persist a per-field, whole-season note onto the field_season row. It lives on
// field_seasons (not water_recs), so it shows all year and naturally resets each
// season when a new field_season row is created.
export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const { fieldSeasonId, note } = (await request.json()) as {
      fieldSeasonId: number;
      note: string;
    };

    if (!fieldSeasonId) {
      return NextResponse.json({ error: 'fieldSeasonId is required' }, { status: 400 });
    }

    const res = await dataRequest({ table: 'field_seasons', id: fieldSeasonId }, { method: 'PATCH', body: JSON.stringify({ field_note: note ?? '' }) });

    if (!res.ok) {
      const error = await res.text();
      console.error('Field note save failed:', error);
      return NextResponse.json({ success: false, error }, { status: 502 });
    }

    bustTableCache('field_seasons');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Field note error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
