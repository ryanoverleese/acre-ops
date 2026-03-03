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
  const [productsServicesResult, fieldSeasonsResult, selectOptionsResult, operationsResult] = await Promise.allSettled([
    getProductsServices(),
    getFieldSeasons(),
    getAllSelectOptionsWithMeta(['fields', 'field_seasons', 'probe_assignments', 'contacts']),
    getOperations(),
  ]);

  const productsServices = productsServicesResult.status === 'fulfilled' ? productsServicesResult.value : [];
  const fieldSeasons = fieldSeasonsResult.status === 'fulfilled' ? fieldSeasonsResult.value : [];
  const allSelectOptions = selectOptionsResult.status === 'fulfilled' ? selectOptionsResult.value : { fields: {}, field_seasons: {}, probe_assignments: {}, contacts: {} };
  const operations = operationsResult.status === 'fulfilled' ? operationsResult.value : [];

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
}

export default async function SettingsPage() {
  const { productsServices, availableSeasons, selectOptions, operations } = await getSettingsData();
  return <SettingsClient initialProductsServices={productsServices} availableSeasons={availableSeasons} selectOptions={selectOptions} operations={operations} />;
}
