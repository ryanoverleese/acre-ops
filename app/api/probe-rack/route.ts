import { withApiAuth } from '@/lib/supabase/api';
import { NextResponse } from 'next/server';
import { getRows } from '@/lib/supabase/adapter';
import type { ProbeRackSlot } from '@/lib/types';
import { asLink, crudCollection, pick } from '@/lib/supabase/crud-route';

export const GET = withApiAuth(async function GET() {
  try {
    const slots = await getRows<ProbeRackSlot>('probe_rack');
    return NextResponse.json(slots);
  } catch (error) {
    console.error('Error fetching probe rack slots:', error);
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 });
  }
});

export const { POST } = crudCollection({
  table: 'probe_rack',
  createStatus: 201,
  mapCreate: (body) => {
    const mapped = pick(body, ['rack']);
    if (mapped instanceof NextResponse) return mapped;
    if (body.rack_slot) mapped.rack_slot = parseInt(String(body.rack_slot), 10);
    if (body.probe) mapped.probe = asLink(body.probe);
    return mapped;
  },
});
