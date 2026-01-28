import { getFields, getFieldSeasons, getProbes, getBillingEntities, getOperations } from '@/lib/baserow';
import RouteClient, { PendingInstall } from './RouteClient';

async function getPendingInstalls(): Promise<PendingInstall[]> {
  try {
    const [fields, fieldSeasons, probes, billingEntities, operations] = await Promise.all([
      getFields(),
      getFieldSeasons(),
      getProbes(),
      getBillingEntities(),
      getOperations(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const probeMap = new Map(probes.map((p) => [p.id, p.serial_number]));

    // Map billing entity to operation
    const billingToOperationMap = new Map<number, number>();
    billingEntities.forEach((be) => {
      if (be.operation?.[0]?.id) {
        billingToOperationMap.set(be.id, be.operation[0].id);
      }
    });

    // Find field seasons that are pending/assigned (not installed)
    const pendingSeasons = fieldSeasons.filter((fs) => {
      const status = fs.probe_status?.value?.toLowerCase() || '';
      return (
        (status === 'assigned' || status === 'pending' || status === '') &&
        fs.probe?.[0] && // Has a probe assigned
        !fs.install_date // Not yet installed
      );
    });

    const pendingInstalls: PendingInstall[] = pendingSeasons.map((fs) => {
      const fieldLink = fs.field?.[0];
      const field = fields.find((f) => f.id === fieldLink?.id);
      const probeLink = fs.probe?.[0];

      let operationName = 'Unknown';
      if (field?.billing_entity?.[0]) {
        const opId = billingToOperationMap.get(field.billing_entity[0].id);
        if (opId) {
          operationName = operationMap.get(opId) || 'Unknown';
        }
      }

      return {
        id: fs.id,
        fieldName: field?.name || fieldLink?.value || 'Unknown Field',
        operation: operationName,
        acres: field?.acres || 0,
        crop: fs.crop?.value || 'Unknown',
        probeSerial: probeLink ? probeMap.get(probeLink.id) || probeLink.value : 'Unknown',
        lat: field?.lat || 0,
        lng: field?.lng || 0,
        status: fs.probe_status?.value || 'Pending',
        // Irrigation details
        irrigationType: field?.irrigation_type?.value,
        rowDirection: field?.row_direction?.value,
        dripTubingDirection: field?.drip_tubing_direction?.value,
        dripTubingSpacing: field?.drip_tubing_spacing,
        dripEmitterSpacing: field?.drip_emitter_spacing,
        dripZones: field?.drip_zones,
        dripGpm: field?.drip_gpm,
        dripDepth: field?.drip_depth,
        // Location data
        elevation: field?.elevation,
        soilType: field?.soil_type,
        placementNotes: field?.placement_notes,
      };
    }).filter((install) => install.lat !== 0 && install.lng !== 0);

    return pendingInstalls;
  } catch (error) {
    console.error('Error fetching pending installs:', error);
    return [];
  }
}

export default async function RoutePage() {
  const pendingInstalls = await getPendingInstalls();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return <RouteClient pendingInstalls={pendingInstalls} today={today} />;
}
