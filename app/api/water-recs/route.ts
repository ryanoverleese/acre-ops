import { crudCollection, pick } from '@/lib/supabase/crud-route';

export const { POST } = crudCollection({
  table: 'water_recs',
  createStatus: 201,
  mapCreate: (body) =>
    pick(body, ['field_season', 'recommendation', 'suggested_water_day'], {
      required: ['field_season'],
      links: ['field_season'],
      defaults: { date: body.date || new Date().toISOString().split('T')[0] },
    }),
});
