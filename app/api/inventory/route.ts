import { crudCollection, pick } from '@/lib/supabase/crud-route';

export const { POST } = crudCollection({
  table: 'inventory',
  mapCreate: (body) => pick(body, ['item_name', 'category', 'quantity']),
});
