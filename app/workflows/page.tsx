import { getProbeAssignments, getCachedRows, type Field, type FieldSeason, type Probe, type Operation, type BillingEntity, type Contact } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import WorkflowsClient, { UninstallProbeData } from './WorkflowsClient';

export const dynamic = 'force-dynamic';

async function getWorkflowData(): Promise<{ installedProbes: UninstallProbeData[] }> {
  try {
    const [fields, fieldSeasons, probes, billingEntities, operations, probeAssignments, contacts] = await Promise.all([
      getCachedRows<Field>('fields', undefined, 300),
      getCachedRows<FieldSeason>('field_seasons', undefined, 120),
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

    const installedProbes: UninstallProbeData[] = probeAssignments
      .filter((pa) => {
        if (!pa.field_season?.[0]?.id) return false;
        return pa.probe_status?.value?.toLowerCase() === 'installed';
      })
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

    return { installedProbes };
  } catch (error) {
    console.error('Error fetching workflow data:', error);
    return { installedProbes: [] };
  }
}

export default async function WorkflowsPage() {
  const { installedProbes } = await getWorkflowData();
  return <WorkflowsClient installedProbes={installedProbes} />;
}
