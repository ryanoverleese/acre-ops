#!/usr/bin/env node
/**
 * LOCAL / QA ONLY — mint a grower session cookie for independent browser testing.
 *
 * Does not print PINs. Does not call production. Requires AUTH_SECRET (or
 * NEXTAUTH_SECRET) in the environment of the machine running this script — the
 * same secret the target app instance uses to verify cookies.
 *
 * Usage:
 *   AUTH_SECRET='…from your local/preview env…' \
 *   node scripts/grower-qa-mint-cookie.mjs --operation-id 1 --name 'QA Grower Farm'
 *
 * Then in the browser DevTools → Application → Cookies for that host, set:
 *   name: acre-grower-supabase-v1
 *   value: <printed cookie>
 *   HttpOnly: (browser may not allow setting HttpOnly manually; prefer a
 *   private preview that accepts the cookie via a staff-only QA path, or use
 *   a local next dev instance).
 *
 * Prefer creating a synthetic Current Customer farm + PIN yourself in a
 * non-production database and signing in through /grower/login so you never
 * paste secrets into chat.
 */
import { webcrypto } from 'node:crypto';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const operationId = Number(flag('--operation-id'));
const name = flag('--name');
const hours = Number(flag('--hours') || 12);
const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

if (!Number.isSafeInteger(operationId) || operationId <= 0 || !name?.trim()) {
  console.error('Required: --operation-id <positive int> --name <farm name>');
  process.exit(1);
}
if (!secret) {
  console.error('Set AUTH_SECRET (or NEXTAUTH_SECRET) in this shell — do not paste it into chat.');
  process.exit(1);
}

const encoder = new TextEncoder();
const payload = encodeURIComponent(
  JSON.stringify({
    operationId,
    name: name.trim(),
    expires: Date.now() + hours * 60 * 60 * 1000,
  }),
);
const key = await webcrypto.subtle.importKey(
  'raw',
  encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
);
const mac = Buffer.from(await webcrypto.subtle.sign('HMAC', key, encoder.encode(payload))).toString('hex');
const cookie = `${payload}.${mac}`;

console.log('Cookie name: acre-grower-supabase-v1');
console.log('Cookie value:');
console.log(cookie);
console.log('');
console.log('Use only against an app instance that shares this AUTH_SECRET.');
console.log('Do not commit the value. Do not paste AUTH_SECRET into chat.');
