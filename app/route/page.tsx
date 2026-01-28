import { getFields, getBillingEntities, getOperations } from '@/lib/baserow';
import FieldLocationsClient, { FieldLocation } from './RouteClient';

export const dynamic = 'force-dynamic';

async function getFieldLocations(): Promise<FieldLocation[]> {
  try {
    const [fields, billingEntities, operations] = await Promise.all([
      getFields(),
      getBillingEntities(),
      getOperations(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    // Map billing entity to operation
    const billingToOperationMap = new Map<number, number>();
    billingEntities.forEach((be) => {
      if (be.operation?.[0]?.id) {
        billingToOperationMap.set(be.id, be.operation[0].id);
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

      return {
        id: field.id,
        name: field.name || 'Unnamed Field',
        operation: operationName,
        acres: field.acres || 0,
        lat: field.lat || 0,
        lng: field.lng || 0,
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
