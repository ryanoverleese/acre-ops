import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { withApiAuth } from '@/lib/supabase/api';
import { query, transaction } from '@/lib/supabase/database';
import { DataError, positiveId } from '@/lib/supabase/registry';
import { BoundaryDatasetError, BoundaryImportDisabled, parseBoundaryDataset } from '@/lib/field-boundaries/engine';
import { applyBoundaryImport, dryRunBoundaries, readImportReview, resolveBoundaryReplacement, stageBoundaryImport, type Sql } from '@/lib/field-boundaries/store';

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
  try {
    return NextResponse.json(await readImportReview(sql, positiveId(request.nextUrl.searchParams.get('id'))), { headers });
  } catch (error) { fail(error); }
});

export const POST = withApiAuth(async (request: NextRequest) => {
  const raw = await request.text();
  if (raw.length > 8_000_000) throw new DataError('Boundary dataset is too large', 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { throw new DataError('Boundary dataset must be JSON', 400); }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new DataError('Boundary dataset must be JSON', 400);
  const action = body.action ?? 'dry_run';
  try {
    if (action === 'dry_run') return NextResponse.json(await dryRunBoundaries(sql, parseBoundaryDataset(body.dataset)), { headers });
    if (action === 'stage') {
      const staged = await stageBoundaryImport(sql, parseBoundaryDataset(body.dataset), createHash('sha256').update(raw).digest('hex'));
      return NextResponse.json(staged, { status: 201, headers });
    }
    if (action === 'apply') return NextResponse.json(await applyBoundaryImport(sql, positiveId(body.importId)), { headers });
    if (action === 'resolve') return NextResponse.json(await resolveBoundaryReplacement(sql, positiveId(body.rowId)), { headers });
    throw new DataError('Unknown boundary import action', 400);
  } catch (error) { fail(error); }
});
