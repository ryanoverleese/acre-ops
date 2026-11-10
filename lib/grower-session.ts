// Web Crypto only: shared by Node route guards and edge middleware.
export const GROWER_COOKIE = 'acre-grower-supabase-v1';

export interface GrowerSession {
  operationId: number;
  name: string;
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

export async function createGrowerSession(operationId: number, name: string) {
  const payload = encodeURIComponent(
    JSON.stringify({
      operationId,
      name,
      expires: Date.now() + 12 * 60 * 60 * 1000,
    }),
  );
  return payload + '.' + (await signature(payload));
}

export async function readGrowerSession(
  value: string | undefined,
): Promise<GrowerSession | null> {
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
    const session = JSON.parse(decodeURIComponent(payload));
    return Number.isSafeInteger(session.operationId)
      && session.operationId > 0
      && typeof session.name === 'string'
      && session.expires > Date.now()
      ? {
          operationId: session.operationId,
          name: session.name,
          expires: session.expires,
        }
      : null;
  } catch {
    return null;
  }
}
