import { getFields, getOperations, getFieldSeasons, getProbes, getBillingEntities, getProbeAssignments, getContacts } from '@/lib/baserow';
import FieldsClient from './FieldsClient';

// Force dynamic rendering to always get fresh data
export const dynamic = 'force-dynamic';

export interface ProcessedProbeAssignment {
  id: number;
  fieldSeasonId: number;
  probeNumber: number;
  probe: string | null;
  probeId: number | null;
  probeStatus: string;
  antennaType?: string;
  // Placement data
  placementLat?: number;
  placementLng?: number;
  elevation?: number | string;
  soilType?: string;
  placementNotes?: string;
  // Install data
  installer?: string;
  installDate?: string;
  installLat?: number;
  installLng?: number;
  installNotes?: string;
  installPhotoFieldEndUrl?: string;
  installPhotoExtraUrl?: string;
  cropxTelemetryId?: string;
  signalStrength?: string;
  // Approval data
  approvalStatus: string;
  approvalNotes?: string;
  approvalDate?: string;
}

export interface ProcessedField {
  id: number;
  fieldSeasonId: number | null;
  name: string;
  operation: string;
  operationId: number | null;
  billingEntityId: number | null;
  acres: number;
  pivotAcres?: number;
  season: string;
  crop: string;
  serviceType: string;
  antennaType: string;
  batteryType: string;
  sideDress: string;
  loggerId: string;
  earlyRemoval: string;
  hybridVariety: string;
  readyToRemove: string;
  plantingDate: string;
  probe: string | null;
  probeId: number | null;
  probeStatus: string;
  probe2: string | null;
  probe2Id: number | null;
  probe2Status: string;
  lat: number;
  lng: number;
  waterSource?: string;
  fuelSource?: string;
  notes?: string;
  elevation?: string | number;
  soilType?: string;
  placementNotes?: string;
  irrigationType?: string;
  rowDirection?: string;
  dripTubingDirection?: string;
  dripTubingSpacing?: number;
  dripEmitterSpacing?: number;
  dripZones?: number;
  dripGpm?: number;
  dripDepth?: number;
  fieldDirections?: string;
  // Install planning fields
  routeOrder?: number;
  plannedInstaller?: string;
  readyToInstall?: boolean;
  // Install details (after installation)
  installer?: string;
  installDate?: string;
  installLat?: number;
  installLng?: number;
  installNotes?: string;
  installPhotoFieldEndUrl?: string;
  installPhotoExtraUrl?: string;
  // Approval
  approvalStatus?: string;
}

export interface OperationOption {
  id: number;
  name: string;
}

export interface BillingEntityOption {
  id: number;
  name: string;
  operationName: string;
}

export interface ProbeOption {
  id: number;
  serialNumber: string;
  ownerBillingEntity: string;
  status: string;
}

