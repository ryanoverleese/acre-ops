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
    const body = await request.json();
    const { fieldId, select_options } = body;
    console.log(`select-options PATCH: fieldId=${fieldId}, options count=${select_options?.length}, body keys=${Object.keys(body).join(',')}`);

    if (!fieldId || !Array.isArray(select_options)) {
      console.error(`select-options PATCH: invalid params - fieldId=${fieldId}, select_options isArray=${Array.isArray(select_options)}`);
      return NextResponse.json(
        { error: 'fieldId and select_options array required' },
        { status: 400 }
      );
    }

    // Field schema changes require JWT auth (database tokens return 401)
    console.log('select-options PATCH: requesting JWT...');
    const jwt = await getBaserowJwt();
    if (!jwt) {
      console.error('select-options PATCH: JWT auth failed - cannot proceed');
      return NextResponse.json(
        { error: 'BASEROW_EMAIL and BASEROW_PASSWORD env vars are required for field schema changes' },
        { status: 500 }
      );
    }
    console.log(`select-options PATCH: got JWT, PATCHing field ${fieldId} with ${select_options.length} options`);

    const patchUrl = `https://api.baserow.io/api/database/fields/${fieldId}/`;
    const patchBody = JSON.stringify({ select_options });
    console.log(`select-options PATCH: URL=${patchUrl}, body length=${patchBody.length}`);

    const response = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `JWT ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: patchBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`select-options PATCH: Baserow error ${response.status} ${response.statusText}:`, errorText);
      return NextResponse.json(
        { error: `Failed to update options: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`select-options PATCH: success for field ${fieldId}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error('select-options PATCH: unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to update select options' },
      { status: 500 }
    );
  }
}
