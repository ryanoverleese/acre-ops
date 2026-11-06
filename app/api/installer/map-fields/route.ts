import { withApiAuth } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/supabase/database';
import { getCachedRows } from '@/lib/supabase/adapter';
import type { Field, FieldSeason } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Field IDs (+ optional pin coords) for installer map Season / All modes.
 * Boundaries stay reference-only — this just tells the client what to load.
 */
export const GET = withApiAuth(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') === 'all' ? 'all' : 'season';
  const season = parseInt(searchParams.get('season') || String(new Date().getFullYear()), 10);

  try {
    if (scope === 'all') {
      const rows = await query<{ field_id: number; name: string | null; lat: number | null; lng: number | null }>(
        `SELECT b.field_id, f.name, f.lat, f.lng
           FROM public.field_boundaries b
           JOIN public.fields f ON f.id = b.field_id
          ORDER BY f.name NULLS LAST, b.field_id`,
      );
      return NextResponse.json({
        scope: 'all',
        fields: rows.map(r => ({
          id: Number(r.field_id),
          name: r.name || 'Unnamed',
          lat: r.lat != null ? Number(r.lat) : null,
          lng: r.lng != null ? Number(r.lng) : null,
        })),
      });
    }

    const [fieldSeasons, fields] = await Promise.all([
      getCachedRows<FieldSeason>('field_seasons', undefined, 60),
      getCachedRows<Field>('fields', undefined, 120),
    ]);
    const fieldMap = new Map(fields.map(f => [f.id, f]));
    const seasonFieldIds = new Set<number>();
    for (const fs of fieldSeasons) {
      if (Number(fs.season) !== season) continue;
      const fieldId = fs.field?.[0]?.id;
      if (fieldId) seasonFieldIds.add(fieldId);
    }

    const list = [...seasonFieldIds]
      .map(id => {
        const f = fieldMap.get(id);
        return {
          id,
          name: f?.name || 'Unnamed',
          lat: f?.lat ?? null,
          lng: f?.lng ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ scope: 'season', season, fields: list });
  } catch (error) {
    console.error('installer map-fields error:', error);
    return NextResponse.json({ error: 'Failed to fetch map fields' }, { status: 500 });
  }
});
