import { crudCollection, pick } from '@/lib/supabase/crud-route';

export const { POST } = crudCollection({
  table: 'repairs',
  createStatus: 201,
  mapCreate: (body) =>
    pick(
      body,
      ['field_season', 'probe_assignment', 'problem', 'fix', 'repaired_at', 'notified_customer'],
      {
        required: ['field_season'],
        links: ['field_season', 'probe_assignment'],
        defaults: { reported_at: body.reported_at || new Date().toISOString().split('T')[0] },
      },
    ),
});
