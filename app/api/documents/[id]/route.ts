import { crudItem } from '@/lib/supabase/crud-route';

export const { DELETE } = crudItem({ table: 'documents' });
