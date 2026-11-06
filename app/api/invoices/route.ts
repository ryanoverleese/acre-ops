import { crudCollection, pick } from '@/lib/supabase/crud-route';

export const { POST } = crudCollection({
  table: 'invoices',
  createStatus: 201,
  mapCreate: (body) =>
    pick(body, ['billing_entity', 'amount', 'sent_at', 'paid_at', 'notes'], {
      required: ['billing_entity'],
      links: ['billing_entity'],
      defaults: {
        season: body.season || new Date().getFullYear(),
        status: body.status || 'Draft',
      },
    }),
});
