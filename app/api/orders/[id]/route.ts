import { NextResponse } from 'next/server';
import { asLink, crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({
  table: 'orders',
  revalidate: '/orders',
  mapUpdate: (body) => {
    const mapped = pick(body, ['billing_entity', 'order_date', 'status', 'notes', 'quote_valid_days'], {
      aliases: {
        billing_entity: 'billing entity',
        order_date: 'order date',
        quote_valid_days: 'quote valid days',
      },
    });
    if (mapped instanceof NextResponse) return mapped;
    if (body.billing_entity !== undefined) {
      mapped.billing_entity = asLink(body.billing_entity);
      mapped['billing entity'] = mapped.billing_entity;
    }
    return mapped;
  },
});
