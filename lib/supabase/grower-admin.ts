import 'server-only';
import { query } from './database';
import { verifyGrowerPin } from './grower-auth';
import { positiveId } from './registry';

/**
 * Acre Insights staff "view as grower" login.
 *
 * The credential lives only in server env, the same way grower PINs live in
 * operations.grower_pin: a bcrypt hash, never the plaintext.
 *   GROWER_ADMIN_USERNAME   sign-in name (default "Acreinsights")
 *   GROWER_ADMIN_PIN_HASH   bcrypt hash of the 4–6 digit PIN
 * With no hash set, admin sign-in is off.
 */
const DEFAULT_ADMIN_USERNAME = 'Acreinsights';

export function growerAdminUsername(): string {
  return (process.env.GROWER_ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
}

export function isGrowerAdminUsername(name: unknown): boolean {
  if (typeof name !== 'string' || !process.env.GROWER_ADMIN_PIN_HASH) return false;
  return name.trim().toLowerCase() === growerAdminUsername().toLowerCase();
}

export async function verifyGrowerAdminLogin(name: unknown, pin: unknown): Promise<boolean> {
  if (!isGrowerAdminUsername(name)) return false;
  return verifyGrowerPin(process.env.GROWER_ADMIN_PIN_HASH?.trim(), pin);
}

export type GrowerAdminOperation = {
  id: number;
  name: string;
  pinSet: boolean;
};

const CURRENT_CUSTOMER = `EXISTS (
  SELECT 1
    FROM public.contact_operations AS co
    JOIN public.contact_customer_types AS cct ON cct.contact_id = co.contact_id
    JOIN public.contact_customer_type_options AS opt ON opt.id = cct.customer_type_id
   WHERE co.operation_id = o.id
     AND opt.value = 'Current Customer'
)`;

/** Read-only list of current-customer operations for the staff picker. */
export async function listGrowerOperationsForAdmin(): Promise<GrowerAdminOperation[]> {
  const rows = await query<{ id: unknown; name: string; pin_set: boolean }>(
    `SELECT o.id, o.name, (o.grower_pin IS NOT NULL) AS pin_set
       FROM public.operations AS o
      WHERE ${CURRENT_CUSTOMER}
      ORDER BY lower(btrim(o.name)), o.id`,
  );
  return rows.map((row) => ({
    id: positiveId(row.id),
    name: row.name,
    pinSet: Boolean(row.pin_set),
  }));
}

/** One current-customer operation by id, or null. */
export async function findGrowerOperationForAdmin(
  operationId: unknown,
): Promise<{ id: number; name: string } | null> {
  const id = positiveId(operationId);
  const rows = await query<{ id: unknown; name: string }>(
    `SELECT o.id, o.name
       FROM public.operations AS o
      WHERE o.id = $1
        AND ${CURRENT_CUSTOMER}`,
    [id],
  );
  return rows.length === 1 ? { id: positiveId(rows[0].id), name: rows[0].name } : null;
}
