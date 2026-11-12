import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';
import {
  growerCurrentSeasonYear,
  listGrowerHardwareForSeason,
} from '@/lib/supabase/grower-fields';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerHardwareList from './GrowerHardwareList';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerHardwarePage() {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login?callbackUrl=/grower/hardware');

  const season = growerCurrentSeasonYear();
  let items: Awaited<ReturnType<typeof listGrowerHardwareForSeason>> = [];
  let loadError = false;
  try {
    items = await listGrowerHardwareForSeason(session.operationId, season);
  } catch {
    loadError = true;
  }

  return (
    <>
      {loadError && (
        <p className="grower-banner-error">
          Could not load probes. Check grower database setup and try again.
        </p>
      )}
      <GrowerHardwareList farmName={session.name} season={season} items={items} />
    </>
  );
}
