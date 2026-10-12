import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { getRows, ProbeRackSlot, bustTableCache } from '@/lib/baserow';


export const GET = withApiAuth(async function GET() {
  try {
    const slots = await getRows<ProbeRackSlot>('probe_rack');
    return NextResponse.json(slots);
  } catch (error) {
    console.error('Error fetching probe rack slots:', error);
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
  }
});

export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createData: Record<string, unknown> = {};

    if (body.rack) createData.rack = body.rack;
    if (body.rack_slot) createData.rack_slot = parseInt(body.rack_slot, 10);
    if (body.probe) createData.probe = [body.probe];

    const url = { table: 'probe_rack' };
    const response = await dataRequest(url, { method: 'POST', body: JSON.stringify(createData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create probe rack slot', detail: errorText },
        { status: response.status }
      );
    }

    const newSlot = await response.json();
    bustTableCache('probe_rack');
    return NextResponse.json(newSlot, { status: 201 });
  } catch (error) {
    console.error('Error creating probe rack slot:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
