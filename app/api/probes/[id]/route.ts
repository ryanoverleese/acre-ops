import { NextResponse } from 'next/server';
import { asLink, crudItem, pick } from '@/lib/supabase/crud-route';

export const { GET, PATCH, DELETE } = crudItem({
  table: 'probes',
  mapUpdate: (body) => {
    const mapped = pick(body, [
      'serial_number',
      'brand',
      'billing_entity',
      'contact',
      'year_new',
      'status',
      'rack',
      'rack_slot',
      'notes',
      'damages_repairs',
      'trade_year',
      'is_trade',
    ]);
    if (mapped instanceof NextResponse) return mapped;
    if (body.billing_entity !== undefined) mapped.billing_entity = asLink(body.billing_entity);
    if (body.contact !== undefined) mapped.contact = asLink(body.contact);
    if (body.rack_slot !== undefined) {
      mapped.rack_slot = body.rack_slot ? parseInt(String(body.rack_slot), 10) : null;
    }
    if (body.trade_year !== undefined) mapped.trade_year = body.trade_year || null;
    return mapped;
  },
});
