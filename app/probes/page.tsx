import { getProbes, getBillingEntities, getFieldSeasons, getFields, getContacts, getOperations } from '@/lib/baserow';
import ProbesClient, { ProcessedProbe, BillingEntityOption, ContactOption, ProbeFieldAssignment } from './ProbesClient';

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
    const [probes, billingEntities, fieldSeasons, fields, contacts, operations] = await Promise.all([
      getProbes(),
      getBillingEntities(),
      getFieldSeasons(),
      getFields(),
      getContacts(),
      getOperations(),
    ]);

    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name]));
    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const fieldMap = new Map(fields.map((f) => [f.id, f.name]));

    // Build contact to operation name mapping
    const contactOperationMap = new Map<number, string>();
    contacts.forEach((c) => {
      const opNames = (c.operations || [])
        .map((op) => operationMap.get(op.id) || op.value)
        .filter(Boolean);
      contactOperationMap.set(c.id, opNames.join(', ') || '—');
    });

    const processedProbes: ProcessedProbe[] = probes.map((probe) => {
      const billingEntityLink = probe.billing_entity?.[0];
      const contactLink = probe.contact?.[0];
      const operationName = contactLink ? contactOperationMap.get(contactLink.id) || '—' : '—';
      return {
        id: probe.id,
        serialNumber: probe.serial_number || 'Unknown',
        brand: probe.brand?.value || 'Unknown',
        status: probe.status?.value || 'Unknown',
        rackLocation: probe.rack_location || '—',
        yearNew: probe.year_new,
        notes: probe.notes,
        damagesRepairs: probe.damages_repairs,
        billingEntity: billingEntityLink ? billingEntityMap.get(billingEntityLink.id) || billingEntityLink.value : '—',
        billingEntityId: billingEntityLink?.id,
        dateCreated: probe.date_created,
        contact: contactLink ? (contacts.find((c) => c.id === contactLink.id)?.name || contactLink.value) : '—',
        contactId: contactLink?.id,
        operation: operationName,
      };
    });

    const billingEntityOptions: BillingEntityOption[] = billingEntities.map((be) => ({
      id: be.id,
      name: be.name,
    }));

    const contactOptions: ContactOption[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      operationName: contactOperationMap.get(c.id) || '—',
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

    // Get unique seasons from field_seasons plus current year
    const currentYear = new Date().getFullYear();
    const seasons = new Set<string>();
    seasons.add(String(currentYear));
    fieldSeasons.forEach((fs) => {
      if (fs.season) {
        seasons.add(String(fs.season));
      }
    });
    const availableSeasons = Array.from(seasons).sort((a, b) => b.localeCompare(a));

    // Build probe-to-field assignments from field_seasons
    // Each field_season can have probe and probe_2 assigned
    const probeFieldAssignments: ProbeFieldAssignment[] = [];
    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      const fieldName = fieldId ? fieldMap.get(fieldId) || 'Unknown' : null;
      const season = fs.season ? String(fs.season) : null;

      if (!fieldName || !season) return;

      // Check probe 1
      const probe1Id = fs.probe?.[0]?.id;
      if (probe1Id) {
        probeFieldAssignments.push({
          probeId: probe1Id,
          season,
          fieldName,
        });
      }

      // Check probe 2
      const probe2Id = fs.probe_2?.[0]?.id;
      if (probe2Id) {
        probeFieldAssignments.push({
          probeId: probe2Id,
          season,
          fieldName,
        });
      }
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
