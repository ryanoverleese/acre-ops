import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';


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
      reported_at: body.reported_at || new Date().toISOString().split('T')[0],
    };

    if (body.probe_assignment) createData.probe_assignment = [body.probe_assignment];
    if (body.problem) createData.problem = body.problem;
    if (body.fix) createData.fix = body.fix;
    if (body.repaired_at) createData.repaired_at = body.repaired_at;
    if (body.notified_customer !== undefined) createData.notified_customer = body.notified_customer;

    const url = { table: 'repairs' };
    const response = await dataRequest(url, { method: 'POST', body: JSON.stringify(createData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create repair' },
        { status: response.status }
      );
    }

    const newRepair = await response.json();
    bustTableCache('repairs');
    return NextResponse.json(newRepair, { status: 201 });
  } catch (error) {
    console.error('Error creating repair:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
