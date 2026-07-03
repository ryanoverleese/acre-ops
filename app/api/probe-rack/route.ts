import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS, getRows, ProbeRackSlot, bustTableCache } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function GET() {
  try {
    const slots = await getRows<ProbeRackSlot>('probe_rack');
    return NextResponse.json(slots);
  } catch (error) {
    console.error('Error fetching probe rack slots:', error);
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const createData: Record<string, unknown> = {};

    if (body.rack) createData.rack = body.rack;
    if (body.rack_slot) createData.rack_slot = parseInt(body.rack_slot, 10);
    if (body.probe) createData.probe = [body.probe];

    const url = `${BASEROW_API_URL}/${TABLE_IDS.probe_rack}/?user_field_names=true`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${BASEROW_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow API error:', response.status, errorText);
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
}
