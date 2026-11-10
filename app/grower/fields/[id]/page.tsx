import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';
import {
  getGrowerFieldDetail,
  growerCurrentSeasonYear,
} from '@/lib/supabase/grower-fields';
import { staffMetadata } from '@/lib/site-metadata';
import FieldDetailClient from './FieldDetailClient';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerFieldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login');

  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();

  const season = growerCurrentSeasonYear();
  let detail: Awaited<ReturnType<typeof getGrowerFieldDetail>> = null;
  let loadError = false;
  try {
    detail = await getGrowerFieldDetail(session.operationId, Number(id), season);
  } catch {
    loadError = true;
  }
  if (!loadError && !detail) notFound();

  if (loadError || !detail) {
    return (
      <div className="grower-shell">
        <p className="grower-banner-error">
          Could not load this field. Go back to your field list and try again.
        </p>
        <p className="grower-empty">
          <a href="/grower/fields" className="grower-back">← Back to fields</a>
        </p>
      </div>
    );
  }

  return (
    <FieldDetailClient
      farmName={session.name}
      field={{
        id: detail.id,
        name: detail.name,
        acres: detail.acres,
        lat: detail.lat,
        lng: detail.lng,
        season: detail.season,
        boundaries: detail.boundaries,
        probes: detail.probes,
        waterRecs: detail.waterRecs,
      }}
    />
  );
}
