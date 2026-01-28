import { getProbes, getOperations } from '@/lib/baserow';
import ProbesClient, { ProcessedProbe, OperationOption } from './ProbesClient';

async function getProbesData(): Promise<{
  probes: ProcessedProbe[];
  operations: OperationOption[];
  statusCounts: Record<string, number>;
}> {
  try {
    const [probes, operations] = await Promise.all([
      getProbes(),
      getOperations(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    const processedProbes: ProcessedProbe[] = probes.map((probe) => {
      const ownerLink = probe.owner_operation?.[0];
      return {
        id: probe.id,
        serialNumber: probe.serial_number || 'Unknown',
        brand: probe.brand?.value || 'Unknown',
        status: probe.status?.value || 'Unknown',
        rackLocation: probe.rack_location || '—',
        ownerOperation: ownerLink ? operationMap.get(ownerLink.id) || ownerLink.value : '—',
        ownerOperationId: ownerLink?.id,
        yearNew: probe.year_new,
        notes: probe.notes,
      };
    });

    const operationOptions: OperationOption[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
    }));

    const statusCounts: Record<string, number> = {
      all: processedProbes.length,
    };
    processedProbes.forEach((p) => {
      const status = p.status.toLowerCase().replace(' ', '-');
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return { probes: processedProbes, operations: operationOptions, statusCounts };
  } catch (error) {
    console.error('Error fetching probes data:', error);
    return { probes: [], operations: [], statusCounts: { all: 0 } };
  }
}

export default async function ProbesPage() {
  const { probes, operations, statusCounts } = await getProbesData();
  return <ProbesClient probes={probes} operations={operations} statusCounts={statusCounts} />;
}
