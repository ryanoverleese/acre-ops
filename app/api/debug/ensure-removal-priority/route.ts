import { NextRequest, NextResponse } from 'next/server';
import { TABLE_IDS, getBaserowJwt, bustTableCache } from '@/lib/baserow';

export const dynamic = 'force-dynamic';

const FIELD_NAME = 'removal_priority';
const OPTIONS = [
  { value: 'Priority', color: 'red' },
  { value: 'Normal', color: 'gray' },
] as const;
const SHANE_FIELD_SEASON_ID = 2443;

/**
 * One-shot / idempotent: create field_seasons.removal_priority if missing,
 * then mark Shane Wohlgemuth 2026 Johnson 1/4 (id 2443) as Priority.
 * Auth: ?token= must match BASEROW_API_TOKEN (schema ops need JWT from env).
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  const expected = process.env.BASEROW_API_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jwt = await getBaserowJwt();
  if (!jwt) {
    return NextResponse.json(
      { error: 'JWT auth failed — BASEROW_EMAIL / BASEROW_PASSWORD required' },
      { status: 500 }
    );
  }

  const tableId = TABLE_IDS.field_seasons;
  const fieldsUrl = `https://api.baserow.io/api/database/fields/table/${tableId}/`;
  const fieldsResp = await fetch(fieldsUrl, {
    headers: { Authorization: `JWT ${jwt}` },
    cache: 'no-store',
  });
  if (!fieldsResp.ok) {
    const text = await fieldsResp.text();
    return NextResponse.json(
      { error: `Failed to list fields: ${fieldsResp.status} ${text}` },
      { status: 500 }
    );
  }

  const fields: Array<{
    id: number;
    name: string;
    type: string;
    select_options?: Array<{ id: number; value: string; color: string }>;
  }> = await fieldsResp.json();

  let field = fields.find((f) => f.name === FIELD_NAME) ?? null;
  let created = false;

  if (!field) {
    const createResp = await fetch(fieldsUrl, {
      method: 'POST',
      headers: {
        Authorization: `JWT ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: FIELD_NAME,
        type: 'single_select',
        select_options: OPTIONS.map((o) => ({ value: o.value, color: o.color })),
      }),
    });
    if (!createResp.ok) {
      const text = await createResp.text();
      return NextResponse.json(
        { error: `Failed to create field: ${createResp.status} ${text}` },
        { status: 500 }
      );
    }
    field = (await createResp.json()) as {
      id: number;
      name: string;
      type: string;
      select_options?: Array<{ id: number; value: string; color: string }>;
    };
    created = true;
  }

  if (!field) {
    return NextResponse.json({ error: 'removal_priority field missing after create' }, { status: 500 });
  }

  const ensured = field;
  const priorityOpt = (ensured.select_options || []).find((o) => o.value === 'Priority');
  if (!priorityOpt) {
    return NextResponse.json(
      { error: 'Priority option missing on removal_priority field', field: ensured },
      { status: 500 }
    );
  }

  const rowUrl = `https://api.baserow.io/api/database/rows/table/${tableId}/${SHANE_FIELD_SEASON_ID}/?user_field_names=true`;
  const patchResp = await fetch(rowUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Token ${expected}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ [FIELD_NAME]: priorityOpt.id }),
  });
  if (!patchResp.ok) {
    const text = await patchResp.text();
    return NextResponse.json(
      {
        error: `Field ok but failed to mark Shane: ${patchResp.status} ${text}`,
        fieldId: ensured.id,
        created,
      },
      { status: 500 }
    );
  }

  const row = await patchResp.json();
  bustTableCache('field_seasons');

  return NextResponse.json({
    ok: true,
    created,
    fieldId: ensured.id,
    fieldName: FIELD_NAME,
    options: ensured.select_options,
    shaneMarked: row?.[FIELD_NAME]?.value === 'Priority' || row?.[FIELD_NAME] === priorityOpt.id,
    shaneValue: row?.[FIELD_NAME],
  });
}

export async function GET(request: NextRequest) {
  // Same as POST — convenient to hit from a browser once.
  return POST(request);
}
