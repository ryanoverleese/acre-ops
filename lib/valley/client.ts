import 'server-only';
import { generateToken, normalizePivotList, normalizePivotStatus, validateCredentials, ValleyError, type ValleyCredentials } from './protocol';

export function valleyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VALLEY_READ_ONLY_ENABLED === 'true';
}
export function readCredentials(env: NodeJS.ProcessEnv = process.env): ValleyCredentials {
  const useAgSenseNames = !!(env.AGSENSE365_USERNAME || env.AGSENSE365_PASSWORD);
  const c = { apid: env.VALLEY_APID || '', key: env.VALLEY_API_KEY || '', iv: env.VALLEY_API_IV || '',
    username: (useAgSenseNames ? env.AGSENSE365_USERNAME : env.VALLEY_USERNAME) || '',
    password: (useAgSenseNames ? env.AGSENSE365_PASSWORD : env.VALLEY_PASSWORD) || '' };
  validateCredentials(c);
  return c;
}
export function createValleyClient(c: ValleyCredentials, fetcher: typeof fetch = fetch, now = Date.now, signal?: AbortSignal) {
  validateCredentials(c);
  async function read(path: '/json/GetDevices/pivot/' | '/json/GetDeviceStatus/', username: string, serial?: string): Promise<unknown> {
    if (!username || username.length > 128 || /[,\x00-\x1f]/.test(username)
        || serial !== undefined && !/^\d{1,20}$/.test(serial)) throw new ValleyError('CONFIGURATION');
    // Fixed host, fixed GET-only endpoints. No caller-supplied URL or commands.
    const url = new URL(path, 'https://api.wagnet.net');
    url.searchParams.set('username', username);
    url.searchParams.set('apid', c.apid);
    url.searchParams.set('token', generateToken(c, now()));
    if (serial) url.searchParams.set('serial', serial);
    try {
      signal?.throwIfAborted();
      const response = await fetcher(url, { method: 'GET', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      if (!response.ok) throw new ValleyError('UNAVAILABLE');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 2000000) throw new ValleyError('INVALID_RESPONSE');
      const body = await response.text();
      if (body.length > 2000000) throw new ValleyError('INVALID_RESPONSE');
      return JSON.parse(body);
    } catch {
      // Never forward/log an upstream error, body, URL, or error cause: the
      // vendor authenticates in the query string and may echo its token.
      throw new ValleyError('UNAVAILABLE');
    }
  }
  return {
    async listPivots(username = c.username) { return normalizePivotList(await read('/json/GetDevices/pivot/', username)); },
    async latestPivot(username: string, serial: string) {
      return normalizePivotStatus(await read('/json/GetDeviceStatus/', username, serial), serial);
    },
  };
}
