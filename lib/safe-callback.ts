/**
 * Post-login path from the login query.
 * A repeated callbackUrl is an array. URLSearchParams.get, which production
 * used, returns the first value. Only a same-origin path is kept.
 */
export function safeCallbackUrl(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}
