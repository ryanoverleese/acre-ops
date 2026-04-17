import { getRows, getProbes, ProbeRackSlot } from '@/lib/baserow';
import RacksClient from './RacksClient';

export const dynamic = 'force-dynamic';

export default async function RacksPage() {
  const [slots, probes] = await Promise.all([
    getRows<ProbeRackSlot>('probe_rack'),
    getProbes(),
  ]);

  const processedProbes = probes.map((p) => ({
    id: p.id,
    serialNumber: p.serial_number || '',
    status: p.status?.value || 'Unknown',
    brand: p.brand?.value || 'Unknown',
  }));

  return <RacksClient slots={slots} probes={processedProbes} />;
}
