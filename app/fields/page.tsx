import { getFieldsData } from '@/lib/fields-data';
import FieldsClient from './FieldsClient';

// Re-export types so existing imports from this file still work
export type { ProcessedField, ProcessedProbeAssignment, OperationOption, BillingEntityOption, ProbeOption, ProductServiceOption, SerializedSelectOptions } from '@/lib/fields-data';

// Force dynamic rendering to always get fresh data
export const dynamic = 'force-dynamic';

export default async function FieldsPage() {
  const currentYear = new Date().getFullYear();
  const { fields, operations, billingEntities, probes, availableSeasons, probeAssignments, productsServices, selectOptions } = await getFieldsData(currentYear);

  return (
    <FieldsClient
      initialFields={fields}
      operations={operations}
      billingEntities={billingEntities}
      probes={probes}
      availableSeasons={availableSeasons}
      initialProbeAssignments={probeAssignments}
      productsServices={productsServices}
      selectOptions={selectOptions}
    />
  );
}
