import { getCachedRows, getRows, ProbeRackSlot, Probe, BillingEntity, Contact, Operation, Field, FieldSeason, getProbeAssignments } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import RacksClient from './RacksClient';

export const dynamic = 'force-dynamic';

export default async function RacksPage() {
  const [slots, probes, billingEntities, contacts, operations, probeAssignments, fieldSeasons, fields] = await Promise.all([
    getRows<ProbeRackSlot>('probe_rack'),   // live — you're moving these
    getRows<Probe>('probes'),               // live — status changes
    getCachedRows<BillingEntity>('billing_entities', undefined, 600),
    getCachedRows<Contact>('contacts', undefined, 600),
    getCachedRows<Operation>('operations', undefined, 600),
    getProbeAssignments(),
    getCachedRows<FieldSeason>('field_seasons', undefined, 300),
    getCachedRows<Field>('fields', undefined, 600),
  ]);

  const processedProbes = probes.map((p) => ({
    id: p.id,
    serialNumber: p.serial_number || '',
    status: p.status?.value || 'Unknown',
    brand: p.brand?.value || 'Unknown',
  }));

  // Probes with "In Crate" status are physically out of the rack — treat slots as empty
  const inCrateProbeIds = new Set(
    probes
      .filter(p => p.status?.value?.toLowerCase().includes('in crate'))
      .map(p => p.id)
  );

  const filteredSlots = slots.map(slot => {
    const probeId = slot.probe?.[0]?.id;
    if (probeId && inCrateProbeIds.has(probeId)) {
      return { ...slot, probe: [] };
    }
    return slot;
  });

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

  return <RacksClient slots={filteredSlots} probes={processedProbes} probeLabels={probeLabels} />;
}
