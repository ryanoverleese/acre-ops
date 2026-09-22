import { NextResponse } from 'next/server';
import { TABLE_IDS, getCachedRows } from '@/lib/baserow';

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

interface Row { [key: string]: unknown }

/** Same value helpers as Removals — single_select / link shapes. */
const val = (v: unknown): string => {
  if (Array.isArray(v)) return v.map(val).filter(Boolean).join(', ');
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    return String((v as { value: unknown }).value ?? '');
  }
  return v == null ? '' : String(v);
};
const linkId = (v: unknown): number | null =>
  Array.isArray(v) && v[0] && typeof v[0] === 'object' && 'id' in (v[0] as Record<string, unknown>)
    ? Number((v[0] as { id: number }).id) : null;

export const dynamic = 'force-dynamic';

/**
 * Public tally:
 * - count: probe_assignments with removal_date = today (America/Chicago)
 * - remainingInstalled / leftToGo: same as Removals all=1 remaining —
 *   current-season assignments still probe_status=installed
 */
export async function GET() {
  const date = todayChicago();
  // Mirror Removals: season = server getFullYear() (same as /api/installer/removals).
  const season = new Date().getFullYear();

  if (!BASEROW_TOKEN) {
    return NextResponse.json({ error: 'Baserow not configured' }, { status: 500 });
  }

  try {
    const pulledUrl =
      `${BASEROW_API_URL}/${TABLE_IDS.probe_assignments}/` +
      `?user_field_names=true&size=1` +
      `&filter__removal_date__date_equals_today=${encodeURIComponent('America/Chicago')}`;

    const [pulledRes, assignments, fieldSeasons] = await Promise.all([
      fetch(pulledUrl, {
        headers: { Authorization: `Token ${BASEROW_TOKEN}` },
        cache: 'no-store',
      }),
      getCachedRows<Row>('probe_assignments', undefined, 60),
      getCachedRows<Row>('field_seasons', undefined, 60),
    ]);

    if (!pulledRes.ok) {
      const body = await pulledRes.text();
      console.error('pulled-today Baserow error:', pulledRes.status, body);
      return NextResponse.json({ error: 'Failed to load count' }, { status: 502 });
    }

    const pulledData = await pulledRes.json();
    const count = typeof pulledData.count === 'number' ? pulledData.count : 0;

    // Removals remaining (all=1): field_season.season === season && status installed.
    const fsMap = new Map(fieldSeasons.map((r) => [Number(r.id), r]));
    let remainingInstalled = 0;
    for (const pa of assignments) {
      const fsId = linkId(pa.field_season);
      if (!fsId) continue;
      const fs = fsMap.get(fsId);
      if (!fs || Number(fs.season) !== season) continue;
      if (val(pa.probe_status).toLowerCase() === 'installed') remainingInstalled++;
    }

    return NextResponse.json({
      count,
      remainingInstalled,
      leftToGo: remainingInstalled,
      date,
      season,
      timezone: 'America/Chicago',
      label: 'TOTAL PROBES PULLED TODAY',
      leftLabel: 'LEFT TO GO',
    });
  } catch (e) {
    console.error('pulled-today error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
