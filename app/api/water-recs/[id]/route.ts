import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';


interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = withApiAuth(async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const recId = parseInt(id, 10);

    if (isNaN(recId)) {
      return NextResponse.json(
        { error: 'Invalid water recommendation ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.recommendation !== undefined) updateData.recommendation = body.recommendation;
    if (body.suggested_water_day !== undefined) updateData.suggested_water_day = body.suggested_water_day;
    if (body.date !== undefined) updateData.date = body.date;
    if (body.field_season !== undefined) {
      updateData.field_season = body.field_season ? [body.field_season] : [];
    }

    const url = { table: 'water_recs', id: recId };
    const response = await dataRequest(url, { method: 'PATCH', body: JSON.stringify(updateData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update water recommendation' },
        { status: response.status }
      );
    }

    const updated = await response.json();
    bustTableCache('water_recs');
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating water recommendation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export const DELETE = withApiAuth(async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const recId = parseInt(id, 10);

    if (isNaN(recId)) {
      return NextResponse.json(
        { error: 'Invalid water recommendation ID' },
        { status: 400 }
      );
    }

    const url = { table: 'water_recs', id: recId };
    const response = await dataRequest(url, { method: 'DELETE' });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to delete water recommendation' },
        { status: response.status }
      );
    }

    bustTableCache('water_recs');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting water recommendation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
