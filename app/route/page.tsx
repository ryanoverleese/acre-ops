import { getFields, getBillingEntities, getOperations, getFieldSeasons, getContacts } from '@/lib/baserow';
import FieldLocationsClient, { FieldLocation } from './RouteClient';

export const dynamic = 'force-dynamic';

async function getFieldLocations(): Promise<FieldLocation[]> {
  try {
    const [fields, billingEntities, operations, fieldSeasons, contacts] = await Promise.all([
      getFields(),
      getBillingEntities(),
      getOperations(),
      getFieldSeasons(),
      getContacts(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

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

    // Build a map of field ID to most recent install location
    const installLocationMap = new Map<number, { lat: number; lng: number }>();
    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      if (fieldId && fs.install_lat && fs.install_lng) {
        // Store install location (later seasons will overwrite earlier ones)
        installLocationMap.set(fieldId, {
          lat: fs.install_lat,
          lng: fs.install_lng,
        });
      }
    });

    // Convert all fields to FieldLocation objects
    const fieldLocations: FieldLocation[] = fields.map((field) => {
      let operationName = 'Unknown';
      if (field.billing_entity?.[0]) {
        const opId = billingToOperationMap.get(field.billing_entity[0].id);
        if (opId) {
          operationName = operationMap.get(opId) || 'Unknown';
        }
      }

      const installLocation = installLocationMap.get(field.id);

      return {
        id: field.id,
        name: field.name || 'Unnamed Field',
        operation: operationName,
        acres: field.acres || 0,
        lat: field.lat || 0,
        lng: field.lng || 0,
        // Installed location (from field_seasons)
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
