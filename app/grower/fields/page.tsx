import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';
import {
  growerCurrentSeasonYear,
  listGrowerFieldsForSeason,
} from '@/lib/supabase/grower-fields';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerFieldsList from './GrowerFieldsList';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerFieldsPage() {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login?callbackUrl=/grower/fields');

  const season = growerCurrentSeasonYear();
  let fields: Awaited<ReturnType<typeof listGrowerFieldsForSeason>> = [];
  let loadError = false;
  try {
    fields = await listGrowerFieldsForSeason(session.operationId, season);
  } catch {
    loadError = true;
  }

  return (
    <>
      {loadError && (
        <p className="grower-banner-error">
          Could not load fields. Check grower database setup and try again.
        </p>
      )}
      <GrowerFieldsList
        farmName={session.name}
        season={season}
        fields={fields.map((f) => ({
          id: f.id,
          name: f.name,
          acres: f.acres,
          acresFromBoundary: f.acresFromBoundary,
          probeStatuses: f.probeStatuses,
          boundary: f.boundary,
        }))}
      />
    </>
  );
}