async function getFieldsData(): Promise<{
  fields: ProcessedField[];
  operations: OperationOption[];
  billingEntities: BillingEntityOption[];
  probes: ProbeOption[];
  availableSeasons: string[];
  probeAssignments: ProcessedProbeAssignment[];
}> {
  try {
    const [rawFields, operations, fieldSeasons, probes, billingEntities, rawProbeAssignments, contacts] = await Promise.all([
      getFields(),
      getOperations(),
      getFieldSeasons(),
      getProbes(),
      getBillingEntities(),
      getProbeAssignments(),
      getContacts(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const probeMap = new Map(probes.map((p) => [p.id, p]));

    // Build billing entity to operation mapping through contacts
    const billingToOperationMap = new Map<number, number>();
    const billingToOperationNames = new Map<number, string[]>();
    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      contactBeIds.forEach((beId) => {
        contactOpIds.forEach((opId) => {
          // Store first operation ID for each billing entity
          if (!billingToOperationMap.has(beId)) {
            billingToOperationMap.set(beId, opId);
          }
          // Collect all operation names
          const existingNames = billingToOperationNames.get(beId) || [];
          const opName = operationMap.get(opId) || 'Unknown';
          if (!existingNames.includes(opName)) {
            existingNames.push(opName);
          }
          billingToOperationNames.set(beId, existingNames);
        });
      });
    });

    // Get unique seasons from existing data plus default years
    const currentYear = new Date().getFullYear();
    const seasons = new Set<string>();

    // Always include current year and previous 2 years as defaults
    seasons.add(String(currentYear));
    seasons.add(String(currentYear - 1));
    seasons.add(String(currentYear - 2));

    // Include any seasons from existing field_seasons
    fieldSeasons.forEach((fs) => {
      if (fs.season) {
        seasons.add(String(fs.season));
      }
    });
    const availableSeasons = Array.from(seasons).sort((a, b) => b.localeCompare(a));

    // Create field season lookup by field ID and season
    const fieldSeasonLookup = new Map<string, typeof fieldSeasons[0]>();
    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      const season = fs.season ? String(fs.season) : undefined;
      if (fieldId && season) {
        fieldSeasonLookup.set(`${fieldId}-${season}`, fs);
      }
    });

    // Process fields - create one entry per field_season
    const processedFields: ProcessedField[] = [];

    rawFields.forEach((field) => {
      const billingEntityLink = field.billing_entity?.[0];
      let operationName = 'Unknown';
      let operationId: number | null = null;

      if (billingEntityLink) {
        operationId = billingToOperationMap.get(billingEntityLink.id) || null;
        if (operationId) {
          operationName = operationMap.get(operationId) || 'Unknown';
        } else {
          operationName = billingEntityLink.value || 'Unknown';
        }
      }

      // Find all field seasons for this field
      const fieldFieldSeasons = fieldSeasons.filter((fs) => fs.field?.[0]?.id === field.id);

      if (fieldFieldSeasons.length === 0) {
        // Field has no seasons - show it with empty season data
        processedFields.push({
          id: field.id,
          fieldSeasonId: null,
          name: field.name || 'Unnamed Field',
          operation: operationName,
          operationId,
          billingEntityId: billingEntityLink?.id || null,
          acres: field.acres || 0,
          pivotAcres: field.pivot_acres,
          season: '',
          crop: 'Unknown',
          serviceType: '',
          antennaType: '',
          batteryType: '',
          sideDress: '',
          loggerId: '',
          earlyRemoval: '',
          hybridVariety: '',
          readyToRemove: '',
          plantingDate: '',
          probe: null,
          probeId: null,
          probeStatus: 'Unassigned',
          probe2: null,
          probe2Id: null,
          probe2Status: 'Unassigned',
          lat: field.lat || 0,
          lng: field.lng || 0,
          waterSource: field.water_source?.value,
          fuelSource: field.fuel_source?.value,
          notes: field.notes,
          elevation: typeof field.elevation === 'object' ? field.elevation?.value : field.elevation,
          soilType: typeof field.soil_type === 'object' ? field.soil_type?.value : field.soil_type,
          placementNotes: field.placement_notes,
          irrigationType: field.irrigation_type?.value,
          rowDirection: field.row_direction?.value,
          dripTubingDirection: field.drip_tubing_direction?.value,
          dripTubingSpacing: field.drip_tubing_spacing,
          dripEmitterSpacing: field.drip_emitter_spacing,
          dripZones: field.drip_zones,
          dripGpm: field.drip_gpm,
          dripDepth: field.drip_depth,
          fieldDirections: field.field_directions,
          // No season = no approval status
          approvalStatus: undefined,
        });
      } else {
        // Create entry for each season
        fieldFieldSeasons.forEach((fs) => {
          const probeLink = fs.probe?.[0];
          const probeData = probeLink ? probeMap.get(probeLink.id) : null;
          const probe2Link = fs.probe_2?.[0];
          const probe2Data = probe2Link ? probeMap.get(probe2Link.id) : null;

          processedFields.push({
            id: field.id,
            fieldSeasonId: fs.id,
            name: field.name || 'Unnamed Field',
            operation: operationName,
            operationId,
            billingEntityId: billingEntityLink?.id || null,
            acres: field.acres || 0,
            pivotAcres: field.pivot_acres,
            season: fs.season ? String(fs.season) : '',
            crop: fs.crop?.value || 'Unknown',
            serviceType: fs.service_type?.value || '',
            antennaType: fs.antenna_type?.value || '',
            batteryType: fs.battery_type?.value || '',
            sideDress: fs.side_dress?.value || '',
            loggerId: fs.logger_id || '',
            earlyRemoval: fs.early_removal?.value || '',
            hybridVariety: fs.hybrid_variety || '',
            readyToRemove: fs.ready_to_remove?.value || '',
            plantingDate: fs.planting_date || '',
            probe: probeData ? `#${probeData.serial_number}` : null,
            probeId: probeLink?.id || null,
            probeStatus: fs.probe_status?.value || 'Unassigned',
            probe2: probe2Data ? `#${probe2Data.serial_number}` : null,
            probe2Id: probe2Link?.id || null,
            probe2Status: fs.probe_2_status?.value || 'Unassigned',
            lat: field.lat || 0,
            lng: field.lng || 0,
            waterSource: field.water_source?.value,
            fuelSource: field.fuel_source?.value,
            notes: field.notes,
            elevation: typeof field.elevation === 'object' ? field.elevation?.value : field.elevation,
            soilType: typeof field.soil_type === 'object' ? field.soil_type?.value : field.soil_type,
            placementNotes: field.placement_notes,
            irrigationType: field.irrigation_type?.value,
            rowDirection: field.row_direction?.value,
            dripTubingDirection: field.drip_tubing_direction?.value,
            dripTubingSpacing: field.drip_tubing_spacing,
            dripEmitterSpacing: field.drip_emitter_spacing,
            dripZones: field.drip_zones,
            dripGpm: field.drip_gpm,
            dripDepth: field.drip_depth,
            fieldDirections: field.field_directions,
            // Install planning fields
            routeOrder: fs.route_order,
            plannedInstaller: fs.planned_installer?.value,
            readyToInstall: fs.ready_to_install,
            // Install details (after installation)
            installer: fs.installer,
            installDate: fs.install_date,
            installLat: fs.install_lat,
            installLng: fs.install_lng,
            installNotes: fs.install_notes,
            installPhotoFieldEndUrl: fs.install_photo_field_end_url?.[0]?.url,
            installPhotoExtraUrl: fs.install_photo_extra_url?.[0]?.url,
            // Approval
            approvalStatus: fs.approval_status?.value || 'Pending',
          });
        });
      }
    });

    const operationOptions: OperationOption[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
    }));

    const billingEntityOptions: BillingEntityOption[] = billingEntities.map((be) => {
      const opNames = billingToOperationNames.get(be.id) || [];
      return {
        id: be.id,
        name: be.name,
        operationName: opNames.length > 0 ? opNames.join(', ') : '—',
      };
    });

    // Probe options with billing entity
    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name]));
    const probeOptions: ProbeOption[] = probes.map((p) => {
      const beLink = p.billing_entity?.[0];
      const beName = beLink ? billingEntityMap.get(beLink.id) || beLink.value : 'Unassigned';
      return {
        id: p.id,
        serialNumber: p.serial_number || '',
        ownerBillingEntity: beName,
        status: p.status?.value || 'Unknown',
      };
    });

    // Process probe assignments
    const probeAssignments: ProcessedProbeAssignment[] = rawProbeAssignments.map((pa) => {
      const probeLink = pa.probe?.[0];
      const probeData = probeLink ? probeMap.get(probeLink.id) : null;

      return {
        id: pa.id,
        fieldSeasonId: pa.field_season?.[0]?.id || 0,
        probeNumber: pa.probe_number || 1,
        probe: probeData ? `#${probeData.serial_number}` : null,
        probeId: probeLink?.id || null,
        probeStatus: pa.probe_status?.value || 'Unassigned',
        antennaType: pa.antenna_type?.value,
        // Placement data
        placementLat: pa.placement_lat,
        placementLng: pa.placement_lng,
        elevation: pa.elevation,
        soilType: pa.soil_type,
        placementNotes: pa.placement_notes,
        // Install data
        installer: pa.installer,
        installDate: pa.install_date,
        installLat: pa.install_lat,
        installLng: pa.install_lng,
        installNotes: pa.install_notes,
        installPhotoFieldEndUrl: pa.install_photo_field_end_url?.[0]?.url,
        installPhotoExtraUrl: pa.install_photo_extra_url?.[0]?.url,
        cropxTelemetryId: pa.cropx_telemetry_id,
        signalStrength: pa.signal_strength,
        // Approval data
        approvalStatus: pa.approval_status?.value || 'Pending',
        approvalNotes: pa.approval_notes,
        approvalDate: pa.approval_date,
      };
    });

    return {
      fields: processedFields,
      operations: operationOptions,
      billingEntities: billingEntityOptions,
      probes: probeOptions,
      availableSeasons,
      probeAssignments,
    };
  } catch (error) {
    console.error('Error fetching fields data:', error);
    return {
      fields: [],
      operations: [],
      billingEntities: [],
      probes: [],
      availableSeasons: [String(new Date().getFullYear())],
      probeAssignments: [],
    };
  }
}

export default async function FieldsPage() {
  const { fields, operations, billingEntities, probes, availableSeasons, probeAssignments } = await getFieldsData();

  return (
    <FieldsClient
      initialFields={fields}
      operations={operations}
      billingEntities={billingEntities}
      probes={probes}
      availableSeasons={availableSeasons}
      initialProbeAssignments={probeAssignments}
    />
  );
}
