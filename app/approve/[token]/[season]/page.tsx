import { getOperations, getFields, getFieldSeasons, getBillingEntities, getProbeAssignments, getProbes, getContacts } from '@/lib/baserow';
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
  waterSource?: string;
  fuelSource?: string;
}

export interface ApprovalProbeAssignment {
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

export default async function ApprovePage({ params }: PageProps) {
  const { token, season } = await params;
  const seasonYear = parseInt(season, 10);

  // Fetch all data in parallel
  const [operations, rawFields, fieldSeasons, billingEntities, probeAssignments, probes, contacts] = await Promise.all([
    getOperations(),
    getFields(),
    getFieldSeasons(),
    getBillingEntities(),
    getProbeAssignments(),
    getProbes(),
    getContacts(),
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
            <p>This approval link is not valid or has expired.</p>
          </div>
        </div>
      </div>
    );
  }

  // Get billing entities for this operation through contacts
  // Find contacts linked to this operation, then get their billing entities
  const billingEntityIds = new Set<number>();
  contacts.forEach((contact) => {
    const hasOperation = contact.operations?.some((op) => op.id === operation.id);
    if (hasOperation) {
      contact.billing_entity?.forEach((be) => billingEntityIds.add(be.id));
    }
  });

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
      serviceType: fs.service_type?.[0]?.value || 'Not Set',
      approvalStatus: fs.approval_status?.value || 'Pending',
      approvalNotes: fs.approval_notes,
      approvalDate: fs.approval_date,
      waterSource: field?.water_source?.value,
      fuelSource: field?.fuel_source?.value,
    };
  });

  // Sort by name
  approvalFields.sort((a, b) => a.name.localeCompare(b.name));

  // Get field season IDs for this operation
  const fieldSeasonIds = new Set(operationFieldSeasons.map((fs) => fs.id));

  // Build approval probe assignments
  const approvalProbeAssignments: ApprovalProbeAssignment[] = probeAssignments
    .filter((pa) => pa.field_season?.[0]?.id && fieldSeasonIds.has(pa.field_season[0].id))
    .map((pa) => {
      const fieldSeason = operationFieldSeasons.find((fs) => fs.id === pa.field_season?.[0]?.id);
      const field = fieldSeason?.field?.[0]?.id
        ? operationFields.find((f) => f.id === fieldSeason.field?.[0]?.id)
        : null;
      const probeSerial = pa.probe?.[0]?.id ? probeMap.get(pa.probe[0].id) : undefined;

      // Fall back to field-level elevation/soilType if probe assignment lacks them
      const paElevation = pa.elevation ?? (field ? (typeof field.elevation === 'object' ? (field.elevation as { value: string })?.value : field.elevation) : undefined);
      const paSoilType = pa.soil_type ?? (field ? (typeof field.soil_type === 'object' ? (field.soil_type as { value: string })?.value : field.soil_type) : undefined);

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

  return (
    <ApprovalClient
      operationName={operation.name}
      season={seasonYear}
      fields={approvalFields}
      probeAssignments={approvalProbeAssignments}
    />
  );
}
