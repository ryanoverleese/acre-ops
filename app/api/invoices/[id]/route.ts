import { NextResponse } from 'next/server';
import { asLink, crudItem, pick } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({
  table: 'invoices',
  mapUpdate: (body) => {
    const mapped = pick(body, [
      'amount',
      'status',
      'sent_at',
      'deposit_at',
      'paid_at',
      'notes',
      'season',
      'check_number',
      'actual_billed_amount',
      'invoice_number',
      'matched_in_qb',
      'billing_entity',
    ]);
    if (mapped instanceof NextResponse) return mapped;
    if (body.billing_entity !== undefined) mapped.billing_entity = asLink(body.billing_entity);
    return mapped;
  },
});
