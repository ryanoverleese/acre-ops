import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { capturePivotLock } from '@/lib/valley/pivot-lock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

// Staff only (admin-gated under /api/water-recs). Reads the pivot once with a
// Valley GET and returns a preview plus a signed lock. Writes nothing: the lock
// is stored only when the rec is saved through /api/water-recs/bulk.
// No GET handler on purpose: a lock is an explicit button press.
export const POST = withApiAuth(async (request) => {
  const body = await request.json().catch(() => ({}));
  const preview = await capturePivotLock(body?.field_season, body?.date);
  return NextResponse.json(preview, { headers });
});
