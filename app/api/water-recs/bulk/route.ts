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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deleteIds, records } = body as { deleteIds?: number[]; records: IncomingRec[] };

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
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${BASEROW_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: records.map(buildPayload) }),
      }
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

    // 2) Only AFTER the new rows exist, delete the old ones (batch delete).
    //    Never delete a row we just created.
    const toDelete = Array.isArray(deleteIds)
      ? deleteIds.filter((id: number) => !createdIds.includes(id))
      : [];
    if (toDelete.length > 0) {
      const delRes = await fetchWithRetry(
        `${BASEROW_API_URL}/${TABLE_IDS.water_recs}/batch-delete/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${BASEROW_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: toDelete }),
        }
      );
      if (!delRes.ok) {
        // New rows are saved; the old ones just lingered. Non-fatal — the client
        // will reconcile on reload. Log it so we can see if it recurs.
        console.error('Batch delete of old rows failed (new rows are safe):', await delRes.text());
      }
    }

    return NextResponse.json({
      success: true,
      created: createdIds.length,
      createdIds,
      total: records.length,
    });
  } catch (error) {
    console.error('Bulk water recs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
