import { NextResponse } from 'next/server';
import { asLink, crudCollection, pick } from '@/lib/supabase/crud-route';

export const { POST } = crudCollection({
  table: 'order_items',
  createStatus: 201,
  revalidate: '/orders',
  mapCreate: (body) => {
    const mapped = pick(body, ['quantity', 'unit_price', 'notes', 'product'], {
      links: ['product'],
      aliases: { unit_price: 'unit price' },
    });
    if (mapped instanceof NextResponse) return mapped;
    if (body.order !== undefined) {
      const orderVal = asLink(body.order);
      mapped.order_link = orderVal;
      mapped['order link'] = orderVal;
    }
    return mapped;
  },
});
