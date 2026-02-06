import { NextRequest, NextResponse } from 'next/server';
import { getAllSelectOptions, getBaserowJwt } from '@/lib/baserow';
import type { TableName } from '@/lib/baserow';

const OPTION_TABLES: TableName[] = ['fields', 'field_seasons', 'probe_assignments'];

export async function GET() {
  try {
    const allOptions = await getAllSelectOptions(OPTION_TABLES);
    return NextResponse.json(allOptions);
  } catch (error) {
    console.error('Error fetching select options:', error);
    return NextResponse.json(
      { error: 'Failed to fetch select options' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { fieldId, select_options } = await request.json();

    if (!fieldId || !Array.isArray(select_options)) {
      return NextResponse.json(
        { error: 'fieldId and select_options array required' },
        { status: 400 }
      );
    }

    // Field schema changes require JWT auth (database tokens return 401)
    const jwt = await getBaserowJwt();
    if (!jwt) {
      return NextResponse.json(
        { error: 'BASEROW_EMAIL and BASEROW_PASSWORD env vars are required for field schema changes' },
        { status: 500 }
      );
    }

    const response = await fetch(`https://api.baserow.io/api/database/fields/${fieldId}/`, {
      method: 'PATCH',
      headers: {
        'Authorization': `JWT ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ select_options }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Baserow field update error:', errorText);
      return NextResponse.json(
        { error: 'Failed to update options' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating select options:', error);
    return NextResponse.json(
      { error: 'Failed to update select options' },
      { status: 500 }
    );
  }
}
