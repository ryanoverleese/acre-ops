#!/usr/bin/env node
/**
 * Make the bcrypt hash for the Acre Insights "view as grower" sign-in.
 *
 * Usage (PIN is read from stdin so it never lands in shell history):
 *   read -s PIN && printf '%s' "$PIN" | node scripts/grower-admin-hash.mjs; unset PIN
 *
 * Put the printed hash in the host env as GROWER_ADMIN_PIN_HASH (Netlify UI:
 * paste as-is). In a local .env file escape each "$" as "\$", because Next's
 * env loader expands "$..." references. Never commit the PIN or the hash.
 */
import { hash } from 'bcryptjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const pin = Buffer.concat(chunks).toString('utf8').trim();
if (!/^\d{4,6}$/.test(pin)) {
  console.error('PIN must be 4–6 digits (read from stdin).');
  process.exit(1);
}
console.log(await hash(pin, 12));
