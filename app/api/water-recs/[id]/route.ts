import { NextResponse } from 'next/server';
import { asLink, crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({
  table: 'water_recs',
  mapUpdate: (body) => {
    const mapped = pick(body, ['recommendation', 'suggested_water_day', 'date', 'field_season']);
    if (mapped instanceof NextResponse) return mapped;
    if (body.field_season !== undefined) mapped.field_season = asLink(body.field_season);
    return mapped;
  },
});
