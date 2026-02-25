import { getProbeAssignments, getCachedRows, type Field, type FieldSeason, type Probe, type BillingEntity, type Operation, type Contact } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import InstallClient, { InstallableProbeAssignment, InstalledProbeData } from './InstallClient';

// Force dynamic rendering - probe assignments need to be fresh
export const dynamic = 'force-dynamic';

export interface ProbeOption {
  id: number;
  serialNumber: string;
  brand: string;
  rack: string;
  rackSlot: string;
}

async function getInstallData(): Promise<{ probeAssignments: InstallableProbeAssignment[]; probes: ProbeOption[]; allAssignable: InstallableProbeAssignment[]; installedProbes: InstalledProbeData[]; operationContacts: Record<string, { name: string; email: string; phone: string }[]> }> {
  try {
    // Probe assignments are fetched fresh; reference data is cached
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
          label: pa.label || '',
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

    // All 2026 probe assignments that have a probe assigned
    // (for the "Perform Install" picker)
    const allAssignable: InstallableProbeAssignment[] = probeAssignments
      .filter((pa) => {
        const fieldSeasonId = pa.field_season?.[0]?.id;
        if (!fieldSeasonId) return false;
        const fieldSeason = fieldSeasonMap.get(fieldSeasonId);
        if (!fieldSeason) return false;
        // Must be 2026 season
        if (fieldSeason.season != 2026) return false;
        // Must have a probe assigned
        const probeId = pa.probe?.[0]?.id;
        if (!probeId) return false;
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
          label: pa.label || '',
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
        if (!fs || fs.season != 2026) return false;
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
          label: pa.label || '',
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

    // Build operation → probe-type contacts map for grower notifications
    const operationContacts: Record<string, { name: string; email: string; phone: string }[]> = {};
    contacts.forEach((contact) => {
      const isProbeContact = contact.customer_type?.some(
        (ct) => ct.value.toLowerCase().includes('probe')
      );
      if (!isProbeContact || (!contact.email && !contact.phone)) return;
      const contactOps = contact.operations || [];
      contactOps.forEach((op) => {
        const opName = operationMap.get(op.id) || op.value;
        if (!operationContacts[opName]) operationContacts[opName] = [];
        operationContacts[opName].push({
          name: contact.name || '',
          email: contact.email || '',
          phone: contact.phone || '',
        });
      });
    });

    return { probeAssignments: installableAssignments, probes: probeOptions, allAssignable, installedProbes, operationContacts };
  } catch (error) {
    console.error('Error fetching install data:', error);
    return { probeAssignments: [], probes: [], allAssignable: [], installedProbes: [], operationContacts: {} };
  }
}

export default async function InstallPage() {
  const { probeAssignments, probes, allAssignable, installedProbes, operationContacts } = await getInstallData();

  return <InstallClient probeAssignments={probeAssignments} probes={probes} allAssignable={allAssignable} installedProbes={installedProbes} operationContacts={operationContacts} />;
}
