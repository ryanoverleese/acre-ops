import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readGrowerSession, GROWER_COOKIE } from '@/lib/grower-session';
import {
  growerCurrentSeasonYear,
  listGrowerFieldsForSeason,
} from '@/lib/supabase/grower-fields';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerHome from './GrowerHome';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerPage() {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login');

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
      <GrowerHome
        farmName={session.name}
        season={season}
        fields={fields.map((f) => ({
          id: f.id,
          name: f.name,
          acres: f.acres,
          fieldSeasonId: f.fieldSeasonId,
        }))}
      />
    </>
  );
}
