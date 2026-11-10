import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { updateRow } from '@/lib/supabase/adapter';
import { positiveId } from '@/lib/supabase/registry';
import { hashGrowerPin } from '@/lib/supabase/grower-auth';

/** Admin-only: set or clear the grower login PIN for one farm. */
export const PATCH = withApiAuth(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const id = positiveId((await params).id);
  const body = await request.json().catch(() => ({}));
  const grower_pin = await hashGrowerPin(body?.pin);
  await updateRow('operations', id, { grower_pin });
  return NextResponse.json({ ok: true, growerPinSet: grower_pin != null });
});
