import { getFieldsData } from '@/lib/fields-data';
import { query, transaction } from '@/lib/supabase/database';
import { readBoundaryFeatures, type Sql } from '@/lib/field-boundaries/store';
import FieldsClient from './FieldsClient';

// Re-export types so existing imports from this file still work
import { staffMetadata } from '@/lib/site-metadata';

export const metadata = staffMetadata('fields');

export type { ProcessedField, ProcessedProbeAssignment, OperationOption, BillingEntityOption, ProbeOption, ProductServiceOption, SerializedSelectOptions } from '@/lib/fields-data';

// Force dynamic rendering to always get fresh data
export const dynamic = 'force-dynamic';

const sql: Sql = { query: query as Sql['query'], transaction };

export default async function FieldsPage() {
  const currentYear = new Date().getFullYear();
  const { fields, operations, billingEntities, probes, availableSeasons, probeAssignments, productsServices, selectOptions } = await getFieldsData(currentYear);

  const fieldIds = [...new Set(
    fields.map((f) => f.id).filter((id) => Number.isSafeInteger(id) && id > 0),
  )];
  const initialBoundaries = fieldIds.length
    ? await readBoundaryFeatures(sql, fieldIds)
    : { type: 'FeatureCollection' as const, features: [] };

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
      initialBoundaries={initialBoundaries}
    />
  );
}
