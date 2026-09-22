import { NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

/** Calendar date in America/Chicago as YYYY-MM-DD. */
export function todayChicago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const dynamic = 'force-dynamic';

/**
 * Public tally: how many probe_assignments have removal_date = today (America/Chicago).
 * Uses Baserow date_equals_today so the count tracks Chicago midnight, not UTC.
 */
export async function GET() {
  const date = todayChicago();

  if (!BASEROW_TOKEN) {
    return NextResponse.json({ error: 'Baserow not configured' }, { status: 500 });
  }

  try {
    // size=1 — we only need Baserow's total `count` for this date.
    const url =
      `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/` +
      `?user_field_names=true&size=1` +
      `&filter__removal_date__date_equals_today=${encodeURIComponent('America/Chicago')}`;

    const res = await fetch(url, {
      headers: { Authorization: `Token ${BASEROW_TOKEN}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('pulled-today Baserow error:', res.status, body);
      return NextResponse.json({ error: 'Failed to load count' }, { status: 502 });
    }

    const data = await res.json();
    const count = typeof data.count === 'number' ? data.count : 0;

    return NextResponse.json({
      count,
      date,
      timezone: 'America/Chicago',
      label: 'TOTAL PROBES PULLED TODAY',
    });
  } catch (e) {
    console.error('pulled-today error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
