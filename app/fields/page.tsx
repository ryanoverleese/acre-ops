import { getFields, getOperations, getFieldSeasons, getProbes, getBillingEntities } from '@/lib/baserow';
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

export interface BillingEntityOption {
  id: number;
  name: string;
  operationName: string;
}

async function getFieldsData(): Promise<{
  fields: ProcessedField[];
  operations: OperationOption[];
  billingEntities: BillingEntityOption[];
}> {
  try {
    const [rawFields, operations, fieldSeasons, probes, billingEntities] = await Promise.all([
      getFields(),
      getOperations(),
      getFieldSeasons(),
      getProbes(),
      getBillingEntities(),
    ]);

    // Create lookup maps
    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const probeMap = new Map(probes.map((p) => [p.id, p.serial_number]));
    
    // Map billing entity to operation
    const billingToOperationMap = new Map<number, number>();
    billingEntities.forEach((be) => {
      if (be.operation?.[0]?.id) {
        billingToOperationMap.set(be.id, be.operation[0].id);
      }
    });

    // Process fields with their related data
    const processedFields: ProcessedField[] = rawFields.map((field) => {
      // Get operation from billing_entity -> operation chain
      const billingEntityLink = field.billing_entity?.[0];
      let operationName = 'Unknown';
      let operationId: number | null = null;
      
      if (billingEntityLink) {
        operationId = billingToOperationMap.get(billingEntityLink.id) || null;
        if (operationId) {
          operationName = operationMap.get(operationId) || 'Unknown';
        } else {
          // Fallback to billing entity name
          operationName = billingEntityLink.value || 'Unknown';
        }
      }

      // Find field season for this field to get probe and status
      const season = fieldSeasons.find((fs) => fs.field?.[0]?.id === field.id);
      const probeLink = season?.probe?.[0];
      const probeName = probeLink ? probeMap.get(probeLink.id) || probeLink.value : null;

      // Determine status from field_season
      let status = 'needs-probe';
      if (season?.probe_status?.value) {
        status = season.probe_status.value.toLowerCase().replace(' ', '-');
      } else if (probeName) {
        status = 'assigned';
      }

      // Get crop from field_season
      const crop = season?.crop?.value || 'Unknown';

      return {
        id: field.id,
        name: field.name || 'Unnamed Field',
        operation: operationName,
        operationId,
        acres: field.acres || 0,
        crop,
        probe: probeName ? `#${probeName}` : null,
        status,
        lat: field.lat || 0,
        lng: field.lng || 0,
      };
    });

    const operationOptions: OperationOption[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
    }));

    const billingEntityOptions: BillingEntityOption[] = billingEntities.map((be) => {
      const opId = be.operation?.[0]?.id;
      const operationName = opId ? operationMap.get(opId) || 'Unknown' : 'Unknown';
      return {
        id: be.id,
        name: be.name,
        operationName,
      };
    });

    return {
      fields: processedFields,
      operations: operationOptions,
      billingEntities: billingEntityOptions,
    };
  } catch (error) {
    console.error('Error fetching fields data:', error);
    return {
      fields: [],
      operations: [],
      billingEntities: [],
    };
  }
}

export default async function FieldsPage() {
  const { fields, operations, billingEntities } = await getFieldsData();

  // Calculate stats
  const statusCounts = {
    all: fields.length,
    'needs-probe': fields.filter((f) => f.status === 'needs-probe').length,
    pending: fields.filter((f) => f.status === 'pending' || f.status === 'assigned').length,
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
        <div className="header-right"></div>
      </header>

      <div className="content">
        <FieldsClient
          initialFields={fields}
          operations={operations}
          billingEntities={billingEntities}
          statusCounts={statusCounts}
        />
      </div>
    </>
  );
}
