import { getCachedRows, ProbeRackSlot } from '@/lib/baserow';
import type { Probe, BillingEntity, FieldSeason, Field, Contact, Operation, ProbeAssignment } from '@/lib/baserow';
import { buildOperationMap, buildBillingEntityMap, buildContactToOperationMaps, buildBillingToOperationMaps } from '@/lib/data-mappings';
import ProbesClient, { ProcessedProbe, BillingEntityOption, ContactOption, ProbeFieldAssignment } from './ProbesClient';

export const dynamic = 'force-dynamic';

async function getProbesData(): Promise<{
  probes: ProcessedProbe[];
  billingEntities: BillingEntityOption[];
  contacts: ContactOption[];
  brandOptions: string[];
  statusCounts: Record<string, number>;
  availableSeasons: string[];
  probeFieldAssignments: ProbeFieldAssignment[];
}> {
  try {
    // Cached reads — API writes bust each table's cache tag, so edits show up
    // immediately; TTLs only matter for edits made directly in the Baserow UI.
    const [probes, billingEntities, fieldSeasons, fields, contacts, operations, probeAssignments, rackSlots] = await Promise.all([
      getCachedRows<Probe>('probes', undefined, 120),
      getCachedRows<BillingEntity>('billing_entities', undefined, 600),
      getCachedRows<FieldSeason>('field_seasons', undefined, 120),
      getCachedRows<Field>('fields', undefined, 120),
      getCachedRows<Contact>('contacts', undefined, 600),
      getCachedRows<Operation>('operations', undefined, 600),
      getCachedRows<ProbeAssignment>('probe_assignments', undefined, 120),
      getCachedRows<ProbeRackSlot>('probe_rack', undefined, 120),
    ]);

    // Build probeId → {rack, slot, rowId} from probe_rack table
    const probeRackMap = new Map<number, { rack: string; slot: number; rowId: number }>();
    for (const slot of rackSlots) {
      const probeLink = slot.probe?.[0];
      if (probeLink?.id) {
        probeRackMap.set(probeLink.id, { rack: slot.rack, slot: slot.rack_slot, rowId: slot.id });
      }
    }

    const billingEntityMap = buildBillingEntityMap(billingEntities);
    const operationMap = buildOperationMap(operations);
    const fieldMap = new Map(fields.map((f) => [f.id, f.name]));
    const { contactToOperationNames } = buildContactToOperationMaps(contacts, operationMap);
    const { billingToOperationNames } = buildBillingToOperationMaps(contacts, operationMap);

    const processedProbes: ProcessedProbe[] = probes.map((probe) => {
      const billingEntityLink = probe.billing_entity?.[0];
      const contactLink = probe.contact?.[0];
      const operationName = billingEntityLink
        ? (billingToOperationNames.get(billingEntityLink.id) || []).join(', ') || '—'
        : '—';
      return {
        id: probe.id,
        serialNumber: probe.serial_number || (probe.status?.value === 'On Order - Trade' ? `On Order - Trade #${probe.id}` : probe.status?.value === 'On Order' ? `On Order #${probe.id}` : 'EMPTY'),
        rawSerialNumber: probe.serial_number || '',
        brand: probe.brand?.value || 'Unknown',
        status: probe.status?.value || 'Unknown',
        rack: probeRackMap.get(probe.id)?.rack || '—',
        rackSlot: probeRackMap.get(probe.id)?.slot?.toString() || '—',
        rackSlotRowId: probeRackMap.get(probe.id)?.rowId,
        yearNew: probe.year_new,
        notes: probe.notes,
        damagesRepairs: probe.damages_repairs,
        billingEntity: billingEntityLink ? billingEntityMap.get(billingEntityLink.id) || billingEntityLink.value : '—',
        billingEntityId: billingEntityLink?.id,
        dateCreated: probe.date_created,
        contact: contactLink ? (contacts.find((c) => c.id === contactLink.id)?.name || contactLink.value) : '—',
        contactId: contactLink?.id,
        operation: operationName,
        tradeYear: probe.trade_year?.value || '',
      };
    });

    const billingEntityOptions: BillingEntityOption[] = billingEntities.map((be) => ({
      id: be.id,
      name: be.name,
    }));

    const contactOptions: ContactOption[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      operationName: (contactToOperationNames.get(c.id) || []).join(', ') || '—',
      billingEntityIds: c.billing_entity?.map((be) => be.id) || [],
    }));

    // Extract unique brand options from probes
    const brandSet = new Set<string>();
    probes.forEach((p) => {
      if (p.brand?.value) {
        brandSet.add(p.brand.value);
      }
    });
    const brandOptions = Array.from(brandSet).sort();

    const statusCounts: Record<string, number> = {
      all: processedProbes.length,
    };
    processedProbes.forEach((p) => {
      const status = p.status.toLowerCase().replace(' ', '-');
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Get unique seasons from field_seasons plus default years
    const currentYear = new Date().getFullYear();
    const seasons = new Set<string>();
    seasons.add(String(currentYear));
    seasons.add(String(currentYear - 1));
    seasons.add(String(currentYear - 2));
    fieldSeasons.forEach((fs) => {
      if (fs.season) {
        seasons.add(String(fs.season));
      }
    });
    const availableSeasons = Array.from(seasons).sort((a, b) => b.localeCompare(a));

    // Build probe-to-field assignments from probe_assignments (all probes)
    const probeFieldAssignments: ProbeFieldAssignment[] = [];
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    probeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      const probeId = pa.probe?.[0]?.id;
      if (!fsId || !probeId) return;
      const fs = fieldSeasonMap.get(fsId);
      if (!fs) return;
      const fieldId = fs.field?.[0]?.id;
      const fieldName = fieldId ? fieldMap.get(fieldId) || 'Unknown' : null;
      const season = fs.season ? String(fs.season) : null;
      if (!fieldName || !season) return;
      probeFieldAssignments.push({ probeId, season, fieldName });
    });

    return {
      probes: processedProbes,
      billingEntities: billingEntityOptions,
      contacts: contactOptions,
      brandOptions,
      statusCounts,
      availableSeasons,
      probeFieldAssignments,
    };
  } catch (error) {
    console.error('Error fetching probes data:', error);
    return { probes: [], billingEntities: [], contacts: [], brandOptions: [], statusCounts: { all: 0 }, availableSeasons: [String(new Date().getFullYear())], probeFieldAssignments: [] };
  }
}

export default async function ProbesPage() {
  const { probes, billingEntities, contacts, brandOptions, statusCounts, availableSeasons, probeFieldAssignments } = await getProbesData();
  return (
    <ProbesClient
      probes={probes}
      billingEntities={billingEntities}
      contacts={contacts}
      brandOptions={brandOptions}
      statusCounts={statusCounts}
      availableSeasons={availableSeasons}
      probeFieldAssignments={probeFieldAssignments}
    />
  );
}
