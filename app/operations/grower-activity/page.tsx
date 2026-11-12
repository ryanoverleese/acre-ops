import { listGrowerActivityForOffice } from '@/lib/supabase/grower-activity';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerActivityClient from './GrowerActivityClient';

export const metadata = staffMetadata('growerActivity');
export const dynamic = 'force-dynamic';

export default async function GrowerActivityPage() {
  const farms = await listGrowerActivityForOffice();
  return <GrowerActivityClient farms={farms ?? []} unavailable={farms == null} />;
}
