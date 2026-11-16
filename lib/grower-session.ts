// Web Crypto only: shared by Node route guards and edge middleware.
export const GROWER_COOKIE = 'acre-grower-supabase-v1';
/** Acre Insights staff "view as grower" sign-in. Separate cookie, same HMAC. */
export const GROWER_ADMIN_COOKIE = 'acre-grower-admin-v1';

export interface GrowerSession {
  operationId: number;
  name: string;
  expires: number;
  /** True when Acre Insights staff is viewing this farm. Never logged as grower activity. */
  admin?: true;
  /** Staff "All operations" view (admin only; operationId is 0). */
  all?: true;
}

export interface GrowerAdminSession {
  username: string;
  expires: number;
}

const encoder = new TextEncoder();
const toHex = (data: ArrayBuffer) =>
  Array.from(new Uint8Array(data), (b) => b.toString(16).padStart(2, '0')).join('');

async function signature(text: string) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Authentication is not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}

export async function createGrowerSession(
  operationId: number,
  name: string,
  options?: { admin?: boolean; all?: boolean },
) {
  const payload = encodeURIComponent(
    JSON.stringify({
      operationId,
      name,
      expires: Date.now() + 12 * 60 * 60 * 1000,
      ...(options?.admin ? { admin: true } : {}),
      ...(options?.admin && options?.all ? { all: true } : {}),
    }),
  );
  return payload + '.' + (await signature(payload));
}

/** Verify the HMAC and return the decoded JSON payload, or null. */
async function readSigned(value: string | undefined): Promise<Record<string, unknown> | null> {
  if (!value || value.length > 2000) return null;
  const at = value.lastIndexOf('.');
  const payload = value.slice(0, at);
  const mac = value.slice(at + 1);
  try {
    const expected = await signature(payload);
    if (mac.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff) return null;
    const parsed = JSON.parse(decodeURIComponent(payload));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function readGrowerSession(
  value: string | undefined,
): Promise<GrowerSession | null> {
  const session = await readSigned(value);
  if (!session) return null;
  // "All operations" exists only for signed staff sessions; a grower cookie
  // can never carry it, and operationId 0 is valid only together with it.
  const all = session.admin === true && session.all === true;
  return Number.isSafeInteger(session.operationId)
    && (all ? session.operationId === 0 : (session.operationId as number) > 0)
    && typeof session.name === 'string'
    && typeof session.expires === 'number'
    && session.expires > Date.now()
    ? {
        operationId: session.operationId as number,
        name: session.name,
        expires: session.expires,
        ...(session.admin === true ? { admin: true as const } : {}),
        ...(all ? { all: true as const } : {}),
      }
    : null;
}

export async function createGrowerAdminSession(username: string) {
  const payload = encodeURIComponent(
    JSON.stringify({
      kind: 'grower-admin',
      username,
      expires: Date.now() + 12 * 60 * 60 * 1000,
    }),
  );
  return payload + '.' + (await signature(payload));
}

export async function readGrowerAdminSession(
  value: string | undefined,
): Promise<GrowerAdminSession | null> {
  const session = await readSigned(value);
  if (!session) return null;
  return session.kind === 'grower-admin'
    && typeof session.username === 'string'
    && typeof session.expires === 'number'
    && session.expires > Date.now()
    ? { username: session.username, expires: session.expires }
    : null;
}
