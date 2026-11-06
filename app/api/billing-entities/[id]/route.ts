import { crudItem } from '@/lib/supabase/crud-route';

export const { PATCH, DELETE } = crudItem({ table: 'billing_entities' });
