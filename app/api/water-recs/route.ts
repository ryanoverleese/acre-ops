import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';


export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.field_season) {
      return NextResponse.json(
        { error: 'Field season is required' },
        { status: 400 }
      );
    }

    const createData: Record<string, unknown> = {
      field_season: [body.field_season],
      date: body.date || new Date().toISOString().split('T')[0],
    };

    if (body.recommendation) createData.recommendation = body.recommendation;
    if (body.suggested_water_day) createData.suggested_water_day = body.suggested_water_day;

    const url = { table: 'water_recs' };
    const response = await dataRequest(url, { method: 'POST', body: JSON.stringify(createData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create water recommendation' },
        { status: response.status }
      );
    }

    const newRec = await response.json();
    bustTableCache('water_recs');
    return NextResponse.json(newRec, { status: 201 });
  } catch (error) {
    console.error('Error creating water recommendation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
