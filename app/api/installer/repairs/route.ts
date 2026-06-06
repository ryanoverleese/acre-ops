import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedRows,
  getRows,
  type Repair,
  type Field,
  type FieldSeason,
  type ProbeAssignment,
  type Probe,
  type Operation,
  type BillingEntity,
  type Contact,
} from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fresh = searchParams.get('fresh') === '1';

  try {
    const c = (table: string, ttl: number) =>
      fresh ? getRows(table as any) : getCachedRows(table as any, undefined, ttl);

    const [repairs, fieldSeasons, fields, probeAssignments, probes, billingEntities, operations, contacts] = await Promise.all([
      c('repairs', 30) as Promise<Repair[]>,
      c('field_seasons', 60) as Promise<FieldSeason[]>,
      c('fields', 120) as Promise<Field[]>,
      c('probe_assignments', 30) as Promise<ProbeAssignment[]>,
      c('probes', 120) as Promise<Probe[]>,
      c('billing_entities', 300) as Promise<BillingEntity[]>,
      c('operations', 300) as Promise<Operation[]>,
      c('contacts', 300) as Promise<Contact[]>,
    ]);

    const operationMap = buildOperationMap(operations);
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);
    const fieldMap = new Map(fields.map(f => [f.id, f]));
    const fieldSeasonMap = new Map(fieldSeasons.map(fs => [fs.id, fs]));
    const paMap = new Map(probeAssignments.map(pa => [pa.id, pa]));
    const probeMap = new Map(probes.map(p => [p.id, p]));

    const toNum = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
      return 0;
    };

    const openRepairs = repairs
      .filter(r => !r.repaired_at)
      .map(r => {
        const fsId = r.field_season?.[0]?.id;
        const fs = fsId ? fieldSeasonMap.get(fsId) : null;
        const fieldId = fs?.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;

        let operationName = '';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || '';
        }

        const paId = r.probe_assignment?.[0]?.id;
        const pa = paId ? paMap.get(paId) : null;
        const probeId = pa?.probe?.[0]?.id;
        const probe = probeId ? probeMap.get(probeId) : null;

        return {
          id: r.id,
          fieldSeasonId: fsId ?? 0,
          fieldName: field?.name ?? 'Unknown Field',
          operation: operationName,
          lat: toNum(field?.lat),
          lng: toNum(field?.lng),
          problem: r.problem ?? '',
          reportedAt: r.reported_at ?? '',
          probeSerial: probe?.serial_number?.toString() ?? '',
          probeAssignmentId: paId ?? null,
          probeNumber: pa ? (toNum(pa.probe_number) || 1) : null,
          label: pa?.label ?? '',
        };
      });

    return NextResponse.json({ repairs: openRepairs });
  } catch (error) {
    console.error('installer repairs error:', error);
    return NextResponse.json({ error: 'Failed to fetch repairs' }, { status: 500 });
  }
}
