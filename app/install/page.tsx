import { getFields, getFieldSeasons, getProbes, getBillingEntities, getOperations } from '@/lib/baserow';
import InstallClient, { InstallableField } from './InstallClient';

async function getInstallData(): Promise<InstallableField[]> {
  try {
    const [fields, fieldSeasons, probes, billingEntities, operations] = await Promise.all([
      getFields(),
      getFieldSeasons(),
      getProbes(),
      getBillingEntities(),
      getOperations(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const probeMap = new Map(probes.map((p) => [p.id, p]));

    // Map billing entity to operation
    const billingToOperationMap = new Map<number, number>();
    billingEntities.forEach((be) => {
      if (be.operation?.[0]?.id) {
        billingToOperationMap.set(be.id, be.operation[0].id);
      }
    });

    // Filter: ready_to_install = true AND probe_status != 'Installed'
    const readySeasons = fieldSeasons.filter((fs) => {
      // Must be marked ready to install
      if (!fs.ready_to_install) return false;

      const status1 = fs.probe_status?.value?.toLowerCase() || '';
      const status2 = fs.probe_2_status?.value?.toLowerCase() || '';

      // Include if probe 1 needs install OR probe 2 needs install
      const probe1NeedsInstall = fs.probe?.[0] && status1 !== 'installed';
      const probe2NeedsInstall = fs.probe_2?.[0] && status2 !== 'installed';

      return probe1NeedsInstall || probe2NeedsInstall;
    });

    const installableFields: InstallableField[] = readySeasons.map((fs) => {
      const fieldLink = fs.field?.[0];
      const field = fields.find((f) => f.id === fieldLink?.id);

      // Probe 1 data
      const probe1Link = fs.probe?.[0];
      const probe1Data = probe1Link ? probeMap.get(probe1Link.id) : null;
      const probe1Status = fs.probe_status?.value?.toLowerCase() || '';

      // Probe 2 data
      const probe2Link = fs.probe_2?.[0];
      const probe2Data = probe2Link ? probeMap.get(probe2Link.id) : null;
      const probe2Status = fs.probe_2_status?.value?.toLowerCase() || '';

      let operationName = 'Unknown';
      if (field?.billing_entity?.[0]) {
        const opId = billingToOperationMap.get(field.billing_entity[0].id);
        if (opId) {
          operationName = operationMap.get(opId) || 'Unknown';
        }
      }

      return {
        id: fs.id,
        fieldId: field?.id || 0,
        fieldName: field?.name || fieldLink?.value || 'Unknown Field',
        operation: operationName,
        season: fs.season ? String(fs.season) : '',
        lat: field?.lat || 0,
        lng: field?.lng || 0,
        crop: fs.crop?.value || '',
        antennaType: fs.antenna_type?.value || '',
        // Install planning
        routeOrder: fs.route_order || 999,
        plannedInstaller: fs.planned_installer?.value || '',
        // Probe 1
        probe1Serial: probe1Data?.serial_number || '',
        probe1Brand: probe1Data?.brand?.value || '',
        probe1RackLocation: probe1Data?.rack_location || '',
        probe1Status: probe1Status,
        probe1NeedsInstall: !!probe1Link && probe1Status !== 'installed',
        // Probe 2
        probe2Serial: probe2Data?.serial_number || '',
        probe2Brand: probe2Data?.brand?.value || '',
        probe2RackLocation: probe2Data?.rack_location || '',
        probe2Status: probe2Status,
        probe2NeedsInstall: !!probe2Link && probe2Status !== 'installed',
        hasProbe2: !!probe2Link,
      };
    });

    // Sort by route_order ascending
    installableFields.sort((a, b) => a.routeOrder - b.routeOrder);

    return installableFields;
  } catch (error) {
    console.error('Error fetching install data:', error);
    return [];
  }
}

export default async function InstallPage() {
  const fields = await getInstallData();

  return <InstallClient fields={fields} />;
}
