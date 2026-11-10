import 'server-only';
import { compare, hash } from 'bcryptjs';
import { query } from './database';
import { DataError, positiveId } from './registry';

const BCRYPT = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/;

export async function hashGrowerPin(pin: unknown): Promise<string | null> {
  if (pin == null || pin === '') return null;
  if (!/^\d{4,6}$/.test(String(pin))) throw new DataError('PIN must be 4–6 digits');
  return hash(String(pin), 12);
}

/** Exactly one farm by name (trim, case-insensitive). Never guesses duplicates. */
export async function findGrowerFarmByName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const rows = await query<{ id: unknown; name: string; grower_pin: string | null }>(
    `SELECT id, name, grower_pin
       FROM public.operations
      WHERE lower(btrim(name)) = lower(btrim($1))`,
    [trimmed],
  );
  if (rows.length !== 1) return null;
  return {
    id: positiveId(rows[0].id),
    name: rows[0].name,
    grower_pin: rows[0].grower_pin,
  };
}

export async function farmHasCurrentCustomer(operationId: number): Promise<boolean> {
  const rows = await query(
    `SELECT 1
       FROM public.contact_operations AS co
       JOIN public.contact_customer_types AS cct ON cct.contact_id = co.contact_id
       JOIN public.contact_customer_type_options AS opt ON opt.id = cct.customer_type_id
      WHERE co.operation_id = $1
        AND opt.value = 'Current Customer'
      LIMIT 1`,
    [positiveId(operationId)],
  );
  return rows.length === 1;
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
