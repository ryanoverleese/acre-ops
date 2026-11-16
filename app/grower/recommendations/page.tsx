import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';
import {
  growerCurrentSeasonYear,
  listGrowerWaterRecsForSeason,
} from '@/lib/supabase/grower-fields';
import { readForGrowerScope } from '@/lib/supabase/grower-admin';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerRecommendationsList from './GrowerRecommendationsList';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerRecommendationsPage() {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login?callbackUrl=/grower/recommendations');

  const season = growerCurrentSeasonYear();
  type Row = Awaited<ReturnType<typeof listGrowerWaterRecsForSeason>>[number]
    & { operationId?: number; operationName?: string };
  let items: Row[] = [];
  let loadError = false;
  try {
    const scoped = await readForGrowerScope(session, (op) => listGrowerWaterRecsForSeason(op, season));
    loadError = scoped.failed > 0;
    items = scoped.parts.flatMap(({ operation, value }) => value.map((rec) => (
      operation ? { ...rec, operationId: operation.id, operationName: operation.name } : rec
    )));
    // Several farms: newest first across all of them.
    if (scoped.parts.length > 1) items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
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
