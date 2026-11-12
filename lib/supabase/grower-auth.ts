import 'server-only';
import { compare, hash } from 'bcryptjs';
import { withGrowerRole } from './grower';
import { DataError, positiveId } from './registry';

const BCRYPT = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/;

export async function hashGrowerPin(pin: unknown): Promise<string | null> {
  if (pin == null || pin === '') return null;
  if (!/^\d{4,6}$/.test(String(pin))) throw new DataError('PIN must be 4–6 digits');
  return hash(String(pin), 12);
}

export type GrowerLoginFarm = {
  id: number;
  name: string;
  grower_pin: string | null;
  is_current_customer: boolean;
};

/**
 * Resolve farm name or grower username → login projection via
 * grower_login_lookup on the grower connection. The returned name is
 * operations.name. Needs DATABASE_URL_GROWER (or owner fallback in non-prod).
 * Does not use the office DATABASE_URL.
 */
export async function lookupGrowerLogin(name: string): Promise<GrowerLoginFarm | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const rows = await withGrowerRole(async (client) => {
    const result = await client.query<{
      id: unknown;
      name: string;
      grower_pin: string | null;
      is_current_customer: boolean;
    }>(
      `SELECT id, name, grower_pin, is_current_customer
         FROM public.grower_login_lookup($1)`,
      [trimmed],
    );
    return result.rows;
  });
  if (rows.length !== 1) return null;
  return {
    id: positiveId(rows[0].id),
    name: rows[0].name,
    grower_pin: rows[0].grower_pin,
    is_current_customer: Boolean(rows[0].is_current_customer),
  };
}

/** Exactly one farm by name (trim, case-insensitive). Never guesses duplicates. */
export async function findGrowerFarmByName(name: string) {
  const farm = await lookupGrowerLogin(name);
  if (!farm) return null;
  return {
    id: farm.id,
    name: farm.name,
    grower_pin: farm.grower_pin,
  };
}

export async function verifyGrowerPin(
  stored: string | null | undefined,
  pin: unknown,
): Promise<boolean> {
  if (!stored || !BCRYPT.test(stored)) return false;
  if (!/^\d{4,6}$/.test(String(pin))) return false;
  return compare(String(pin), stored);
}

/** Pilot allow-list. Default farm name is Fishell Farms until env expands it. */
export function isGrowerPilotFarm(operationId: number, name: string): boolean {
  const ids = (process.env.GROWER_PILOT_OPERATION_IDS || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  if (ids.includes(operationId)) return true;

  const namesEnv = process.env.GROWER_PILOT_FARM_NAMES;
  const names = (namesEnv == null ? 'Fishell Farms' : namesEnv)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return names.includes(name.trim().toLowerCase());
}
