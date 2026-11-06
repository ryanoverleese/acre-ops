import { crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({
  table: 'inventory',
  mapUpdate: (body) => pick(body, ['item_name', 'category', 'quantity']),
});
