import { getServiceRates, getFieldSeasons } from '@/lib/baserow';
import SettingsClient, { ProcessedServiceRate } from './SettingsClient';

export const dynamic = 'force-dynamic';

interface SettingsData {
  serviceRates: ProcessedServiceRate[];
  availableSeasons: string[];
}

async function getSettingsData(): Promise<SettingsData> {
  try {
    const [serviceRates, fieldSeasons] = await Promise.all([
      getServiceRates(),
      getFieldSeasons(),
    ]);

    // Collect unique seasons from field_seasons
    const currentYear = new Date().getFullYear();
    const seasons = new Set<string>();
    seasons.add(String(currentYear));
    seasons.add(String(currentYear + 1));

    fieldSeasons.forEach((fs) => {
      if (fs.season) {
        seasons.add(String(fs.season));
      }
    });

    return {
      serviceRates: serviceRates.map((sr) => ({
        id: sr.id,
        serviceType: sr.service_type || '',
        rate: sr.rate || 0,
        dealerFee: sr.dealer_fee || 0,
        description: sr.description || '',
        status: sr.status?.value || 'Active',
      })),
      availableSeasons: Array.from(seasons).sort((a, b) => b.localeCompare(a)),
    };
  } catch (error) {
    console.error('Error fetching settings data:', error);
    return { serviceRates: [], availableSeasons: [String(new Date().getFullYear())] };
  }
}

export default async function SettingsPage() {
  const { serviceRates, availableSeasons } = await getSettingsData();
  return <SettingsClient initialServiceRates={serviceRates} availableSeasons={availableSeasons} />;
}
