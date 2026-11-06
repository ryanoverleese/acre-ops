import { NextResponse } from 'next/server';
import { asLink, crudCollection, pick } from '@/lib/supabase/crud-route';

export const { POST } = crudCollection({
  table: 'field_seasons',
  createStatus: 201,
  mapCreate: (body) => {
    if (!body.field) return NextResponse.json({ error: 'Field ID is required' }, { status: 400 });
    if (!body.season) return NextResponse.json({ error: 'Season is required' }, { status: 400 });
    const mapped = pick(body, [
      'crop',
      'side_dress',
      'logger_id',
      'early_removal',
      'hybrid_variety',
      'ready_to_remove',
      'planting_date',
    ], {
      defaults: {
        field: asLink(body.field),
        season: parseInt(String(body.season), 10),
      },
    });
    if (mapped instanceof NextResponse) return mapped;
    if (body.service_type) mapped.service_type = [parseInt(String(body.service_type), 10)];
    return mapped;
  },
});
