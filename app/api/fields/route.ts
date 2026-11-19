import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { createFieldRecord } from '@/lib/fields/create-field';

export const POST = withApiAuth(async request => {
  const result = await createFieldRecord(await request.json());
  return NextResponse.json(result, { status: 201 });
});
