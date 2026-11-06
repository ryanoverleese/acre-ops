import { crudCollection } from '@/lib/supabase/crud-route';

export const { POST } = crudCollection({ table: 'contacts' });
