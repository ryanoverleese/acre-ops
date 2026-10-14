import { withApiAuth, errorResponse } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { getRow, updateRow } from '@/lib/supabase/adapter';
import { transaction } from '@/lib/supabase/database';
import { moveProbe } from '@/lib/supabase/equipment';
import { DataError } from '@/lib/supabase/registry';

export const PATCH = withApiAuth(async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rowId = parseInt(id, 10);
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.probe === null || body.probe === undefined) {
      updateData.probe = [];
    } else {
      updateData.probe = [body.probe];
    }

    const result = await transaction(async () => {
      const slot = await getRow<{probe: {id:number}[]}>('probe_rack',rowId);
      const previous = slot.probe[0]?.id ?? null;
      if (body.probe == null) {
        if (previous != null) await moveProbe(previous,rowId,null);
      } else if (previous !== Number(body.probe)) {
        if (previous != null) throw new DataError('Slot is occupied; use a move or RMA action',409);
        await moveProbe(Number(body.probe),null,rowId);
      }
      return getRow('probe_rack',rowId);
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating probe rack slot:', error);
    return errorResponse(error);
  }
});
