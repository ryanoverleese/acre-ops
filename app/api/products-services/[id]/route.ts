import { crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH } = crudItem({
  table: 'products_services',
  mapUpdate: (body) =>
    pick(body, [
      'service_type',
      'rate',
      'dealer_fee',
      'description',
      'status',
      'category',
      'unit',
      'active',
    ]),
});
