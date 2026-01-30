import { getProbes, getBillingEntities, getFieldSeasons, getFields } from '@/lib/baserow';
import ProbesClient, { ProcessedProbe, BillingEntityOption, ProbeFieldAssignment } from './ProbesClient';

async function getProbesData(): Promise<{
  probes: ProcessedProbe[];
  billingEntities: BillingEntityOption[];
  statusCounts: Record<string, number>;
  availableSeasons: string[];
  probeFieldAssignments: ProbeFieldAssignment[];
}> {
  try {
    const [probes, billingEntities, fieldSeasons, fields] = await Promise.all([
      getProbes(),
      getBillingEntities(),
      getFieldSeasons(),
      getFields(),
    ]);

    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name]));
    const fieldMap = new Map(fields.map((f) => [f.id, f.name]));

    const processedProbes: ProcessedProbe[] = probes.map((probe) => {
      const ownerLink = probe.owner_billing_entity?.[0];
      return {
        id: probe.id,
        serialNumber: probe.serial_number || 'Unknown',
        brand: probe.brand?.value || 'Unknown',
        status: probe.status?.value || 'Unknown',
        rackLocation: probe.rack_location || '—',
        ownerBillingEntity: ownerLink ? billingEntityMap.get(ownerLink.id) || ownerLink.value : '—',
        ownerBillingEntityId: ownerLink?.id,
        yearNew: probe.year_new,
        notes: probe.notes,
      };
    });

    const billingEntityOptions: BillingEntityOption[] = billingEntities.map((be) => ({
      id: be.id,
      name: be.name,
    }));

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
      statusCounts,
      availableSeasons,
      probeFieldAssignments,
    };
  } catch (error) {
    console.error('Error fetching probes data:', error);
    return { probes: [], billingEntities: [], statusCounts: { all: 0 }, availableSeasons: [String(new Date().getFullYear())], probeFieldAssignments: [] };
  }
}

export default async function ProbesPage() {
  const { probes, billingEntities, statusCounts, availableSeasons, probeFieldAssignments } = await getProbesData();
  return (
    <ProbesClient
      probes={probes}
      billingEntities={billingEntities}
      statusCounts={statusCounts}
      availableSeasons={availableSeasons}
      probeFieldAssignments={probeFieldAssignments}
    />
  );
}
