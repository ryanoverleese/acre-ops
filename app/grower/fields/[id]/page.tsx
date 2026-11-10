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
  try {
    detail = await getGrowerFieldDetail(session.operationId, Number(id), season);
  } catch {
    redirect('/grower');
  }
  if (!detail) notFound();

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
