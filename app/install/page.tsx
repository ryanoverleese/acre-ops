import { getFields, getFieldSeasons, getProbes, getBillingEntities, getOperations, getProbeAssignments } from '@/lib/baserow';
import InstallClient, { InstallableProbeAssignment } from './InstallClient';

// Force dynamic rendering - don't cache this page
export const dynamic = 'force-dynamic';

export interface ProbeOption {
  id: number;
  serialNumber: string;
  brand: string;
  rackLocation: string;
}

async function getInstallData(): Promise<{ probeAssignments: InstallableProbeAssignment[]; probes: ProbeOption[] }> {
  try {
    const [fields, fieldSeasons, probes, billingEntities, operations, probeAssignments] = await Promise.all([
      getFields(),
      getFieldSeasons(),
      getProbes(),
      getBillingEntities(),
      getOperations(),
      getProbeAssignments(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    // Map billing entity to operation
    const billingToOperationMap = new Map<number, number>();
    billingEntities.forEach((be) => {
      if (be.operation?.[0]?.id) {
        billingToOperationMap.set(be.id, be.operation[0].id);
      }
    });

    // Filter probe_assignments:
    // - probe_status = 'Assigned' (ready to install but not yet installed)
    // - field_season.ready_to_install = true
    const installableAssignments: InstallableProbeAssignment[] = probeAssignments
      .filter((pa) => {
        // Must have a field_season link
        const fieldSeasonId = pa.field_season?.[0]?.id;
        if (!fieldSeasonId) return false;

        const fieldSeason = fieldSeasonMap.get(fieldSeasonId);
        if (!fieldSeason) return false;

        // Field season must be marked ready to install
        if (!fieldSeason.ready_to_install) return false;

        // Probe must be assigned (has a probe) but not yet installed
        const status = pa.probe_status?.value?.toLowerCase() || 'unassigned';
        return status === 'assigned';
      })
      .map((pa) => {
        const fieldSeasonId = pa.field_season?.[0]?.id || 0;
        const fieldSeason = fieldSeasonMap.get(fieldSeasonId);
        const fieldId = fieldSeason?.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;

        // Get operation name
        let operationName = 'Unknown';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) {
            operationName = operationMap.get(opId) || 'Unknown';
          }
        }

        // Get probe data
        const probeId = pa.probe?.[0]?.id;
        const probe = probeId ? probeMap.get(probeId) : null;

        return {
          id: pa.id,
          fieldSeasonId,
          fieldId: field?.id || 0,
          fieldName: field?.name || 'Unknown Field',
          operation: operationName,
          season: fieldSeason?.season ? String(fieldSeason.season) : '',
          // Location - use probe placement location, fall back to field location
          lat: pa.placement_lat || field?.lat || 0,
          lng: pa.placement_lng || field?.lng || 0,
          // From field_season
          crop: fieldSeason?.crop?.value || '',
          routeOrder: fieldSeason?.route_order || 999,
          plannedInstaller: fieldSeason?.planned_installer?.value || '',
          // Probe info
          probeNumber: pa.probe_number || 1,
          probeId: probeId || null,
          probeSerial: probe?.serial_number || '',
          probeBrand: probe?.brand?.value || '',
          probeRackLocation: probe?.rack_location || '',
          // From probe_assignment
          antennaType: pa.antenna_type?.value || '',
        };
      })
      .sort((a, b) => {
        // Sort by route_order, then by field name, then by probe number
        if (a.routeOrder !== b.routeOrder) return a.routeOrder - b.routeOrder;
        const nameCompare = a.fieldName.localeCompare(b.fieldName);
        if (nameCompare !== 0) return nameCompare;
        return a.probeNumber - b.probeNumber;
      });

    // Build probe options list (available probes)
    const probeOptions: ProbeOption[] = probes
      .filter(p => p.status?.value?.toLowerCase() !== 'retired')
      .map(p => ({
        id: p.id,
        serialNumber: p.serial_number || '',
        brand: p.brand?.value || '',
        rackLocation: p.rack_location || '',
      }))
      .sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));

    return { probeAssignments: installableAssignments, probes: probeOptions };
  } catch (error) {
    console.error('Error fetching install data:', error);
    return { probeAssignments: [], probes: [] };
  }
}

export default async function InstallPage() {
  const { probeAssignments, probes } = await getInstallData();

  return <InstallClient probeAssignments={probeAssignments} probes={probes} />;
}
