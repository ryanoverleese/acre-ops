import { NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { DataError } from '@/lib/supabase/registry';
import {
  farmHasCurrentCustomer,
  findGrowerFarmByName,
  isGrowerPilotFarm,
  verifyGrowerPin,
} from '@/lib/supabase/grower-auth';
import { createGrowerSession, GROWER_COOKIE } from '@/lib/grower-session';

const attempts = new Map<string, { count: number; until: number }>();

export const POST = withApiAuth(async (request) => {
  const body = await request.json().catch(() => ({}));
  const farmName = body?.farm ?? body?.name;
  const pin = body?.pin;
  if (typeof farmName !== 'string' || !farmName.trim()) {
    throw new DataError('Farm name and PIN required');
  }
  if (!/^\d{4,6}$/.test(String(pin))) {
    throw new DataError('Farm name and PIN required');
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

  const farm = await findGrowerFarmByName(farmName);
  // Same message for missing farm, bad PIN, past-only, non-pilot, or duplicate names.
  const current = farm ? await farmHasCurrentCustomer(farm.id) : false;
  const pilot = farm ? isGrowerPilotFarm(farm.id, farm.name) : false;
  const valid = farm && current && pilot && await verifyGrowerPin(farm.grower_pin, pin);
  if (!farm || !current || !pilot || !valid) {
    throw new DataError('Incorrect farm name or PIN', 401);
  }

  attempts.delete(key);
  const response = NextResponse.json({ ok: true, operationId: farm.id, name: farm.name });
  response.cookies.set(
    GROWER_COOKIE,
    await createGrowerSession(farm.id, farm.name),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60,
    },
  );
  return response;
});

export const DELETE = withApiAuth(async () => {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(GROWER_COOKIE);
  return response;
});
