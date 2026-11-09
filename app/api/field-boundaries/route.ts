import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { query, transaction } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';
import { BoundaryDatasetError, BoundaryImportDisabled } from '@/lib/field-boundaries/engine';
import { editFieldBoundary, readBoundaryFeatures, type Sql } from '@/lib/field-boundaries/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const sql: Sql = { query: query as Sql['query'], transaction };

function fail(error: unknown): never {
  if (error instanceof BoundaryImportDisabled) throw new DataError(error.message, 403);
  if (error instanceof BoundaryDatasetError) throw new DataError(error.message, 400);
  throw error;
}

export const GET = withApiAuth(async (request: NextRequest) => {
  const parts = (request.nextUrl.searchParams.get('fields') || '').split(',').filter(Boolean);
  if (!parts.length || parts.length > 500 || parts.some(value => !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) {
    return NextResponse.json({ error: 'Request between 1 and 500 field IDs' }, { status: 400, headers });
  }
  return NextResponse.json(await readBoundaryFeatures(sql, [...new Set(parts.map(Number))]), { headers });
});

export const PATCH = withApiAuth(async (request: NextRequest) => {
  const body = await request.json();
  try {
    return NextResponse.json(await editFieldBoundary(sql, positiveId(body.fieldId), body.geometry), { headers });
  } catch (error) { fail(error); }
});
