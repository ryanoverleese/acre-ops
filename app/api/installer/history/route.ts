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
  const debug = searchParams.get('debug') === '1';

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

    // Diagnostic counters
    const stepCounts = { totalPA: probeAssignments.length, withInstaller: 0, withInstallDate: 0, withFS: 0, inSeason: 0, matched: 0 };
    const seenInstallers = new Set<string>();
    const seenInstallerTypes = new Set<string>();
    const droppedExamples: Array<{ paId: number; reason: string; paInstaller?: unknown; fsSeason?: unknown }> = [];

    // Read installer field loosely — may be string OR {id,value} OR [{id,value}]
    const readInstaller = (pa: { installer?: unknown }): string => {
      const v = pa.installer;
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && v.length > 0 && typeof (v[0] as { value?: unknown })?.value === 'string') return (v[0] as { value: string }).value;
      if (v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'string') return (v as { value: string }).value;
      return '';
    };

    const history = probeAssignments
      .filter((pa) => {
        const paInst = readInstaller(pa);
        if (pa.installer != null) seenInstallerTypes.add(Array.isArray(pa.installer) ? 'array' : typeof pa.installer);
        if (paInst) seenInstallers.add(paInst);
        if (paInst !== installer) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'installer mismatch', paInstaller: pa.installer }); return false; }
        stepCounts.withInstaller++;
        if (!pa.install_date) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'no install_date' }); return false; }
        stepCounts.withInstallDate++;
        const fsId = pa.field_season?.[0]?.id;
        if (!fsId) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'no field_season link' }); return false; }
        stepCounts.withFS++;
        const fs = fieldSeasonMap.get(fsId);
        if (!fs) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'field_season not found' }); return false; }
        if (Number(fs.season) !== season) { if (droppedExamples.length < 5) droppedExamples.push({ paId: pa.id, reason: 'season mismatch', fsSeason: fs.season }); return false; }
        stepCounts.inSeason++;
        stepCounts.matched++;
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
          installNotes: pa.install_notes ?? '',
        };
      })
      .sort((a, b) => (b.installDate || '').localeCompare(a.installDate || ''));

    if (debug) {
      return NextResponse.json({
        history,
        season,
        requestedInstaller: installer,
        stepCounts,
        seenInstallers: Array.from(seenInstallers).sort(),
        seenInstallerTypes: Array.from(seenInstallerTypes),
        droppedExamples,
      });
    }

    return NextResponse.json({ history, season });
  } catch (error) {
    console.error('installer history error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
