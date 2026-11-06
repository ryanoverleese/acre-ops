import { crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({
  table: 'operations',
  mapUpdate: (body) => pick(body, ['name', 'notes']),
});
