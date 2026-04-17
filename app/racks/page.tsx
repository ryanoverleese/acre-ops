import { getRows, getProbes, ProbeRackSlot, getBillingEntities, getContacts, getOperations, getProbeAssignments, getFieldSeasons, getFields } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import RacksClient from './RacksClient';

export const dynamic = 'force-dynamic';

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

  // Field lookup: probeId → most recent field name (any season) via probe_assignments
  const fieldMap = new Map(fields.map((f) => [f.id, f.name]));
  const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));

  // Track { season, fieldName } per probe, keeping the highest season
  const probeToFieldEntry = new Map<number, { season: number; fieldName: string }>();
  for (const pa of probeAssignments) {
    const probeId = pa.probe?.[0]?.id;
    const fsId = pa.field_season?.[0]?.id;
    if (!probeId || !fsId) continue;
    const fs = fieldSeasonMap.get(fsId);
    if (!fs) continue;
    const fieldId = fs.field?.[0]?.id;
    if (!fieldId) continue;
    const fieldName = fieldMap.get(fieldId);
    if (!fieldName) continue;
    const season = fs.season ?? 0;
    const existing = probeToFieldEntry.get(probeId);
    if (!existing || season > existing.season) {
      probeToFieldEntry.set(probeId, { season, fieldName });
    }
  }

  // Build probeLabels: probeId → { operation, field, status }
  const probeLabels: Record<number, { operation: string; field: string; status: string }> = {};
  for (const probe of probes) {
    const beId = probe.billing_entity?.[0]?.id;
    const operation = beId ? (billingToOperationNames.get(beId) || []).join(', ') : '';
    const field = probeToFieldEntry.get(probe.id)?.fieldName || '';
    const status = probe.status?.value || '';
    probeLabels[probe.id] = { operation, field, status };
  }

  return <RacksClient slots={slots} probes={processedProbes} probeLabels={probeLabels} />;
}
