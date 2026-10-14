import { withApiAuth } from '@/lib/supabase/api';
import { dataRequest } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { bustTableCache } from '@/lib/supabase/adapter';

const TABLE_ID = 817294; // contacts table

export const POST = withApiAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await dataRequest({ table: 'contacts' }, { method: 'POST', body: JSON.stringify(body) });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error }, { status: response.status });
    }

    const data = await response.json();
    bustTableCache('contacts');
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
});
