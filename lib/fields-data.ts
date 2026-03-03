import { getFields, getOperations, getFieldSeasons, getProbes, getBillingEntities, getProbeAssignments, getContacts, getProductsServices, getAllSelectOptions } from '@/lib/baserow';
import type { TableSelectOptions, BaserowFilter } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';

export interface ProcessedProbeAssignment {
  id: number;
  fieldSeasonId: number;
  probeNumber: number;
  label: string;
  probe: string | null;
  probeId: number | null;
  probeStatus: string;
  antennaType?: string;
  batteryType?: string;
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
  serviceTypeId: number | null;
  antennaType: string;
  batteryType: string;
  sideDress: string;
  loggerId: string;
  earlyRemoval: string;
  earlyInstall: string;
  hybridVariety: string;
  readyToRemove: string;
  plantingDate: string;
  // Probe 1 (from probe_assignments, probe_number=1)
  probe: string | null;
  probeId: number | null;
  probeBrand: string;
  probeStatus: string;
  probeAssignmentId: number | null;
  // Probe 2 (from probe_assignments, probe_number=2)
  probe2: string | null;
  probe2Id: number | null;
  probe2Brand: string;
  probe2Status: string;
  probe2AssignmentId: number | null;
  probe2AntennaType: string;
  probe2BatteryType: string;
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
  // PLSS
  plssTownship: number | null;
  plssRange: number | null;
  plssSection: number | null;
  plssDescription: string;
  // NRCS
  nrcsField?: boolean;
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
  // Removal
  removalDate?: string;
  removalNotes?: string;
  // Billing entity name for display
  billingEntityName?: string;
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
  brand: string;
  ownerBillingEntity: string;
  ownerOperationName: string;
  status: string;
}

export interface ProductServiceOption {
  id: number;
  serviceType: string;
  rate: number;
  dealerFee: number;
}

// Serializable select options type (passed from server to client)
export interface SerializedSelectOptions {
  fields: TableSelectOptions;
  field_seasons: TableSelectOptions;
  probe_assignments: TableSelectOptions;
}

export interface FieldsDataResult {
  fields: ProcessedField[];
  operations: OperationOption[];
  billingEntities: BillingEntityOption[];
  probes: ProbeOption[];
  availableSeasons: string[];
  probeAssignments: ProcessedProbeAssignment[];
  productsServices: ProductServiceOption[];
  selectOptions: SerializedSelectOptions;
}

