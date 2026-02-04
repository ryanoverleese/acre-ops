import { getServiceRates } from '@/lib/baserow';
import SettingsClient, { ProcessedServiceRate } from './SettingsClient';

export const dynamic = 'force-dynamic';

async function getSettingsData(): Promise<ProcessedServiceRate[]> {
  try {
    const serviceRates = await getServiceRates();

    return serviceRates.map((sr) => ({
      id: sr.id,
      serviceType: sr.service_type || '',
      rate: sr.rate || 0,
      dealerFee: sr.dealer_fee || 0,
      description: sr.description || '',
      status: sr.status?.value || 'Active',
    }));
  } catch (error) {
    console.error('Error fetching settings data:', error);
    return [];
  }
}

export default async function SettingsPage() {
  const serviceRates = await getSettingsData();
  return <SettingsClient initialServiceRates={serviceRates} />;
}
