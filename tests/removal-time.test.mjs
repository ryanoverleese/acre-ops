import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  chicagoCalendarDate,
  formatRemovalWhen,
  removalClockMatchesDate,
} from '../lib/removal-time.ts';

const clock = '2026-09-17T19:14:00.000Z';

test('Chicago calendar date follows the instant, including late evening', () => {
  assert.equal(chicagoCalendarDate(new Date('2026-09-17T19:14:00.000Z')), '2026-09-17');
  assert.equal(chicagoCalendarDate(new Date('2026-09-18T03:30:00.000Z')), '2026-09-17');
  assert.equal(chicagoCalendarDate(new Date('2026-01-17T04:30:00.000Z')), '2026-01-16');
});

test('a known pull shows the Chicago clock and a date-only pull does not', () => {
  const timed = formatRemovalWhen('2026-09-17', clock);
  assert.match(timed, /^9\/17\/2026, 2:14\sPM$/);
  const short = formatRemovalWhen('2026-09-17', clock, 'short');
  assert.match(short, /^Sep 17, 2:14\sPM$/);
  const long = formatRemovalWhen('2026-09-17', clock, 'long');
  assert.match(long, /^Sep 17, 2026, 2:14\sPM$/);

  const dateOnly = formatRemovalWhen('2026-09-17', null);
  assert.equal(dateOnly, '9/17/2026');
  assert.doesNotMatch(dateOnly, /\d:\d|AM|PM/);
  assert.equal(formatRemovalWhen('2026-09-17', '', 'short'), 'Sep 17');
  assert.equal(formatRemovalWhen('2026-09-17', undefined, 'long'), 'Sep 17, 2026');
  // A date-only string must not be read as UTC midnight and shifted to the 16th.
  assert.equal(formatRemovalWhen('2026-09-17T00:00:00.000Z', null), '9/17/2026');
});

test('a clock from another Chicago day is not painted onto the stored date', () => {
  assert.equal(removalClockMatchesDate('2026-09-01', '2026-11-10T22:30:00.000Z'), false);
  const shown = formatRemovalWhen('2026-09-01', '2026-11-10T22:30:00.000Z');
  assert.equal(shown, '9/1/2026');
  assert.doesNotMatch(shown, /\d:\d|AM|PM/);
  assert.equal(removalClockMatchesDate('2026-01-16', '2026-01-17T04:30:00.000Z'), true);
  assert.match(formatRemovalWhen('2026-01-16', '2026-01-17T04:30:00.000Z'), /^1\/16\/2026, 10:30\sPM$/);
});

test('the migration adds removal_at and does not rewrite removal_date', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261110224311_probe_removal_at.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN removal_at timestamptz/);
  assert.doesNotMatch(sql, /\bUPDATE\b/i);
  assert.doesNotMatch(sql, /ALTER COLUMN removal_date/i);
  assert.doesNotMatch(sql, /removal_at timestamptz default/i);
});
