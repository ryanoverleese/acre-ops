import 'server-only';
import { createHash } from 'node:crypto';
import Rijndael from 'rijndael-js';
import type { PivotReading } from './types';

export class ValleyError extends Error {
  constructor(public readonly code: 'CONFIGURATION' | 'UNAVAILABLE' | 'INVALID_RESPONSE') {
    super(code === 'CONFIGURATION' ? 'Valley connection is not configured' : 'Valley readings are unavailable');
    this.name = 'ValleyError';
  }
}
export interface ValleyCredentials { apid: string; key: string; iv: string; username: string; password: string }
export function validateCredentials(c: ValleyCredentials): void {
  if (![c.apid, c.key, c.iv, c.username, c.password].every(v => typeof v === 'string' && v.length > 0)
    || Buffer.byteLength(c.key, 'utf8') !== 32 || Buffer.byteLength(c.iv, 'utf8') !== 32
    || /[,\x00-\x1f]/.test(c.username) || c.username.length > 128 || c.apid.length > 128) {
    throw new ValleyError('CONFIGURATION');
  }
}

// AgSense v1.2.9 pp.1-4: Rijndael with a 256-bit BLOCK, CBC, zero padding.
// AES-256-CBC has a 128-bit block and is NOT protocol-compatible.
// MD5 is required by this legacy vendor protocol, not used for Acre passwords.
export function generateToken(c: ValleyCredentials, now = Date.now()): string {
  validateCredentials(c);
  if (!Number.isFinite(now) || now < 0) throw new ValleyError('CONFIGURATION');
  const digest = createHash('md5').update(c.password, 'utf8').digest('hex');
  const plain = Buffer.from(`${c.username},${digest},${Math.floor(now / 1000)}`, 'utf8');
  const cipher = new Rijndael(Buffer.from(c.key, 'utf8'), 'cbc');
  return Buffer.from(cipher.encrypt(plain, 256, Buffer.from(c.iv, 'utf8'))).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_');
  // Keep '=' here: URLSearchParams encodes it ONCE, to %3D, per the manual.
}

type Raw = Record<string, unknown>;
function object(value: unknown): Raw | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Raw : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0,160) : null;
}
function number(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value.toUpperCase() as T) ? value.toUpperCase() as T : null;
}
function instant(local: string | null, offset: unknown): string | null {
  const match = local?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/);
  const zone = number(offset);
  if (!match || zone === null || zone < -14 || zone > 14) return null;
  const [, mo, day, year, hour, min, sec] = match.map(Number);
  const wall = new Date(Date.UTC(year, mo-1, day, hour, min, sec));
  if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== mo-1 || wall.getUTCDate() !== day
      || wall.getUTCHours() !== hour || wall.getUTCMinutes() !== min || wall.getUTCSeconds() !== sec) return null;
  return new Date(wall.getTime() - zone * 3600000).toISOString();
}
export function normalizePivotStatus(payload: unknown, expectedSerial: string): PivotReading {
  const root = object(payload), device = object(root?.device);
  if (root?.error || root?.Error || !device || String(device.serial) !== expectedSerial || !Array.isArray(device.reading)
      || device.reading.length > 1 || !['pivot', 'trackersp'].includes(String(device.type).toLowerCase())) {
    throw new ValleyError('INVALID_RESPONSE');
  }
  // No start/stop arguments are ever requested. This endpoint must return at
  // most the latest reading; never silently choose one from ambiguous history.
  const reading = device.reading.length === 1 ? object(device.reading[0]) : {};
  if (!reading) throw new ValleyError('INVALID_RESPONSE');
  const angle = number(reading.angle), behind = number(reading.behind);
  const local = text(reading.unit_date) || text(reading.date);
  return {
    serial: expectedSerial, name: text(device.name) || 'Pivot',
    angle: angle !== null && angle >= 0 && angle <= 360 ? angle % 360 : null,
    power: pick(reading.power, ['ON','OFF','IDLE']),
    direction: pick(reading.direction, ['FWD','REV','IDLE','N','S','E','W']),
    isLateral: number(device.lateral) === 1,
    reportedLocalTime: local, observedAt: instant(local, reading.zone_offset),
    behind: behind === 1 ? true : behind === 0 ? false : null,
  };
}

export interface PivotDevice { serial: string; name: string }
export function normalizePivotList(payload: unknown): PivotDevice[] {
  const root = object(payload);
  if (!root || root.error || root.Error) throw new ValleyError('INVALID_RESPONSE');
  // The manual illustrates each device separately, so validate known list
  // containers explicitly. A new upstream shape must be reviewed, not guessed.
  const list = root.devices ?? root.device ?? Object.fromEntries(Object.entries(root).filter(([k]) => /^device\d+$/.test(k)));
  const container = object(list);
  const entries = Array.isArray(list) ? list : container ? ('serial' in container ? [container] : Object.values(container)) : null;
  if (!entries || (!entries.length && !('devices' in root || 'device' in root || root.num_devices === 0))) throw new ValleyError('INVALID_RESPONSE');
  return entries.map(value => {
    const row = object(value);
    if (!row || !/^\d{1,20}$/.test(String(row.serial)) || !['pivot','trackersp'].includes(String(row.type).toLowerCase())) throw new ValleyError('INVALID_RESPONSE');
    return { serial: String(row.serial), name: text(row.name) || 'Pivot' };
  });
}
