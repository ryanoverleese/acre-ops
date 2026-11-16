import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';
import {
  growerCurrentSeasonYear,
  listGrowerHardwareForSeason,
} from '@/lib/supabase/grower-fields';
import { readForGrowerScope } from '@/lib/supabase/grower-admin';
import { staffMetadata } from '@/lib/site-metadata';
import GrowerHardwareList from './GrowerHardwareList';

export const metadata = staffMetadata('grower');
export const dynamic = 'force-dynamic';

export default async function GrowerHardwarePage() {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  if (!session) redirect('/grower/login?callbackUrl=/grower/hardware');

  const season = growerCurrentSeasonYear();
  type Row = Awaited<ReturnType<typeof listGrowerHardwareForSeason>>[number]
    & { operationId?: number; operationName?: string };
  let items: Row[] = [];
  let loadError = false;
  try {
    const scoped = await readForGrowerScope(session, (op) => listGrowerHardwareForSeason(op, season));
    loadError = scoped.failed > 0;
    items = scoped.parts.flatMap(({ operation, value }) => value.map((item) => (
      operation ? { ...item, operationId: operation.id, operationName: operation.name } : item
    )));
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
