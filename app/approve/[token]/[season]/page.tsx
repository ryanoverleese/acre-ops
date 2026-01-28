import { getOperations, getFields, getFieldSeasons, getBillingEntities } from '@/lib/baserow';
import ApprovalClient from './ApprovalClient';

interface PageProps {
  params: Promise<{
    token: string;
    season: string;
  }>;
}

export interface ApprovalField {
  id: number;
  fieldSeasonId: number;
  name: string;
  acres: number;
  lat: number;
  lng: number;
  elevation?: number;
  soilType?: string;
  placementNotes?: string;
  crop: string;
  serviceType: string;
  approvalStatus: string;
  approvalNotes?: string;
  approvalDate?: string;
}

export default async function ApprovePage({ params }: PageProps) {
  const { token, season } = await params;
  const seasonYear = parseInt(season, 10);

  // Fetch all data in parallel
  const [operations, rawFields, fieldSeasons, billingEntities] = await Promise.all([
    getOperations(),
    getFields(),
    getFieldSeasons(),
    getBillingEntities(),
  ]);

  // Find operation by approval token
  const operation = operations.find((op) => op.approval_token === token);

  if (!operation) {
    return (
      <div className="approval-page">
        <div className="approval-container">
          <div className="approval-error">
            <h1>Invalid Link</h1>
            <p>This approval link is not valid or has expired.</p>
          </div>
        </div>
      </div>
    );
  }

  // Get billing entities for this operation
  const operationBillingEntities = billingEntities.filter(
    (be) => be.operation?.[0]?.id === operation.id
  );
  const billingEntityIds = new Set(operationBillingEntities.map((be) => be.id));

  // Get fields belonging to this operation (via billing entity)
  const operationFields = rawFields.filter(
    (f) => f.billing_entity?.[0]?.id && billingEntityIds.has(f.billing_entity[0].id)
  );
  const fieldIds = new Set(operationFields.map((f) => f.id));

  // Get field seasons for this operation and season
  // Use String() comparison since Baserow may return season as string or number
  const operationFieldSeasons = fieldSeasons.filter(
    (fs) => fs.field?.[0]?.id && fieldIds.has(fs.field[0].id) && String(fs.season) === String(seasonYear)
  );

  // Debug: find all field seasons that match our fields (regardless of season)
  const allFieldSeasonsForOperation = fieldSeasons.filter(
    (fs) => fs.field?.[0]?.id && fieldIds.has(fs.field[0].id)
  );

  // Debug info
  console.log('DEBUG Approval Page:');
  console.log('- Operation:', operation.name, 'ID:', operation.id);
  console.log('- Total billing entities:', billingEntities.length);
  console.log('- Billing entities for this operation:', operationBillingEntities.length, operationBillingEntities.map(be => be.name));
  console.log('- Total fields:', rawFields.length);
  console.log('- Fields for this operation:', operationFields.length, operationFields.map(f => f.name));
  console.log('- Total field seasons:', fieldSeasons.length);
  console.log('- Field seasons for this operation + season:', operationFieldSeasons.length);

  // Build approval fields
  const approvalFields: ApprovalField[] = operationFieldSeasons.map((fs) => {
    const field = operationFields.find((f) => f.id === fs.field?.[0]?.id);
    return {
      id: field?.id || 0,
      fieldSeasonId: fs.id,
      name: field?.name || 'Unknown Field',
      acres: field?.acres || 0,
      lat: field?.lat || 0,
      lng: field?.lng || 0,
      elevation: typeof field?.elevation === 'object' ? Number(field?.elevation?.value) || undefined : field?.elevation,
      soilType: typeof field?.soil_type === 'object' ? field?.soil_type?.value : field?.soil_type,
      placementNotes: field?.placement_notes,
      crop: fs.crop?.value || 'Not Set',
      serviceType: fs.service_type?.value || 'Not Set',
      approvalStatus: fs.approval_status?.value || 'Pending',
      approvalNotes: fs.approval_notes,
      approvalDate: fs.approval_date,
    };
  });

  // Sort by name
  approvalFields.sort((a, b) => a.name.localeCompare(b.name));

  // Debug data to pass to client
  const debugInfo = {
    operationId: operation.id,
    totalBillingEntities: billingEntities.length,
    operationBillingEntities: operationBillingEntities.map(be => ({ id: be.id, name: be.name })),
    totalFields: rawFields.length,
    operationFields: operationFields.map(f => ({ id: f.id, name: f.name })),
    totalFieldSeasons: fieldSeasons.length,
    operationFieldSeasons: operationFieldSeasons.length,
    // Show all field seasons for this operation (any season) to debug
    allFieldSeasonsForOp: allFieldSeasonsForOperation.map(fs => ({
      id: fs.id,
      fieldId: fs.field?.[0]?.id,
      fieldName: fs.field?.[0]?.value,
      season: fs.season,
      seasonType: typeof fs.season,
    })),
  };

  return (
    <ApprovalClient
      operationName={operation.name}
      season={seasonYear}
      fields={approvalFields}
      debugInfo={debugInfo}
    />
  );
}
