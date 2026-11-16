import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GROWER_ADMIN_COOKIE, readGrowerAdminSession } from '@/lib/grower-session';
import {
  listGrowerOperationsForAdmin,
  type GrowerAdminOperation,
} from '@/lib/supabase/grower-admin';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerAdminPicker from './GrowerAdminPicker';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerAdminPage() {
  const admin = await readGrowerAdminSession((await cookies()).get(GROWER_ADMIN_COOKIE)?.value);
  if (!admin) redirect('/grower/login');

  let operations: GrowerAdminOperation[] = [];
  let loadError = false;
  try {
    operations = await listGrowerOperationsForAdmin();
  } catch {
    loadError = true;
  }
  return <GrowerAdminPicker operations={operations} loadError={loadError} />;
}
