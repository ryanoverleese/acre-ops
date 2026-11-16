import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { DataError } from '@/lib/supabase/registry';
import {
  isGrowerPilotFarm,
  lookupGrowerLogin,
  verifyGrowerPin,
} from '@/lib/supabase/grower-auth';
import {
  createGrowerAdminSession,
  createGrowerSession,
  GROWER_ADMIN_COOKIE,
  GROWER_COOKIE,
  readGrowerAdminSession,
  readGrowerSession,
} from '@/lib/grower-session';
import { recordGrowerActivity } from '@/lib/supabase/grower-activity';
import { ALL_OPERATIONS_NAME } from '@/lib/grower-scope';
import {
  findGrowerOperationForAdmin,
  isGrowerAdminUsername,
  verifyGrowerAdminLogin,
} from '@/lib/supabase/grower-admin';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 12 * 60 * 60,
};

const attempts = new Map<string, { count: number; until: number }>();

export const POST = withApiAuth(async (request) => {
  const body = await request.json().catch(() => ({}));
  const farmName = body?.farm ?? body?.name;
  const pin = body?.pin;
  if (typeof farmName !== 'string' || !farmName.trim()) {
    throw new DataError('Farm or username and PIN required');
  }
  if (!/^\d{4,6}$/.test(String(pin))) {
    throw new DataError('Farm or username and PIN required');
  }

  const key = farmName.trim().toLowerCase();
  const now = Date.now();
  const prior = attempts.get(key);
  if (prior && prior.until > now && prior.count >= 10) {
    throw new DataError('Too many attempts; try again later', 429);
  }
  attempts.set(key, {
    count: prior && prior.until > now ? prior.count + 1 : 1,
    until: prior && prior.until > now ? prior.until : now + 15 * 60 * 1000,
  });
  if (attempts.size > 1000) {
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  }

  // Acre Insights staff sign-in: env-held bcrypt hash, no farm row, no activity log.
  if (isGrowerAdminUsername(farmName)) {
    if (!(await verifyGrowerAdminLogin(farmName, pin))) {
      throw new DataError('Incorrect farm name, username, or PIN', 401);
    }
    attempts.delete(key);
    const response = NextResponse.json({ ok: true, admin: true, next: '/grower/admin' });
    response.cookies.set(
      GROWER_ADMIN_COOKIE,
      await createGrowerAdminSession(farmName.trim()),
      COOKIE_OPTIONS,
    );
    response.cookies.delete(GROWER_COOKIE);
    return response;
  }

  // Grower connection only (DATABASE_URL_GROWER + AUTH_SECRET). No office DATABASE_URL.
  const farm = await lookupGrowerLogin(farmName);
  // Same message for missing farm, bad PIN, past-only, non-pilot, or duplicate names.
  const current = farm?.is_current_customer === true;
  const pilot = farm ? isGrowerPilotFarm(farm.id, farm.name) : false;
  const valid = farm && current && pilot && await verifyGrowerPin(farm.grower_pin, pin);
  if (!farm || !current || !pilot || !valid) {
    throw new DataError('Incorrect farm name, username, or PIN', 401);
  }

  attempts.delete(key);
  await recordGrowerActivity(farm.id, 'login', '/grower/login');
  const response = NextResponse.json({ ok: true, operationId: farm.id, name: farm.name });
  response.cookies.set(
    GROWER_COOKIE,
    await createGrowerSession(farm.id, farm.name),
    COOKIE_OPTIONS,
  );
  // A real grower sign-in ends any staff view in this browser.
  response.cookies.delete(GROWER_ADMIN_COOKIE);
  return response;
});

/** Staff picks a farm to view. Requires the admin cookie; read-only like any grower session. */
export const PUT = withApiAuth(async (request) => {
  const admin = await readGrowerAdminSession((await cookies()).get(GROWER_ADMIN_COOKIE)?.value);
  if (!admin) throw new DataError('Sign in with an authorized account', 401);
  const body = await request.json().catch(() => ({}));
  if (body?.all === true) {
    const response = NextResponse.json({ ok: true, all: true, name: ALL_OPERATIONS_NAME });
    response.cookies.set(
      GROWER_COOKIE,
      await createGrowerSession(0, ALL_OPERATIONS_NAME, { admin: true, all: true }),
      COOKIE_OPTIONS,
    );
    return response;
  }
  const operation = await findGrowerOperationForAdmin(body?.operationId);
  if (!operation) throw new DataError('Operation not found', 404);
  const response = NextResponse.json({ ok: true, operationId: operation.id, name: operation.name });
  response.cookies.set(
    GROWER_COOKIE,
    await createGrowerSession(operation.id, operation.name, { admin: true }),
    COOKIE_OPTIONS,
  );
  return response;
});

export const DELETE = withApiAuth(async () => {
  const session = await readGrowerSession((await cookies()).get(GROWER_COOKIE)?.value);
  // Staff viewing a farm is not that farm's activity.
  if (session && !session.admin) await recordGrowerActivity(session.operationId, 'logout', null);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(GROWER_COOKIE);
  response.cookies.delete(GROWER_ADMIN_COOKIE);
  return response;
});
