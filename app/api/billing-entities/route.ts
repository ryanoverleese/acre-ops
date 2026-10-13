import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/baserow';

const TABLE_ID = 817297; // billing_entities table

export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await dataRequest({ table: 'billing_entities' }, { method: 'POST', body: JSON.stringify(body) });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: response.status });
    }

    const data = await response.json();
    bustTableCache('billing_entities');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating billing entity:', error);
    return NextResponse.json({ error: 'Failed to create billing entity' }, { status: 500 });
  }
});
