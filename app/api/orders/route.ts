import { NextResponse } from 'next/server';
import { asLink, crudCollection, pick } from '@/lib/supabase/crud-route';

export const { GET, POST } = crudCollection({
  table: 'orders',
  listAsArray: true,
  createStatus: 201,
  revalidate: '/orders',
  mapCreate: (body) => {
    const mapped = pick(body, ['billing_entity', 'order_date', 'status', 'notes', 'quote_valid_days'], {
      links: ['billing_entity'],
      aliases: {
        billing_entity: 'billing entity',
        order_date: 'order date',
        quote_valid_days: 'quote valid days',
      },
    });
    if (mapped instanceof NextResponse) return mapped;
    if (body.billing_entity !== undefined && !Array.isArray(body.billing_entity) && body.billing_entity) {
      mapped.billing_entity = asLink(body.billing_entity);
      mapped['billing entity'] = mapped.billing_entity;
    }
    return mapped;
  },
});
