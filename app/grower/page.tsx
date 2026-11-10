import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readGrowerSession, GROWER_COOKIE } from '@/lib/grower-session';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerHome from './GrowerHome';

export const metadata = staffMetadata('grower');

export default async function GrowerPage() {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login');
  return <GrowerHome farmName={session.name} />;
}
