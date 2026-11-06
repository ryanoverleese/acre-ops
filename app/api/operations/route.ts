import { crudCollection, pick } from '@/lib/supabase/crud-route';

export const { POST } = crudCollection({
  table: 'operations',
  createStatus: 201,
  mapCreate: (body) => pick(body, ['name', 'notes'], { required: ['name'] }),
});
