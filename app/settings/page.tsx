import { getServiceRates, getFieldSeasons, getAllSelectOptions } from '@/lib/baserow';
import type { TableSelectOptions } from '@/lib/baserow';
import SettingsClient, { ProcessedServiceRate } from './SettingsClient';

export const dynamic = 'force-dynamic';

export interface SerializedSelectOptions {
  fields: TableSelectOptions;
  field_seasons: TableSelectOptions;
  probe_assignments: TableSelectOptions;
}

interface SettingsData {
  serviceRates: ProcessedServiceRate[];
  availableSeasons: string[];
  selectOptions: SerializedSelectOptions;
}

async function getSettingsData(): Promise<SettingsData> {
  try {
    const [serviceRates, fieldSeasons, allSelectOptions] = await Promise.all([
      getServiceRates(),
      getFieldSeasons(),
      getAllSelectOptions(['fields', 'field_seasons', 'probe_assignments']),
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
      selectOptions: {
        fields: allSelectOptions.fields || {},
        field_seasons: allSelectOptions.field_seasons || {},
        probe_assignments: allSelectOptions.probe_assignments || {},
      },
    };
  } catch (error) {
    console.error('Error fetching settings data:', error);
    return {
      serviceRates: [],
      availableSeasons: [String(new Date().getFullYear())],
      selectOptions: { fields: {}, field_seasons: {}, probe_assignments: {} },
    };
  }
}

export default async function SettingsPage() {
  const { serviceRates, availableSeasons, selectOptions } = await getSettingsData();
  return <SettingsClient initialServiceRates={serviceRates} availableSeasons={availableSeasons} selectOptions={selectOptions} />;
}