export async function getFieldsData(season?: number): Promise<FieldsDataResult> {
  try {
    // When a specific season is requested, filter field_seasons server-side
    const seasonFilters: BaserowFilter[] | undefined = season
      ? [{ field: 'season', type: 'equal', value: String(season) }]
      : undefined;

    // Fetch core data and select options separately so select options failure doesn't kill everything
    const [rawFields, operations, fieldSeasons, probes, billingEntities, rawProbeAssignments, contacts, rawProductsServices] = await Promise.all([
      getFields(),
      getOperations(),
      getFieldSeasons(seasonFilters ? { baserowFilters: seasonFilters } : undefined),
      getProbes(),
      getBillingEntities(),
      getProbeAssignments(),
      getContacts(),
      getProductsServices(),
    ]);

    // Select options are nice-to-have; don't let failure wipe the page
    let allSelectOptions: Record<string, TableSelectOptions> = {};
    try {
      allSelectOptions = await getAllSelectOptions(['fields', 'field_seasons', 'probe_assignments']);
    } catch (e) {
      console.error('Failed to fetch select options (non-fatal):', e);
    }

    const operationMap = buildOperationMap(operations);
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const { billingToOperationMap, billingToOperationNames } = buildBillingToOperationMaps(contacts, operationMap);

    // Filter probe assignments to only those linked to loaded field_seasons
    const loadedFieldSeasonIds = new Set(fieldSeasons.map((fs) => fs.id));
    const filteredProbeAssignments = season
      ? rawProbeAssignments.filter((pa) => {
          const fsId = pa.field_season?.[0]?.id;
          return fsId && loadedFieldSeasonIds.has(fsId);
        })
      : rawProbeAssignments;

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

    // Process fields - create one entry per field_season
    const processedFields: ProcessedField[] = [];

    // Build probe_assignments lookup by field_season_id for probe 1 and probe 2 data
    // All probes are now stored in probe_assignments table
    const probe1ByFieldSeason = new Map<number, typeof filteredProbeAssignments[0]>();
    const probe2ByFieldSeason = new Map<number, typeof filteredProbeAssignments[0]>();
    filteredProbeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      if (!fsId) return;
      // Use == for probe_number in case Baserow returns it as string
      if (pa.probe_number == 1) {
        probe1ByFieldSeason.set(fsId, pa);
      } else if (pa.probe_number == 2) {
        probe2ByFieldSeason.set(fsId, pa);
      }
    });

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
        // Field has no seasons in loaded data - show it with empty season data
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
          serviceTypeId: null,
          antennaType: '',
          batteryType: '',
          sideDress: '',
          loggerId: '',
          earlyRemoval: '',
          earlyInstall: '',
          hybridVariety: '',
          readyToRemove: '',
          plantingDate: '',
          probe: null,
          probeId: null,
          probeBrand: '',
          probeStatus: 'Unassigned',
          probeAssignmentId: null,
          probe2: null,
          probe2Id: null,
          probe2Brand: '',
          probe2Status: 'Unassigned',
          probe2AssignmentId: null,
          probe2AntennaType: '',
          probe2BatteryType: '',
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
          plssTownship: field.plss_township ?? null,
          plssRange: field.plss_range ?? null,
          plssSection: field.plss_section ?? null,
          plssDescription: field.plss_description || '',
          // No season = no approval status
          approvalStatus: undefined,
          // Removal
          removalDate: '',
          removalNotes: '',
          // Billing entity name
          billingEntityName: billingEntityLink?.value || '',
        });
      } else {
        // Create entry for each season
        fieldFieldSeasons.forEach((fs) => {
          // All probes come from probe_assignments table (no field_season fallback)
          const probe1Assignment = probe1ByFieldSeason.get(fs.id);
          const probeLink = probe1Assignment?.probe?.[0];
          const probeData = probeLink ? probeMap.get(probeLink.id) : null;

          const probe2Assignment = probe2ByFieldSeason.get(fs.id);
          const probe2Link = probe2Assignment?.probe?.[0];
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
            serviceType: fs.service_type?.[0]?.value || '',
            serviceTypeId: fs.service_type?.[0]?.id || null,
            // Antenna/battery from probe_assignments
            antennaType: probe1Assignment?.antenna_type?.value || '',
            batteryType: probe1Assignment?.battery_type?.value || '',
            sideDress: fs.side_dress?.value || '',
            loggerId: fs.logger_id || '',
            earlyRemoval: fs.early_removal?.value || '',
            earlyInstall: fs.early_install?.value || '',
            hybridVariety: fs.hybrid_variety || '',
            readyToRemove: fs.ready_to_remove?.value || '',
            plantingDate: fs.planting_date || '',
            probe: probeData ? (probeData.serial_number ? `#${probeData.serial_number}` : `(On Order #${probeLink!.id})`) : null,
            probeId: probeLink?.id || null,
            probeBrand: probeData?.brand?.value || '',
            probeStatus: probe1Assignment?.probe_status?.value || 'Unassigned',
            probeAssignmentId: probe1Assignment?.id || null,
            probe2: probe2Data ? (probe2Data.serial_number ? `#${probe2Data.serial_number}` : `(On Order #${probe2Link!.id})`) : null,
            probe2Id: probe2Link?.id || null,
            probe2Brand: probe2Data?.brand?.value || '',
            probe2Status: probe2Assignment?.probe_status?.value || 'Unassigned',
            probe2AssignmentId: probe2Assignment?.id || null,
            probe2AntennaType: probe2Assignment?.antenna_type?.value || '',
            probe2BatteryType: probe2Assignment?.battery_type?.value || '',
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
            plssTownship: field.plss_township ?? null,
            plssRange: field.plss_range ?? null,
            plssSection: field.plss_section ?? null,
            plssDescription: field.plss_description || '',
            // Install planning fields
            routeOrder: fs.route_order,
            plannedInstaller: fs.planned_installer?.value,
            readyToInstall: fs.ready_to_install,
            nrcsField: field.nrcs_field,
            // Install details from probe_assignment (probe 1)
            installer: probe1Assignment?.installer,
            installDate: probe1Assignment?.install_date,
            installLat: probe1Assignment?.install_lat,
            installLng: probe1Assignment?.install_lng,
            installNotes: probe1Assignment?.install_notes,
            installPhotoFieldEndUrl: probe1Assignment?.install_photo_field_end_url?.[0]?.url,
            installPhotoExtraUrl: probe1Assignment?.install_photo_extra_url?.[0]?.url,
            // Approval — derived from probe_assignments
            approvalStatus: (() => {
              const statuses = [probe1Assignment, probe2Assignment]
                .filter(Boolean)
                .map(pa => pa!.approval_status?.value || 'Pending');
              if (statuses.length === 0) return 'No Probes';
              if (statuses.every(s => s === 'Approved')) return 'Approved';
              if (statuses.some(s => s === 'Change Requested')) return 'Change Requested';
              return 'Pending';
            })(),
            // Removal
            removalDate: fs.removal_date || '',
            removalNotes: fs.removal_notes || '',
            // Billing entity name
            billingEntityName: billingEntityLink?.value || '',
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

    // Probe options with billing entity and operation
    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name]));
    const probeOptions: ProbeOption[] = probes.map((p) => {
      const beLink = p.billing_entity?.[0];
      const beName = beLink ? billingEntityMap.get(beLink.id) || beLink.value : 'Unassigned';
      // Map probe to operation: first try owner_operation link, then billing_entity -> operation via contacts
      let ownerOpName = '';
      if (p.owner_operation?.[0]) {
        ownerOpName = operationMap.get(p.owner_operation[0].id) || p.owner_operation[0].value || '';
      } else if (beLink) {
        const opId = billingToOperationMap.get(beLink.id);
        if (opId) {
          ownerOpName = operationMap.get(opId) || '';
        }
      }
      return {
        id: p.id,
        serialNumber: p.serial_number || '',
        brand: p.brand?.value || '',
        ownerBillingEntity: beName,
        ownerOperationName: ownerOpName,
        status: p.status?.value || 'Unknown',
      };
    });

    // Build field_season → field lookup for fallback data
    const fieldSeasonToField = new Map<number, typeof rawFields[0]>();
    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      if (fieldId) {
        const field = rawFields.find((f) => f.id === fieldId);
        if (field) fieldSeasonToField.set(fs.id, field);
      }
    });

    // Process probe assignments
    const probeAssignments: ProcessedProbeAssignment[] = filteredProbeAssignments.map((pa) => {
      const probeLink = pa.probe?.[0];
      const probeData = probeLink ? probeMap.get(probeLink.id) : null;

      // Fall back to field-level elevation/soilType if probe assignment lacks them
      const fsId = pa.field_season?.[0]?.id;
      const parentField = fsId ? fieldSeasonToField.get(fsId) : undefined;
      const paElevation = pa.elevation ?? (parentField ? (typeof parentField.elevation === 'object' ? (parentField.elevation as { value: string })?.value : parentField.elevation) : undefined);
      const paSoilType = pa.soil_type ?? (parentField ? (typeof parentField.soil_type === 'object' ? (parentField.soil_type as { value: string })?.value : parentField.soil_type) : undefined);

      return {
        id: pa.id,
        fieldSeasonId: fsId || 0,
        probeNumber: pa.probe_number || 1,
        label: pa.label || '',
        probe: probeData ? `#${probeData.serial_number}` : null,
        probeId: probeLink?.id || null,
        probeStatus: pa.probe_status?.value || 'Unassigned',
        antennaType: pa.antenna_type?.value,
        batteryType: pa.battery_type?.value,
        // Placement data (fall back to field-level for elevation/soilType)
        placementLat: pa.placement_lat,
        placementLng: pa.placement_lng,
        elevation: paElevation,
        soilType: paSoilType,
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

    // Process products/services - filter to active only
    const productsServices: ProductServiceOption[] = rawProductsServices
      .filter((sr) => !sr.status || sr.status?.value === 'Active')
      .map((sr) => ({
        id: sr.id,
        serviceType: sr.service_type || '',
        rate: sr.rate || 0,
        dealerFee: sr.dealer_fee || 0,
      }));

    return {
      fields: processedFields,
      operations: operationOptions,
      billingEntities: billingEntityOptions,
      probes: probeOptions,
      availableSeasons,
      probeAssignments,
      productsServices,
      selectOptions: {
        fields: allSelectOptions.fields || {},
        field_seasons: allSelectOptions.field_seasons || {},
        probe_assignments: allSelectOptions.probe_assignments || {},
      },
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
      productsServices: [],
      selectOptions: { fields: {}, field_seasons: {}, probe_assignments: {} },
    };
  }
}
