import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedRows,
  type Field,
  type FieldSeason,
  type ProbeAssignment,
  type Operation,
  type BillingEntity,
  type Contact,
} from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get('season') || String(new Date().getFullYear()), 10);

  try {
    const [fieldSeasons, fields, probeAssignments, billingEntities, operations, contacts] = await Promise.all([
      getCachedRows<FieldSeason>('field_seasons', undefined, 60),
      getCachedRows<Field>('fields', undefined, 120),
      getCachedRows<ProbeAssignment>('probe_assignments', undefined, 60),
      getCachedRows<BillingEntity>('billing_entities', undefined, 300),
      getCachedRows<Operation>('operations', undefined, 300),
      getCachedRows<Contact>('contacts', undefined, 300),
    ]);

    const operationMap = buildOperationMap(operations);
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);
    const fieldMap = new Map(fields.map(f => [f.id, f]));

    const paByFs = new Map<number, { probeAssignmentId: number; probeNumber: number; label: string }[]>();
    for (const pa of probeAssignments) {
      const fsId = pa.field_season?.[0]?.id;
      if (!fsId) continue;
      const arr = paByFs.get(fsId) ?? [];
      arr.push({
        probeAssignmentId: pa.id,
        probeNumber: typeof pa.probe_number === 'number' ? pa.probe_number : 1,
        label: pa.label ?? '',
      });
      paByFs.set(fsId, arr);
    }

    const result = fieldSeasons
      .filter(fs => Number(fs.season) === season)
      .map(fs => {
        const fieldId = fs.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;
        let operationName = '';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || '';
        }
        return {
          fieldSeasonId: fs.id,
          fieldName: field?.name ?? '',
          operation: operationName,
          probes: paByFs.get(fs.id) ?? [],
        };
      })
      .filter(r => r.fieldName)
      .sort((a, b) => a.fieldName.localeCompare(b.fieldName));

    return NextResponse.json({ fields: result });
  } catch (error) {
    console.error('installer fields error:', error);
    return NextResponse.json({ error: 'Failed to fetch fields' }, { status: 500 });
  }
}
