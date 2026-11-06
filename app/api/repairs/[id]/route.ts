import { NextResponse } from 'next/server';
import { asLink, crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({
  table: 'repairs',
  mapUpdate: (body) => {
    const mapped = pick(body, [
      'problem',
      'fix',
      'repaired_at',
      'notified_customer',
      'probe_replaced',
      'new_probe_serial',
      'watch_list',
      'field_season',
      'probe_assignment',
    ]);
    if (mapped instanceof NextResponse) return mapped;
    if (body.field_season !== undefined) mapped.field_season = asLink(body.field_season);
    if (body.probe_assignment !== undefined) mapped.probe_assignment = asLink(body.probe_assignment);
    return mapped;
  },
});
