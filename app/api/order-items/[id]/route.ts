import { crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({
  table: 'order_items',
  revalidate: '/orders',
  mapUpdate: (body) =>
    pick(body, ['quantity', 'unit_price', 'notes'], {
      aliases: { unit_price: 'unit price' },
    }),
});
