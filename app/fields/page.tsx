import { getFields, getOperations, getFieldSeasons, getProbes } from '@/lib/baserow';
import FieldsClient from './FieldsClient';

// Define the shape of our processed field data
export interface ProcessedField {
  id: number;
  name: string;
  operation: string;
  operationId: number | null;
  acres: number;
  crop: string;
  probe: string | null;
  status: string;
  lat: number;
  lng: number;
}

export interface OperationOption {
  id: number;
  name: string;
}

async function getFieldsData(): Promise<{
  fields: ProcessedField[];
  operations: OperationOption[];
}> {
  try {
    const [rawFields, operations, fieldSeasons, probes] = await Promise.all([
      getFields(),
      getOperations(),
      getFieldSeasons(),
      getProbes(),
    ]);

    // Create lookup maps
    const operationMap = new Map(operations.map((op) => [op.id, op.Name]));
    const probeMap = new Map(probes.map((p) => [p.id, p['Serial Number']]));

    // Process fields with their related data
    const processedFields: ProcessedField[] = rawFields.map((field) => {
      // Get operation name from linked field
      const operationLink = field.Operation?.[0];
      const operationName = operationLink ? operationMap.get(operationLink.id) || operationLink.value : 'Unknown';
      const operationId = operationLink?.id || null;

      // Find field season for this field to get probe and status
      const season = fieldSeasons.find((fs) => fs.Field?.[0]?.id === field.id);
      const probeLink = season?.Probe?.[0];
      const probeName = probeLink ? probeMap.get(probeLink.id) || probeLink.value : null;

      // Determine status
      let status = 'needs-probe';
      if (season?.Status) {
        status = season.Status.toLowerCase().replace(' ', '-');
      } else if (probeName) {
        status = 'pending';
      }

      return {
        id: field.id,
        name: field.Name || 'Unnamed Field',
        operation: operationName,
        operationId,
        acres: field.Acres || 0,
        crop: season?.Crop || field.Crop || 'Unknown',
        probe: probeName ? `#${probeName}` : null,
        status,
        lat: field.Latitude || 0,
        lng: field.Longitude || 0,
      };
    });

    const operationOptions: OperationOption[] = operations.map((op) => ({
      id: op.id,
      name: op.Name,
    }));

    return {
      fields: processedFields,
      operations: operationOptions,
    };
  } catch (error) {
    console.error('Error fetching fields data:', error);
    return {
      fields: [],
      operations: [],
    };
  }
}

export default async function FieldsPage() {
  const { fields, operations } = await getFieldsData();

  // Calculate stats
  const statusCounts = {
    all: fields.length,
    'needs-probe': fields.filter((f) => f.status === 'needs-probe').length,
    pending: fields.filter((f) => f.status === 'pending').length,
    installed: fields.filter((f) => f.status === 'installed').length,
    repair: fields.filter((f) => f.status === 'repair').length,
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Fields</h2>
          <span className="season-badge">2025 Season</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input type="text" placeholder="Search fields..." />
          </div>
          <button className="btn btn-primary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Field
          </button>
        </div>
      </header>

      <div className="content">
        <FieldsClient
          initialFields={fields}
          operations={operations}
          statusCounts={statusCounts}
        />
      </div>
    </>
  );
}
