import { fieldOperationLabel } from '@/lib/data-mappings';
import { getCachedFields, getCachedBillingEntities, getCachedOperations, getCachedFieldSeasons, getCachedProbeAssignments, getCachedContacts } from '@/lib/data';
import FieldLocationsClient, { FieldLocation } from './RouteClient';

export const dynamic = 'force-dynamic';

async function getFieldLocations(): Promise<FieldLocation[]> {
  try {
    const [fields, billingEntities, operations, fieldSeasons, probeAssignments, contacts] = await Promise.all([
      getCachedFields(),
      getCachedBillingEntities(),
      getCachedOperations(),
      getCachedFieldSeasons(),
      getCachedProbeAssignments(),
      getCachedContacts(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    // Map billing entity to operation through contacts
    const billingToOperationMap = new Map<number, number[]>();
    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      contactBeIds.forEach((beId) => {
        contactOpIds.forEach((opId) => {
          const ids = billingToOperationMap.get(beId) || [];
          if (!ids.includes(opId)) ids.push(opId);
          billingToOperationMap.set(beId, ids);
        });
      });
    });

    // Map field_season IDs to field IDs for probe_assignments lookup
    const fsToFieldMap = new Map<number, number>();
    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      if (fieldId) fsToFieldMap.set(fs.id, fieldId);
    });

    // Build a map of field ID to most recent install location from probe_assignments
    const installLocationMap = new Map<number, { lat: number; lng: number }>();
    probeAssignments.forEach((pa) => {
      const fsId = pa.field_season?.[0]?.id;
      const fieldId = fsId ? fsToFieldMap.get(fsId) : undefined;
      if (fieldId && pa.install_lat && pa.install_lng) {
        installLocationMap.set(fieldId, {
          lat: pa.install_lat,
          lng: pa.install_lng,
        });
      }
    });

    // Convert all fields to FieldLocation objects
    const fieldLocations: FieldLocation[] = fields.map((field) => {
      const operationName = fieldOperationLabel(field, billingToOperationMap, operationMap);

      const installLocation = installLocationMap.get(field.id);

      return {
        id: field.id,
        name: field.name || 'Unnamed Field',
        operation: operationName,
        acres: field.acres || 0,
        lat: field.lat || 0,
        lng: field.lng || 0,
        // Installed location (from probe_assignments)
        installLat: installLocation?.lat,
        installLng: installLocation?.lng,
        waterSource: field.water_source?.value,
        fuelSource: field.fuel_source?.value,
        notes: field.notes,
        // Irrigation details
        irrigationType: field.irrigation_type?.value,
        rowDirection: field.row_direction?.value,
        dripTubingDirection: field.drip_tubing_direction?.value,
        dripTubingSpacing: field.drip_tubing_spacing,
        dripEmitterSpacing: field.drip_emitter_spacing,
        dripZones: field.drip_zones,
        dripGpm: field.drip_gpm,
        dripDepth: field.drip_depth,
        // Location data
        elevation: typeof field.elevation === 'object' ? field.elevation?.value : field.elevation,
        soilType: typeof field.soil_type === 'object' ? field.soil_type?.value : field.soil_type,
        placementNotes: field.placement_notes,
      };
    });

    // Sort alphabetically by name
    return fieldLocations.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching field locations:', error);
    return [];
  }
}

export default async function FieldLocationsPage() {
  const fieldLocations = await getFieldLocations();

  return <FieldLocationsClient fieldLocations={fieldLocations} />;
}
