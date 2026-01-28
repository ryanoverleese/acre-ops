import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

export async function POST(request: NextRequest) {
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
      reported_at: body.reported_at || new Date().toISOString().split('T')[0],
    };

    if (body.problem) createData.problem = body.problem;
    if (body.fix) createData.fix = body.fix;
    if (body.repaired_at) createData.repaired_at = body.repaired_at;
    if (body.notified_customer !== undefined) createData.notified_customer = body.notified_customer;

    const url = `${BASEROW_API_URL}/${TABLE_IDS.repairs}/?user_field_names=true`;
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
        { error: 'Failed to create repair' },
        { status: response.status }
      );
    }

    const newRepair = await response.json();
    return NextResponse.json(newRepair, { status: 201 });
  } catch (error) {
    console.error('Error creating repair:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
