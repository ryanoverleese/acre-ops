import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS } from '@/lib/baserow';

const BASEROW_API_URL = 'https://api.baserow.io/api/database/rows/table';
const BASEROW_TOKEN = process.env.BASEROW_API_TOKEN;

type IncomingRec = {
  field_season: number;
  date: string;
  recommendation?: string;
  suggested_water_day?: string;
  priority?: boolean;
  report_type?: string;
};

function buildPayload(rec: IncomingRec): Record<string, unknown> {
  // Only send fields we know exist in Baserow (both name variants for safety)
  const payload: Record<string, unknown> = {
    'field season': rec.field_season ? [rec.field_season] : [],
    'field_season': rec.field_season ? [rec.field_season] : [],
    date: rec.date,
    recommendation: rec.recommendation || '',
  };
  // Single-select fields: only include when non-empty (empty string is invalid)
  if (rec.suggested_water_day) {
    payload.suggested_water_day = rec.suggested_water_day;
    payload['suggested water day'] = rec.suggested_water_day;
  }
  if (rec.priority !== undefined) payload.priority = rec.priority;
  if (rec.report_type) {
    payload.report_type = rec.report_type;
    payload['report type'] = rec.report_type;
  }
  return payload;
}

// One request with a couple of retries on throttle. Far safer than firing N
// parallel requests (which Baserow rate-limits with 429s).
async function fetchWithRetry(url: string, init: RequestInit, tries = 4): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    last = res;
    await new Promise(r => setTimeout(r, 400 * (i + 1))); // 0.4s, 0.8s, 1.2s backoff
  }
  return last as Response;
}

const authHeaders = {
  Authorization: `Token ${BASEROW_TOKEN}`,
  'Content-Type': 'application/json',
};

// Server-side, idempotent cleanup. We NEVER trust client-supplied row ids to
// decide what to delete (a stale browser tab once looped, deleting already-gone
// ids and piling up duplicates). Instead we ask Baserow which rows currently
// exist for this date + these fields + this report type, and remove every one
// that isn't a row we just created. Result: exactly one row per
// (field_season, date, report_type) survives, no matter how many times saved.
async function findStaleRowIds(
  date: string,
  scopeFieldSeasons: Set<number>,
  reportTypes: Set<string>,
  keepIds: Set<number>
): Promise<number[]> {
  const stale: number[] = [];
  let url:
    | string
    | null = `${BASEROW_API_URL}/${TABLE_IDS.water_recs}/?user_field_names=true&size=200&filter__date__date_equal=${encodeURIComponent(date)}`;
  while (url) {
    const res = await fetchWithRetry(url, { method: 'GET', headers: authHeaders });
    if (!res.ok) {
      console.error('Cleanup query failed (new rows are safe, old ones linger):', await res.text());
      break;
    }
    const data = await res.json();
    for (const row of data.results || []) {
      if (keepIds.has(row.id)) continue;
      const rt = row.report_type?.value ?? row.report_type;
      if (reportTypes.size && !reportTypes.has(rt)) continue;
      const fsList: { id: number }[] = Array.isArray(row.field_season) ? row.field_season : [];
      const inScope = fsList.some(fs => scopeFieldSeasons.has(fs.id));
      if (inScope) stale.push(row.id);
    }
    // Baserow's next URL is http:// and pageful — just walk pages by hand.
    url = data.next ? url.replace(/([?&]page=\d+)?$/, '') : null;
    if (url && data.next) {
      const nextPage = new URL(data.next).searchParams.get('page');
      url = `${BASEROW_API_URL}/${TABLE_IDS.water_recs}/?user_field_names=true&size=200&filter__date__date_equal=${encodeURIComponent(date)}&page=${nextPage}`;
    }
  }
  return stale;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      records,
      scopeFieldSeasons,
      reportType,
    } = body as {
      records: IncomingRec[];
      scopeFieldSeasons?: number[];
      reportType?: string;
    };

    if (!Array.isArray(records)) {
      return NextResponse.json({ error: 'records array is required' }, { status: 400 });
    }

    // Nothing to write — do NOT delete anything (avoid wiping rows on an empty save).
    if (records.length === 0) {
      return NextResponse.json({ success: true, created: 0, createdIds: [], total: 0 });
    }

    // 1) CREATE FIRST, in a single batch request. If this fails we have NOT
    //    touched the existing rows, so the user's saved recs can never be lost
    //    to a throttle/partial failure (the old delete-then-recreate bug).
    const createRes = await fetchWithRetry(
      `${BASEROW_API_URL}/${TABLE_IDS.water_recs}/batch/?user_field_names=true`,
      { method: 'POST', headers: authHeaders, body: JSON.stringify({ items: records.map(buildPayload) }) }
    );

    if (!createRes.ok) {
      const error = await createRes.text();
      console.error('Batch create failed (kept existing rows):', error);
      return NextResponse.json(
        { success: false, created: 0, createdIds: [], total: records.length, error },
        { status: 502 }
      );
    }

    const createData = await createRes.json();
    const createdRows: { id: number }[] = createData.items || [];
    const createdIds = createdRows.map(r => r.id);

    // 2) Only AFTER the new rows exist, clean up the OLD ones — chosen by
    //    server-side query, not by client-supplied ids. Scope: the operation's
    //    fields (so clearing a field also removes its row) for this date and
    //    report type, minus the rows we just created.
    const date = records[0].date;
    const scope = new Set<number>(
      Array.isArray(scopeFieldSeasons) && scopeFieldSeasons.length
        ? scopeFieldSeasons
        : records.map(r => r.field_season)
    );
    const reportTypes = new Set<string>(
      reportType ? [reportType] : records.map(r => r.report_type).filter(Boolean) as string[]
    );
    const keep = new Set<number>(createdIds);

    const toDelete = await findStaleRowIds(date, scope, reportTypes, keep);
    if (toDelete.length > 0) {
      // Baserow batch-delete caps around 200 ids per call.
      for (let i = 0; i < toDelete.length; i += 200) {
        const chunk = toDelete.slice(i, i + 200);
        const delRes = await fetchWithRetry(
          `${BASEROW_API_URL}/${TABLE_IDS.water_recs}/batch-delete/`,
          { method: 'POST', headers: authHeaders, body: JSON.stringify({ items: chunk }) }
        );
        if (!delRes.ok) {
          console.error('Batch delete of old rows failed (new rows are safe):', await delRes.text());
        }
      }
    }

    return NextResponse.json({
      success: true,
      created: createdIds.length,
      createdIds,
      deleted: toDelete.length,
      total: records.length,
    });
  } catch (error) {
    console.error('Bulk water recs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
