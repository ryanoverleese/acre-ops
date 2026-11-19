import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';
import {
  getGrowerFieldDetail,
  growerCurrentSeasonYear,
} from '@/lib/supabase/grower-fields';
import { fieldOperationFor, isAllOperationsSession } from '@/lib/grower-scope';
import { findGrowerOperationForAdmin } from '@/lib/supabase/grower-admin';
import { staffMetadata } from '@/lib/site-metadata';
import { probeDotPosition } from '@/lib/valley/grower-icon';
import FieldDetailClient from './FieldDetailClient';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerFieldPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ op?: string | string[] }>;
}) {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login');

  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();

  // Grower sessions always read their own farm; ?op only counts for staff All operations.
  const all = isAllOperationsSession(session);
  const operationId = fieldOperationFor(session, (await searchParams).op);
  if (!operationId) notFound();

  const season = growerCurrentSeasonYear();
  let detail: Awaited<ReturnType<typeof getGrowerFieldDetail>> = null;
  let operationName = session.name;
  let operationMissing = false;
  let loadError = false;
  try {
    if (all) {
      const operation = await findGrowerOperationForAdmin(operationId);
      if (operation) operationName = operation.name;
      else operationMissing = true;
    }
    if (!operationMissing) detail = await getGrowerFieldDetail(operationId, Number(id), season);
  } catch {
    loadError = true;
  }
  if (operationMissing || (!loadError && !detail)) notFound();

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

  // Pivot icons come only from positions staff locked into each rec (loaded
  // with the recs above under this farm's grower scope). No live Valley reads.
  // The green dot marks this field's active probe inside the icon.
  const probe = detail.probes.find((p) => p.lat != null && p.lng != null && !p.removalDate) ?? null;
  const probeDot = probeDotPosition({ lat: detail.lat, lng: detail.lng }, probe, detail.acres);

  return (
    <FieldDetailClient
      pivotProbeDot={probeDot}
      farmName={operationName}
      operationLabel={all ? operationName : null}
      field={{
        id: detail.id,
        name: detail.name,
        acres: detail.acres,
        acresFromBoundary: detail.acresFromBoundary,
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
