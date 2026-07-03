import type { Metadata } from 'next';
import { getCachedOperations, getCachedFields, getCachedFieldSeasons, getCachedBillingEntities, getCachedProbeAssignments, getCachedProbes, getCachedContacts, getCachedAllSelectOptions } from '@/lib/baserow';
import type { TableSelectOptions } from '@/lib/baserow';
import { fetchElevation, fetchSoilType } from '@/lib/geo';
import ReviewClient from './ReviewClient';

interface PageProps {
  params: Promise<{
    token: string;
    season: string;
  }>;
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token, season } = await params;
  const operations = await getCachedOperations();
  const operation = operations.find((op) => op.approval_token === token);
  const title = operation
    ? `Field Info & Approvals — ${operation.name}`
    : 'Field Info & Approvals';
  return { title };
}

export interface ReviewFieldInfoItem {
  fieldId: number;
  fieldSeasonId: number;
  name: string;
  acres: number;
  billingEntityId: number | null;
  irrigationType: string;
  rowDirection: string;
  waterSource: string;
  fuelSource: string;
  crop: string;
  sideDress: string;
  hybridVariety: string;
  plantingDate: string;
}

export interface ReviewProbeAssignment {
  id: number;
  fieldSeasonId: number;
  fieldName: string;
  probeNumber: number;
  label: string;
  probeSerial?: string;
  placementLat?: number;
  placementLng?: number;
  elevation?: number | string;
  soilType?: string;
  placementNotes?: string;
  approvalStatus: string;
  approvalNotes?: string;
  approvalDate?: string;
  waterSource?: string;
  fuelSource?: string;
}

export interface ReviewBillingEntityOption {
  id: number;
  name: string;
}

export interface ReviewSelectOptions {
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

const ALL_QUESTION_KEYS = ['crop', 'irrigation_type', 'row_direction', 'side_dress', 'water_source', 'fuel_source', 'hybrid_variety', 'planting_date', 'billing_entity'];

export default async function ReviewPage({ params, searchParams }: PageProps) {
  const { token, season } = await params;
  const { q } = await searchParams;
  const seasonYear = parseInt(season, 10);

  const visibleQuestions = q
    ? q.split(',').filter(k => ALL_QUESTION_KEYS.includes(k))
    : ALL_QUESTION_KEYS;

  // Fetch all data in parallel
  const [operations, rawFields, fieldSeasons, billingEntities, probeAssignments, probes, contacts] = await Promise.all([
    getCachedOperations(),
    getCachedFields(),
    getCachedFieldSeasons(),
    getCachedBillingEntities(),
    getCachedProbeAssignments(),
    getCachedProbes(),
    getCachedContacts(),
  ]);

  const probeMap = new Map(probes.map((p) => [p.id, p.serial_number || 'Unknown']));

  // Find operation by approval token
  const operation = operations.find((op) => op.approval_token === token);

  if (!operation) {
    return (
      <div className="approval-page">
        <div className="approval-container">
          <div className="approval-error">
            <h1>Invalid Link</h1>
            <p>This link is not valid or has expired.</p>
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

  const billingEntityOptions: ReviewBillingEntityOption[] = Array.from(billingEntityMap.entries())
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
  const fieldSeasonIds = new Set(operationFieldSeasons.map((fs) => fs.id));

  // Get select options for dropdowns
  let allSelectOptions: Record<string, TableSelectOptions> = {};
  try {
    allSelectOptions = await getCachedAllSelectOptions(['fields', 'field_seasons']);
  } catch (e) {
    console.error('Failed to fetch select options:', e);
  }

  const selectOptions: ReviewSelectOptions = {
    irrigation_type: toOptions(allSelectOptions.fields?.irrigation_type || []),
    row_direction: toOptions(allSelectOptions.fields?.row_direction || []),
    water_source: toOptions(allSelectOptions.fields?.water_source || []),
    fuel_source: toOptions(allSelectOptions.fields?.fuel_source || []),
    crop: toOptions(allSelectOptions.field_seasons?.crop || []),
    side_dress: toOptions(allSelectOptions.field_seasons?.side_dress || []),
  };

  // Build field info items
  const fieldInfoItems: ReviewFieldInfoItem[] = operationFieldSeasons.map((fs) => {
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

  // Build probe assignments
  const reviewProbeAssignments: ReviewProbeAssignment[] = probeAssignments
    .filter((pa) => pa.field_season?.[0]?.id && fieldSeasonIds.has(pa.field_season[0].id))
    .map((pa) => {
      const fieldSeason = operationFieldSeasons.find((fs) => fs.id === pa.field_season?.[0]?.id);
      const field = fieldSeason?.field?.[0]?.id
        ? operationFields.find((f) => f.id === fieldSeason.field?.[0]?.id)
        : null;
      const probeSerial = pa.probe?.[0]?.id ? probeMap.get(pa.probe[0].id) : undefined;

      const fieldElevation = field ? (typeof field.elevation === 'object' ? (field.elevation as { value: string })?.value : field.elevation) : undefined;
      const fieldSoilType = field ? (typeof field.soil_type === 'object' ? (field.soil_type as { value: string })?.value : field.soil_type) : undefined;
      const paElevation = pa.elevation || fieldElevation;
      const paSoilType = pa.soil_type || fieldSoilType;

      return {
        id: pa.id,
        fieldSeasonId: pa.field_season?.[0]?.id || 0,
        fieldName: field?.name || 'Unknown Field',
        probeNumber: pa.probe_number || 1,
        label: pa.label || '',
        probeSerial,
        placementLat: pa.placement_lat,
        placementLng: pa.placement_lng,
        elevation: paElevation,
        soilType: paSoilType,
        placementNotes: pa.placement_notes,
        approvalStatus: pa.approval_status?.value || 'Pending',
        approvalNotes: pa.approval_notes,
        approvalDate: pa.approval_date,
        waterSource: field?.water_source?.value,
        fuelSource: field?.fuel_source?.value,
      };
    })
    .sort((a, b) => {
      const nameCompare = a.fieldName.localeCompare(b.fieldName);
      if (nameCompare !== 0) return nameCompare;
      return a.probeNumber - b.probeNumber;
    });

  // Backfill missing elevation/soil
  await Promise.all(
    reviewProbeAssignments
      .filter(pa => pa.placementLat && pa.placementLng && (!pa.elevation || !pa.soilType))
      .map(async (pa) => {
        const [elev, soil] = await Promise.all([
          !pa.elevation ? fetchElevation(pa.placementLat!, pa.placementLng!) : Promise.resolve(null),
          !pa.soilType ? fetchSoilType(pa.placementLat!, pa.placementLng!) : Promise.resolve(null),
        ]);
        if (elev && !pa.elevation) pa.elevation = elev;
        if (soil && !pa.soilType) pa.soilType = soil;
      })
  );

  return (
    <ReviewClient
      operationName={operation.name}
      season={seasonYear}
      token={token}
      fields={fieldInfoItems}
      probeAssignments={reviewProbeAssignments}
      selectOptions={selectOptions}
      billingEntityOptions={billingEntityOptions}
      visibleQuestions={visibleQuestions}
    />
  );
}
