import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';
import {
  growerCurrentSeasonYear,
  listGrowerWaterRecsForSeason,
} from '@/lib/supabase/grower-fields';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerRecommendationsList from './GrowerRecommendationsList';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerRecommendationsPage() {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login?callbackUrl=/grower/recommendations');

  const season = growerCurrentSeasonYear();
  let items: Awaited<ReturnType<typeof listGrowerWaterRecsForSeason>> = [];
  let loadError = false;
  try {
    items = await listGrowerWaterRecsForSeason(session.operationId, season);
  } catch {
    loadError = true;
  }

  return (
    <>
      {loadError && (
        <p className="grower-banner-error">
          Could not load recommendations. Check grower database setup and try again.
        </p>
      )}
      <GrowerRecommendationsList farmName={session.name} season={season} items={items} />
    </>
  );
}
