import { getOperations, getFields, getFieldSeasons, getContacts, getAllSelectOptions } from '@/lib/baserow';
import type { TableSelectOptions } from '@/lib/baserow';
import FieldInfoClient from './FieldInfoClient';

interface PageProps {
  params: Promise<{
    token: string;
    season: string;
  }>;
}

export interface BillingEntityOption {
  id: number;
  name: string;
}

export interface FieldInfoItem {
  fieldId: number;
  fieldSeasonId: number;
  name: string;
  acres: number;
  billingEntityId: number | null;
  // Current values (may be empty for new customers)
  irrigationType: string;
  rowDirection: string;
  waterSource: string;
  fuelSource: string;
  crop: string;
  sideDress: string;
  hybridVariety: string;
  plantingDate: string;
}

export interface FieldInfoSelectOptions {
  irrigation_type: { value: string; label: string }[];
  row_direction: { value: string; label: string }[];
  water_source: { value: string; label: string }[];
  fuel_source: { value: string; label: string }[];
  crop: { value: string; label: string }[];
  side_dress: { value: string; label: string }[];
}

function toOptions(opts: { id: number; value: string; color: string }[]): { value: string; label: string }[] {
  return (opts || []).map((o) => ({ value: o.value, label: o.value })).sort((a, b) => a.label.localeCompare(b.label));
}

export default async function FieldInfoPage({ params }: PageProps) {
  const { token, season } = await params;
  const seasonYear = parseInt(season, 10);

  const [operations, rawFields, fieldSeasons, contacts] = await Promise.all([
    getOperations(),
    getFields(),
    getFieldSeasons(),
    getContacts(),
  ]);

  // Find operation by approval token (reuse same token)
  const operation = operations.find((op) => op.approval_token === token);

  if (!operation) {
    return (
      <div className="approval-page">
        <div className="approval-container">
          <div className="approval-error">
            <h1>Invalid Link</h1>
            <p>This field information link is not valid or has expired.</p>
          </div>
        </div>
      </div>
    );
  }

  // Get billing entities for this operation through contacts
  const billingEntityIds = new Set<number>();
  const billingEntityMap = new Map<number, string>();
  contacts.forEach((contact) => {
    const hasOperation = contact.operations?.some((op) => op.id === operation.id);
    if (hasOperation) {
      contact.billing_entity?.forEach((be) => {
        billingEntityIds.add(be.id);
        billingEntityMap.set(be.id, be.value);
      });
    }
  });

  const billingEntityOptions: BillingEntityOption[] = Array.from(billingEntityMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Get fields belonging to this operation
  const operationFields = rawFields.filter(
    (f) => f.billing_entity?.[0]?.id && billingEntityIds.has(f.billing_entity[0].id)
  );
  const fieldIds = new Set(operationFields.map((f) => f.id));

  // Get field seasons for this season
  const operationFieldSeasons = fieldSeasons.filter(
    (fs) => fs.field?.[0]?.id && fieldIds.has(fs.field[0].id) && String(fs.season) === String(seasonYear)
  );

  // Get select options for dropdowns
  let allSelectOptions: Record<string, TableSelectOptions> = {};
  try {
    allSelectOptions = await getAllSelectOptions(['fields', 'field_seasons']);
  } catch (e) {
    console.error('Failed to fetch select options:', e);
  }

  const selectOptions: FieldInfoSelectOptions = {
    irrigation_type: toOptions(allSelectOptions.fields?.irrigation_type || []),
    row_direction: toOptions(allSelectOptions.fields?.row_direction || []),
    water_source: toOptions(allSelectOptions.fields?.water_source || []),
    fuel_source: toOptions(allSelectOptions.fields?.fuel_source || []),
    crop: toOptions(allSelectOptions.field_seasons?.crop || []),
    side_dress: toOptions(allSelectOptions.field_seasons?.side_dress || []),
  };

  // Build field info items
  const items: FieldInfoItem[] = operationFieldSeasons.map((fs) => {
    const field = operationFields.find((f) => f.id === fs.field?.[0]?.id);
    return {
      fieldId: field?.id || 0,
      fieldSeasonId: fs.id,
      name: field?.name || 'Unknown Field',
      acres: field?.acres || 0,
      billingEntityId: field?.billing_entity?.[0]?.id || null,
      irrigationType: field?.irrigation_type?.value || '',
      rowDirection: field?.row_direction?.value || '',
      waterSource: field?.water_source?.value || '',
      fuelSource: field?.fuel_source?.value || '',
      crop: fs.crop?.value || '',
      sideDress: fs.side_dress?.value || '',
      hybridVariety: fs.hybrid_variety || '',
      plantingDate: fs.planting_date || '',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <FieldInfoClient
      operationName={operation.name}
      season={seasonYear}
      token={token}
      fields={items}
      selectOptions={selectOptions}
      billingEntityOptions={billingEntityOptions}
    />
  );
}
