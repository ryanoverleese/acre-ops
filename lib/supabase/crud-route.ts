import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { dataRequest, withApiAuth } from './api';
import { bustTableCache } from './adapter';

export type JsonBody = Record<string, unknown>;
export type BodyResult = JsonBody | NextResponse;

export type CrudConfig = {
  table: string;
  /** Tables to bust after a successful write. Defaults to `table`. */
  bust?: string | string[];
  /** Paths to revalidate after a successful write. */
  revalidate?: string | string[];
  /** Map/validate create body. Return a NextResponse to short-circuit. */
  mapCreate?: (body: JsonBody) => BodyResult;
  /** Map/validate update body. Return a NextResponse to short-circuit. */
  mapUpdate?: (body: JsonBody) => BodyResult;
  /** GET collection returns `results` as a bare array. */
  listAsArray?: boolean;
  /** Transform the full list payload before responding. */
  mapList?: (data: { results?: unknown[] } & JsonBody) => unknown;
  /** HTTP status for successful creates. Default 200. */
  createStatus?: number;
};

type IdContext = { params: Promise<{ id: string }> };

function listOf(value: string | string[] | undefined, fallback?: string): string[] {
  if (value == null) return fallback ? [fallback] : [];
  return Array.isArray(value) ? value : [value];
}

function afterWrite(cfg: CrudConfig) {
  for (const table of listOf(cfg.bust, cfg.table)) bustTableCache(table);
  for (const path of listOf(cfg.revalidate)) revalidatePath(path);
}

async function forward(response: Response, onOk: (data: unknown) => NextResponse): Promise<NextResponse> {
  if (!response.ok) {
    const error = await response.text();
    return NextResponse.json({ error }, { status: response.status });
  }
  if (response.status === 204) return NextResponse.json({ success: true });
  return onOk(await response.json());
}

/** Wrap a link-row value as an id array (empty when cleared). */
export function asLink(value: unknown): unknown[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? [n] : [value];
  }
  return [value];
}

/** Copy selected keys from a request body; optional required/link handling. */
export function pick(
  body: JsonBody,
  keys: string[],
  opts?: {
    required?: string[];
    links?: string[];
    defaults?: JsonBody;
    aliases?: Record<string, string>;
  },
): BodyResult {
  for (const key of opts?.required || []) {
    if (body[key] == null || body[key] === '') {
      return NextResponse.json({ error: `${key} is required` }, { status: 400 });
    }
  }
  const out: JsonBody = { ...(opts?.defaults || {}) };
  for (const key of keys) {
    if (body[key] === undefined) continue;
    out[key] = opts?.links?.includes(key) ? asLink(body[key]) : body[key];
    const alias = opts?.aliases?.[key];
    if (alias) out[alias] = out[key];
  }
  return out;
}

/** Authenticated collection handlers (GET list + POST create). */
export function crudCollection(cfg: CrudConfig) {
  return {
    GET: withApiAuth(async function GET() {
      const response = await dataRequest({ table: cfg.table });
      return forward(response, (data) => {
        const payload = data as { results?: unknown[] } & JsonBody;
        if (cfg.mapList) return NextResponse.json(cfg.mapList(payload));
        if (cfg.listAsArray) return NextResponse.json(payload.results || []);
        return NextResponse.json(payload);
      });
    }),
    POST: withApiAuth(async function POST(request: NextRequest) {
      const body = (await request.json()) as JsonBody;
      const mapped = cfg.mapCreate ? cfg.mapCreate(body) : body;
      if (mapped instanceof NextResponse) return mapped;
      const response = await dataRequest(
        { table: cfg.table },
        { method: 'POST', body: JSON.stringify(mapped) },
      );
      return forward(response, (data) => {
        afterWrite(cfg);
        return NextResponse.json(data, { status: cfg.createStatus ?? 200 });
      });
    }),
  };
}

/** Authenticated item handlers (GET one + PATCH + DELETE). */
export function crudItem(cfg: CrudConfig) {
  return {
    GET: withApiAuth(async function GET(_request: NextRequest, { params }: IdContext) {
      const { id } = await params;
      const response = await dataRequest({ table: cfg.table, id });
      return forward(response, (data) => NextResponse.json(data));
    }),
    PATCH: withApiAuth(async function PATCH(request: NextRequest, { params }: IdContext) {
      const { id } = await params;
      const body = (await request.json()) as JsonBody;
      const mapped = cfg.mapUpdate ? cfg.mapUpdate(body) : body;
      if (mapped instanceof NextResponse) return mapped;
      const response = await dataRequest(
        { table: cfg.table, id },
        { method: 'PATCH', body: JSON.stringify(mapped) },
      );
      return forward(response, (data) => {
        afterWrite(cfg);
        return NextResponse.json(data);
      });
    }),
    DELETE: withApiAuth(async function DELETE(_request: NextRequest, { params }: IdContext) {
      const { id } = await params;
      const response = await dataRequest({ table: cfg.table, id }, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.text();
        return NextResponse.json({ error }, { status: response.status });
      }
      afterWrite(cfg);
      return NextResponse.json({ success: true });
    }),
  };
}
