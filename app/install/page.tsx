import { getFields, getFieldSeasons, getProbes, getBillingEntities, getOperations, getProbeAssignments, getContacts } from '@/lib/baserow';
import InstallClient, { InstallableProbeAssignment, InstalledProbeData } from './InstallClient';

// Force dynamic rendering - don't cache this page
export const dynamic = 'force-dynamic';

export interface ProbeOption {
  id: number;
  serialNumber: string;
  brand: string;
  rack: string;
  rackSlot: string;
}

async function getInstallData(): Promise<{ probeAssignments: InstallableProbeAssignment[]; probes: ProbeOption[]; allAssignable: InstallableProbeAssignment[]; installedProbes: InstalledProbeData[] }> {
  try {
    const [fields, fieldSeasons, probes, billingEntities, operations, probeAssignments, contacts] = await Promise.all([
      getFields(),
      getFieldSeasons(),
      getProbes(),
      getBillingEntities(),
      getOperations(),
      getProbeAssignments(),
      getContacts(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    // Map billing entity to operation through contacts
    const billingToOperationMap = new Map<number, number>();
    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      contactBeIds.forEach((beId) => {
        contactOpIds.forEach((opId) => {
          if (!billingToOperationMap.has(beId)) {
            billingToOperationMap.set(beId, opId);
          }
        });
      });
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
        if (status !== 'assigned') return false;

        // Only show probes that have a serial number (not "On Order" probes without serial)
        const probeId = pa.probe?.[0]?.id;
        if (probeId) {
          const probe = probeMap.get(probeId);
          if (!probe?.serial_number) return false;
        }

        return true;
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
          probeRack: probe?.rack?.value || '',
          probeRackSlot: probe?.rack_slot?.toString() || '',
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
        rack: p.rack?.value || '',
        rackSlot: p.rack_slot?.toString() || '',
      }))
      .sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));

    // All current-season probe assignments that have a probe assigned but aren't installed yet
    // (for the "Perform Install" picker — no "ready_to_install" gate)
    const allAssignable: InstallableProbeAssignment[] = probeAssignments
      .filter((pa) => {
        const fieldSeasonId = pa.field_season?.[0]?.id;
        if (!fieldSeasonId) return false;
        const fieldSeason = fieldSeasonMap.get(fieldSeasonId);
        if (!fieldSeason) return false;
        // Must be current season
        if (fieldSeason.season !== 2026) return false;
        // Must not already be installed
        const status = pa.probe_status?.value?.toLowerCase() || 'unassigned';
        if (status === 'installed') return false;
        // Must have a probe with a serial number
        const probeId = pa.probe?.[0]?.id;
        if (probeId) {
          const probe = probeMap.get(probeId);
          if (!probe?.serial_number) return false;
        } else {
          return false;
        }
        return true;
      })
      .map((pa) => {
        const fieldSeasonId = pa.field_season?.[0]?.id || 0;
        const fieldSeason = fieldSeasonMap.get(fieldSeasonId);
        const fieldId = fieldSeason?.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;
        let operationName = 'Unknown';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || 'Unknown';
        }
        const probeId = pa.probe?.[0]?.id;
        const probe = probeId ? probeMap.get(probeId) : null;
        return {
          id: pa.id,
          fieldSeasonId,
          fieldId: field?.id || 0,
          fieldName: field?.name || 'Unknown Field',
          operation: operationName,
          season: fieldSeason?.season ? String(fieldSeason.season) : '',
          lat: pa.placement_lat || field?.lat || 0,
          lng: pa.placement_lng || field?.lng || 0,
          crop: fieldSeason?.crop?.value || '',
          routeOrder: fieldSeason?.route_order || 999,
          plannedInstaller: fieldSeason?.planned_installer?.value || '',
          probeNumber: pa.probe_number || 1,
          probeId: probeId || null,
          probeSerial: probe?.serial_number || '',
          probeBrand: probe?.brand?.value || '',
          probeRack: probe?.rack?.value || '',
          probeRackSlot: probe?.rack_slot?.toString() || '',
          antennaType: pa.antenna_type?.value || '',
        };
      })
      .sort((a, b) => a.fieldName.localeCompare(b.fieldName) || a.probeNumber - b.probeNumber);

    // Installed probes for the current season with full install data
    const installedProbes: InstalledProbeData[] = probeAssignments
      .filter((pa) => {
        const fsId = pa.field_season?.[0]?.id;
        if (!fsId) return false;
        const fs = fieldSeasonMap.get(fsId);
        if (!fs || fs.season !== 2026) return false;
        return pa.probe_status?.value?.toLowerCase() === 'installed';
      })
      .map((pa) => {
        const fieldSeasonId = pa.field_season?.[0]?.id || 0;
        const fieldSeason = fieldSeasonMap.get(fieldSeasonId);
        const fieldId = fieldSeason?.field?.[0]?.id;
        const field = fieldId ? fieldMap.get(fieldId) : null;
        let operationName = 'Unknown';
        if (field?.billing_entity?.[0]) {
          const opId = billingToOperationMap.get(field.billing_entity[0].id);
          if (opId) operationName = operationMap.get(opId) || 'Unknown';
        }
        const probeId = pa.probe?.[0]?.id;
        const probe = probeId ? probeMap.get(probeId) : null;
        return {
          id: pa.id,
          fieldSeasonId,
          fieldName: field?.name || 'Unknown Field',
          operation: operationName,
          probeNumber: pa.probe_number || 1,
          probeSerial: probe?.serial_number || '',
          probeBrand: probe?.brand?.value || '',
          crop: fieldSeason?.crop?.value || '',
          installer: pa.installer || '',
          installDate: pa.install_date || '',
          installLat: pa.install_lat || 0,
          installLng: pa.install_lng || 0,
          cropxTelemetryId: pa.cropx_telemetry_id || '',
          signalStrength: pa.signal_strength || '',
          installNotes: pa.install_notes || '',
          photoFieldEndUrl: pa.install_photo_field_end_url?.[0]?.url || '',
          photoExtraUrl: pa.install_photo_extra_url?.[0]?.url || '',
        };
      })
      .sort((a, b) => (b.installDate || '').localeCompare(a.installDate || ''));

    return { probeAssignments: installableAssignments, probes: probeOptions, allAssignable, installedProbes };
  } catch (error) {
    console.error('Error fetching install data:', error);
    return { probeAssignments: [], probes: [], allAssignable: [], installedProbes: [] };
  }
}

export default async function InstallPage() {
  const { probeAssignments, probes, allAssignable, installedProbes } = await getInstallData();

  return <InstallClient probeAssignments={probeAssignments} probes={probes} allAssignable={allAssignable} installedProbes={installedProbes} />;
}
