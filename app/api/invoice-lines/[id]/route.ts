import { crudItem } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({ table: 'invoice_lines' });
