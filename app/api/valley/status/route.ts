import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { valleyEnabled } from '@/lib/valley/client';
import { fieldPivotStatuses } from '@/lib/valley/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

// Deliberately no POST/PATCH/PUT/DELETE or command forwarding.
export const GET = withApiAuth(async (request: NextRequest) => {
  if (!valleyEnabled()) return NextResponse.json({enabled:false,fields:{}}, {headers});
  const raw = request.nextUrl.searchParams.get('fields') || '';
  const parts = raw.split(',');
  if (parts.length > 25 || parts.some(v => !/^[1-9]\d*$/.test(v) || !Number.isSafeInteger(Number(v)))) {
    return NextResponse.json({error:'Request between 1 and 25 field IDs'}, {status:400,headers});
  }
  const ids = [...new Set(parts.map(Number))];
  try { return NextResponse.json({enabled:true,fields:await fieldPivotStatuses(ids)}, {headers}); }
  catch {
    return NextResponse.json({enabled:true,fields:Object.fromEntries(ids.map(id => [id,{state:'unavailable',pivots:[]}]))}, {status:503,headers});
  }
});
