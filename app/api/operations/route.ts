import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';


export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: 'Operation name is required' },
        { status: 400 }
      );
    }

    const createData: Record<string, unknown> = {
      name: body.name,
    };

    if (body.notes) createData.notes = body.notes;

    const url = { table: 'operations' };
    const response = await dataRequest(url, { method: 'POST', body: JSON.stringify(createData) });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Database API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to create operation' },
        { status: response.status }
      );
    }

    const newOperation = await response.json();
    bustTableCache('operations');
    return NextResponse.json(newOperation, { status: 201 });
  } catch (error) {
    console.error('Error creating operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
