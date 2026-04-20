import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedRows,
  getProbeAssignments,
  type Field,
  type FieldSeason,
  type Probe,
  type Operation,
  type BillingEntity,
  type Contact,
} from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const installer = searchParams.get('installer');
  const season = parseInt(searchParams.get('season') || String(new Date().getFullYear()), 10);

  if (!installer) {
    return NextResponse.json({ error: 'installer param required' }, { status: 400 });
  }

  try {
    const [fields, fieldSeasons, probes, billingEntities, operations, probeAssignments, contacts] =
      await Promise.all([
        getCachedRows<Field>('fields', undefined, 120),
        getCachedRows<FieldSeason>('field_seasons', undefined, 60),
        getCachedRows<Probe>('probes', undefined, 120),
        getCachedRows<BillingEntity>('billing_entities', undefined, 300),
        getCachedRows<Operation>('operations', undefined, 300),
        getProbeAssignments(),
        getCachedRows<Contact>('contacts', undefined, 300),
      ]);

    const operationMap = buildOperationMap(operations);
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);

    void billingEntities;

    const history = probeAssignments
      .filter((pa) => {
        if ((pa.installer ?? '') !== installer) return false;
        if (!pa.install_date) return false;
        const fsId = pa.field_season?.[0]?.id;
        if (!fsId) return false;
        const fs = fieldSeasonMap.get(fsId);
        if (!fs || Number(fs.season) !== season) return false;
        return true;
      })
      .map((pa) => {
        const fsId = pa.field_season![0].id;
        const fs = fieldSeasonMap.get(fsId)!;
        const fieldId = fs.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;

        let operationName = '';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || '';
        }

        const probeId = pa.probe?.[0]?.id ?? null;
        const probe = probeId ? probeMap.get(probeId) : null;

        return {
          id: pa.id,
          fieldName: field?.name ?? 'Unknown Field',
          operation: operationName,
          crop: fs.crop?.value ?? '',
          probeSerial: probe?.serial_number?.toString() ?? '',
          installDate: pa.install_date ?? '',
          label: pa.label ?? '',
        };
      })
      .sort((a, b) => (b.installDate || '').localeCompare(a.installDate || ''));

    return NextResponse.json({ history, season });
  } catch (error) {
    console.error('installer history error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
