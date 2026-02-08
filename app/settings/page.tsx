import { getProductsServices, getFieldSeasons, getAllSelectOptionsWithMeta } from '@/lib/baserow';
import type { TableSelectOptionsWithMeta } from '@/lib/baserow';
import SettingsClient, { ProcessedProductService } from './SettingsClient';

export const dynamic = 'force-dynamic';

export interface SerializedSelectOptionsWithMeta {
  fields: TableSelectOptionsWithMeta;
  field_seasons: TableSelectOptionsWithMeta;
  probe_assignments: TableSelectOptionsWithMeta;
}

interface SettingsData {
  productsServices: ProcessedProductService[];
  availableSeasons: string[];
  selectOptions: SerializedSelectOptionsWithMeta;
}

async function getSettingsData(): Promise<SettingsData> {
  try {
    const [productsServices, fieldSeasons, allSelectOptions] = await Promise.all([
      getProductsServices(),
      getFieldSeasons(),
      getAllSelectOptionsWithMeta(['fields', 'field_seasons', 'probe_assignments']),
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
      productsServices: productsServices.map((sr) => ({
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
      productsServices: [],
      availableSeasons: [String(new Date().getFullYear())],
      selectOptions: { fields: {}, field_seasons: {}, probe_assignments: {} },
    };
  }
}

export default async function SettingsPage() {
  const { productsServices, availableSeasons, selectOptions } = await getSettingsData();
  return <SettingsClient initialProductsServices={productsServices} availableSeasons={availableSeasons} selectOptions={selectOptions} />;
}
