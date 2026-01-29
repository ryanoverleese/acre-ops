import { getProbes, getBillingEntities } from '@/lib/baserow';
import ProbesClient, { ProcessedProbe, BillingEntityOption } from './ProbesClient';

async function getProbesData(): Promise<{
  probes: ProcessedProbe[];
  billingEntities: BillingEntityOption[];
  statusCounts: Record<string, number>;
}> {
  try {
    const [probes, billingEntities] = await Promise.all([
      getProbes(),
      getBillingEntities(),
    ]);

    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name]));

    const processedProbes: ProcessedProbe[] = probes.map((probe) => {
      const ownerLink = probe.owner_billing_entity?.[0];
      return {
        id: probe.id,
        serialNumber: probe.serial_number || 'Unknown',
        brand: probe.brand?.value || 'Unknown',
        status: probe.status?.value || 'Unknown',
        rackLocation: probe.rack_location || '—',
        ownerBillingEntity: ownerLink ? billingEntityMap.get(ownerLink.id) || ownerLink.value : '—',
        ownerBillingEntityId: ownerLink?.id,
        yearNew: probe.year_new,
        notes: probe.notes,
      };
    });

    const billingEntityOptions: BillingEntityOption[] = billingEntities.map((be) => ({
      id: be.id,
      name: be.name,
    }));

    const statusCounts: Record<string, number> = {
      all: processedProbes.length,
    };
    processedProbes.forEach((p) => {
      const status = p.status.toLowerCase().replace(' ', '-');
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return { probes: processedProbes, billingEntities: billingEntityOptions, statusCounts };
  } catch (error) {
    console.error('Error fetching probes data:', error);
    return { probes: [], billingEntities: [], statusCounts: { all: 0 } };
  }
}

export default async function ProbesPage() {
  const { probes, billingEntities, statusCounts } = await getProbesData();
  return <ProbesClient probes={probes} billingEntities={billingEntities} statusCounts={statusCounts} />;
}
