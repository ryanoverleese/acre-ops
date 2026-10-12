import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { transaction } from '@/lib/supabase/database';
import { getRow, updateRow } from '@/lib/supabase/adapter';
import { DataError, positiveId } from '@/lib/supabase/registry';
import { moveProbe, replaceRmaProbe } from '@/lib/supabase/equipment';

export const POST = withApiAuth(async request => {
  const body = await request.json();
  if (body.action === 'rma') return NextResponse.json(await replaceRmaProbe(body));
  if (body.action === 'rack' || body.action === 'edit-probe') {
    const probeId = positiveId(body.probeId);
    const source = body.sourceId == null ? null : positiveId(body.sourceId);
    const destination = body.destinationId == null ? null : positiveId(body.destinationId);
    return NextResponse.json(await transaction(async () => {
      await moveProbe(probeId,source,destination);
      const probe = body.action === 'edit-probe' ? await updateRow('probes',probeId,body.patch || {}) : await getRow('probes',probeId);
      return {success:true,probe};
    }));
  }
  throw new DataError('Unknown equipment action');
});
