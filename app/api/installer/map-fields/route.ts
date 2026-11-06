import { fieldOperationLabel } from '@/lib/data-mappings';
import { withApiAuth } from '@/lib/supabase/api';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/supabase/database';
import { getCachedRows } from '@/lib/supabase/adapter';
import type { Contact, Field, FieldSeason, Operation } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Field IDs + name/operation for installer map Season / All modes.
 * Used for boundary loading and tap labels (who's field / field name).
 */
export const GET = withApiAuth(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') === 'all' ? 'all' : 'season';
  const season = parseInt(searchParams.get('season') || String(new Date().getFullYear()), 10);

  try {
    const [fields, operations, contacts] = await Promise.all([
      getCachedRows<Field>('fields', undefined, 120),
      getCachedRows<Operation>('operations', undefined, 300),
      getCachedRows<Contact>('contacts', undefined, 300),
    ]);

    const operationMap = new Map(operations.map(op => [op.id, op.name]));
    const billingToOperationMap = new Map<number, number[]>();
    for (const contact of contacts) {
      const contactOpIds = contact.operations?.map(op => op.id) || [];
      const contactBeIds = contact.billing_entity?.map(be => be.id) || [];
      for (const beId of contactBeIds) {
        const ids = billingToOperationMap.get(beId) || [];
        for (const opId of contactOpIds) {
          if (!ids.includes(opId)) ids.push(opId);
        }
        billingToOperationMap.set(beId, ids);
      }
    }

    const labelFor = (field: Field | undefined) =>
      field ? fieldOperationLabel(field, billingToOperationMap, operationMap) : '';

    if (scope === 'all') {
      const rows = await query<{ field_id: number }>(
        'SELECT field_id FROM public.field_boundaries ORDER BY field_id',
      );
      const fieldMap = new Map(fields.map(f => [f.id, f]));
      const list = rows
        .map(r => {
          const id = Number(r.field_id);
          const f = fieldMap.get(id);
          return {
            id,
            name: f?.name || 'Unnamed',
            operation: labelFor(f),
            lat: f?.lat ?? null,
            lng: f?.lng ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({ scope: 'all', fields: list });
    }

    const fieldSeasons = await getCachedRows<FieldSeason>('field_seasons', undefined, 60);
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
          operation: labelFor(f),
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
