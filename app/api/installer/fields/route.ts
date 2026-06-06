import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedRows,
  type Field,
  type FieldSeason,
  type ProbeAssignment,
  type BillingEntity,
} from '@/lib/baserow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get('season') || String(new Date().getFullYear()), 10);

  try {
    const [fieldSeasons, fields, probeAssignments, billingEntities] = await Promise.all([
      getCachedRows<FieldSeason>('field_seasons', undefined, 60),
      getCachedRows<Field>('fields', undefined, 120),
      getCachedRows<ProbeAssignment>('probe_assignments', undefined, 60),
      getCachedRows<BillingEntity>('billing_entities', undefined, 300),
    ]);

    const fieldMap = new Map(fields.map(f => [f.id, f]));
    const billingEntityMap = new Map(billingEntities.map(be => [be.id, be]));

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
        const beId = field?.billing_entity?.[0]?.id;
        const operationName = beId ? (billingEntityMap.get(beId)?.name ?? '') : '';
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
