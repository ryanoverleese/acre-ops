import { getCachedProbeAssignments, getCachedRows, type Field, type FieldSeason, type Probe, type Operation, type BillingEntity, type Contact } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import WorkflowsClient, { EarlyRemovalData, UninstallProbeData, RmaProbeData, OnOrderProbe } from './WorkflowsClient';

export const dynamic = 'force-dynamic';

async function getWorkflowData(): Promise<{ earlyRemovals: EarlyRemovalData[]; installedProbes: UninstallProbeData[]; rmaProbes: RmaProbeData[]; brandOptions: string[]; onOrderProbes: OnOrderProbe[] }> {
  try {
    const [fields, fieldSeasons, probes, billingEntities, operations, probeAssignments, contacts] = await Promise.all([
      getCachedRows<Field>('fields', undefined, 300),
      getCachedRows<FieldSeason>('field_seasons', undefined, 120),
      getCachedRows<Probe>('probes', undefined, 120),
      getCachedRows<BillingEntity>('billing_entities', undefined, 300),
      getCachedRows<Operation>('operations', undefined, 300),
      getCachedProbeAssignments(),
      getCachedRows<Contact>('contacts', undefined, 300),
    ]);

    const operationMap = buildOperationMap(operations);
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);

    const assignmentsByFieldSeason = new Map<number, typeof probeAssignments>();
    for (const pa of probeAssignments) {
      const fieldSeasonId = pa.field_season?.[0]?.id;
      if (!fieldSeasonId) continue;
      const current = assignmentsByFieldSeason.get(fieldSeasonId) ?? [];
      current.push(pa);
      assignmentsByFieldSeason.set(fieldSeasonId, current);
    }

    const currentSeason = new Date().getFullYear();
    const earlyRemovals: EarlyRemovalData[] = fieldSeasons
      .filter((fs) => Number(fs.season) === currentSeason && !!fs.early_removal?.value)
      .map((fs) => {
        const fieldId = fs.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;
        let operationName = '';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || '';
        }
        const assignmentDates = (assignmentsByFieldSeason.get(fs.id) ?? [])
          .map((pa) => pa.removal_date)
          .filter(Boolean)
          .sort();
        return {
          fieldSeasonId: fs.id,
          fieldName: field?.name || 'Unknown Field',
          operation: operationName,
          crop: fs.crop?.value || '',
          earlyRemoval: fs.early_removal?.value || '',
          removalDate: fs.removal_date || assignmentDates[0] || '',
          plannedRemover: fs.planned_remover?.value || '',
        };
      })
      .sort((a, b) => a.fieldName.localeCompare(b.fieldName));

    const installedProbes: UninstallProbeData[] = probeAssignments
      .filter((pa) => !!pa.field_season?.[0]?.id)
      .map((pa) => {
        const fieldSeasonId = pa.field_season![0].id;
        const fieldSeason = fieldSeasonMap.get(fieldSeasonId);
        const fieldId = fieldSeason?.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;
        let operationName = '';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || '';
        }
        const probeId = pa.probe?.[0]?.id;
        const probe = probeId ? probeMap.get(probeId) : null;
        return {
          assignmentId: pa.id,
          probeId: probeId || 0,
          fieldName: field?.name || 'Unknown Field',
          operation: operationName,
          probeSerial: probe?.serial_number?.toString() || '',
          probeBrand: probe?.brand?.value || '',
          probeLabel: pa.label || '',
          installDate: pa.install_date || '',
          season: fieldSeason?.season || 0,
        };
      })
      .sort((a, b) => a.fieldName.localeCompare(b.fieldName));

    // Build probe → assignments map for RMA (includes season so we can filter current year)
    const probeToAssignments = new Map<number, { id: number; season: number }[]>();
    for (const pa of probeAssignments) {
      const probeId = pa.probe?.[0]?.id;
      if (!probeId) continue;
      const fsId = pa.field_season?.[0]?.id;
      const season = fsId ? (fieldSeasonMap.get(fsId)?.season ?? 0) : 0;
      const existing = probeToAssignments.get(probeId) ?? [];
      existing.push({ id: pa.id, season: Number(season) });
      probeToAssignments.set(probeId, existing);
    }

    const rmaProbes: RmaProbeData[] = probes
      .filter(p => p.serial_number)
      .map(p => ({
        probeId: p.id,
        probeSerial: p.serial_number?.toString() || '',
        probeBrand: p.brand?.value || '',
        assignments: probeToAssignments.get(p.id) ?? [],
      }))
      .sort((a, b) => a.probeSerial.localeCompare(b.probeSerial));

    const brandOptions = Array.from(new Set(probes.map(p => p.brand?.value).filter(Boolean) as string[])).sort();

    const onOrderProbes = probes
      .filter(p => {
        const s = p.status?.value?.toLowerCase() ?? '';
        return s === 'on order' || s === 'on order - trade';
      })
      .map(p => ({
        id: p.id,
        brand: p.brand?.value ?? '',
        status: p.status?.value ?? '',
        notes: p.notes ?? '',
        yearNew: p.year_new ?? null,
      }));

    return { earlyRemovals, installedProbes, rmaProbes, brandOptions, onOrderProbes };
  } catch (error) {
    console.error('Error fetching workflow data:', error);
    return { earlyRemovals: [], installedProbes: [], rmaProbes: [], brandOptions: [], onOrderProbes: [] };
  }
}

export default async function WorkflowsPage() {
  const { earlyRemovals, installedProbes, rmaProbes, brandOptions, onOrderProbes } = await getWorkflowData();
  return <WorkflowsClient earlyRemovals={earlyRemovals} installedProbes={installedProbes} rmaProbes={rmaProbes} brandOptions={brandOptions} onOrderProbes={onOrderProbes} />;
}
