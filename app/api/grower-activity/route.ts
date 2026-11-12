import { NextResponse } from 'next/server';
import {
  isGrowerPageViewPath,
  isPrefetchRequestHeaders,
  normalizeGrowerActivityPath,
} from '@/lib/grower-activity-display';
import { withApiAuth } from '@/lib/supabase/api';
import { recordGrowerPageView } from '@/lib/supabase/grower-activity';

export const POST = withApiAuth(async (request, _context, current) => {
  if (current.kind !== 'grower') {
    return NextResponse.json({ error: 'Sign in with an authorized account' }, { status: 401 });
  }
  if (isPrefetchRequestHeaders((name) => request.headers.get(name))) {
    return new NextResponse(null, { status: 204 });
  }
  const body = await request.json().catch(() => ({}));
  const path = normalizeGrowerActivityPath(body?.path);
  if (!path || !isGrowerPageViewPath(path)) {
    return NextResponse.json({ error: 'Unknown grower page' }, { status: 400 });
  }
  await recordGrowerPageView(current.operationId, path);
  return new NextResponse(null, { status: 204 });
});
