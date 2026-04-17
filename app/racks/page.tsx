import { getRows, getProbes, ProbeRackSlot, getBillingEntities, getContacts, getOperations, getProbeAssignments, getFieldSeasons, getFields } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import RacksClient from './RacksClient';

export const dynamic = 'force-dynamic';

const CURRENT_SEASON = 2026;

export default async function RacksPage() {
  const [slots, probes, billingEntities, contacts, operations, probeAssignments, fieldSeasons, fields] = await Promise.all([
    getRows<ProbeRackSlot>('probe_rack'),
    getProbes(),
    getBillingEntities(),
    getContacts(),
    getOperations(),
    getProbeAssignments(),
    getFieldSeasons(),
    getFields(),
  ]);

  const processedProbes = probes.map((p) => ({
    id: p.id,
    serialNumber: p.serial_number || '',
    status: p.status?.value || 'Unknown',
    brand: p.brand?.value || 'Unknown',
  }));

  // Operation lookup: probe.billing_entity → operation name
  const operationMap = buildOperationMap(operations);
  const { billingToOperationNames } = buildBillingToOperationMaps(contacts, operationMap);

  // Field lookup: probeId → current-season field name via probe_assignments
  const fieldMap = new Map(fields.map((f) => [f.id, f.name]));
  const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));

  const probeToCurrentField = new Map<number, string>();
  for (const pa of probeAssignments) {
    const probeId = pa.probe?.[0]?.id;
    const fsId = pa.field_season?.[0]?.id;
    if (!probeId || !fsId) continue;
    const fs = fieldSeasonMap.get(fsId);
    if (!fs || fs.season !== CURRENT_SEASON) continue;
    const fieldId = fs.field?.[0]?.id;
    if (!fieldId) continue;
    const fieldName = fieldMap.get(fieldId);
    if (fieldName) probeToCurrentField.set(probeId, fieldName);
  }

  // Build probeLabels: probeId → { operation, field }
  const probeLabels: Record<number, { operation: string; field: string }> = {};
  for (const probe of probes) {
    const beId = probe.billing_entity?.[0]?.id;
    const operation = beId ? (billingToOperationNames.get(beId) || []).join(', ') : '';
    const field = probeToCurrentField.get(probe.id) || '';
    if (operation || field) {
      probeLabels[probe.id] = { operation, field };
    }
  }

  return <RacksClient slots={slots} probes={processedProbes} probeLabels={probeLabels} />;
}
