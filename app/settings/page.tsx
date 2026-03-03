import { getProductsServices, getFieldSeasons, getAllSelectOptionsWithMeta, getOperations } from '@/lib/baserow';
import type { TableSelectOptionsWithMeta } from '@/lib/baserow';
import SettingsClient, { ProcessedProductService } from './SettingsClient';

export const dynamic = 'force-dynamic';

export interface SerializedSelectOptionsWithMeta {
  fields: TableSelectOptionsWithMeta;
  field_seasons: TableSelectOptionsWithMeta;
  probe_assignments: TableSelectOptionsWithMeta;
  contacts: TableSelectOptionsWithMeta;
}

interface SettingsData {
  productsServices: ProcessedProductService[];
  availableSeasons: string[];
  selectOptions: SerializedSelectOptionsWithMeta;
  operations: { id: number; name: string }[];
}

async function getSettingsData(): Promise<SettingsData> {
  try {
    const [productsServices, fieldSeasons, allSelectOptions, operations] = await Promise.all([
      getProductsServices(),
      getFieldSeasons(),
      getAllSelectOptionsWithMeta(['fields', 'field_seasons', 'probe_assignments', 'contacts']),
      getOperations(),
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
        contacts: allSelectOptions.contacts || {},
      },
      operations: operations.map(op => ({ id: op.id, name: op.name })),
    };
  } catch (error) {
    console.error('Error fetching settings data:', error);
    return {
      productsServices: [],
      availableSeasons: [String(new Date().getFullYear())],
      selectOptions: { fields: {}, field_seasons: {}, probe_assignments: {}, contacts: {} },
      operations: [],
    };
  }
}

export default async function SettingsPage() {
  const { productsServices, availableSeasons, selectOptions, operations } = await getSettingsData();
  return <SettingsClient initialProductsServices={productsServices} availableSeasons={availableSeasons} selectOptions={selectOptions} operations={operations} />;
}
