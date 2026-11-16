import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import GrowerChrome from '@/components/grower/GrowerChrome';
import { GROWER_COOKIE, readGrowerSession } from '@/lib/grower-session';

export default async function GrowerLayout({ children }: { children: ReactNode }) {
  // Operation name comes from the signed grower session (operations.name at sign-in).
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  return (
    <GrowerChrome operationName={session?.name ?? null} viewingAs={session?.admin === true}>
      {children}
    </GrowerChrome>
  );
}
