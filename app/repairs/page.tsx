import { getRepairs, getFieldSeasons, getFields, getBillingEntities, getOperations } from '@/lib/baserow';
import RepairsClient, { ProcessedRepair, FieldSeasonOption } from './RepairsClient';

async function getRepairsData(): Promise<{ repairs: ProcessedRepair[]; fieldSeasons: FieldSeasonOption[] }> {
  try {
    const [repairs, fieldSeasons, fields, billingEntities, operations] = await Promise.all([
      getRepairs(),
      getFieldSeasons(),
      getFields(),
      getBillingEntities(),
      getOperations(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    // Map billing entity to operation
    const billingToOperationMap = new Map<number, number>();
    billingEntities.forEach((be) => {
      if (be.operation?.[0]?.id) {
        billingToOperationMap.set(be.id, be.operation[0].id);
      }
    });

    const getOperationName = (field: typeof fields[0] | null | undefined): string => {
      if (field?.billing_entity?.[0]) {
        const opId = billingToOperationMap.get(field.billing_entity[0].id);
        if (opId) {
          return operationMap.get(opId) || 'Unknown';
        }
      }
      return 'Unknown';
    };

    const processedRepairs: ProcessedRepair[] = repairs.map((repair) => {
      const fsLink = repair.field_season?.[0];
      const fieldSeason = fsLink ? fieldSeasonMap.get(fsLink.id) : null;
      const fieldLink = fieldSeason?.field?.[0];
      const field = fieldLink ? fieldMap.get(fieldLink.id) : null;

      return {
        id: repair.id,
        fieldSeasonId: fsLink?.id || 0,
        fieldName: field?.name || fsLink?.value || 'Unknown Field',
        operation: getOperationName(field),
        reportedAt: repair.reported_at || '',
        problem: repair.problem || 'No description',
        fix: repair.fix,
        repairedAt: repair.repaired_at,
        notifiedCustomer: repair.notified_customer || false,
        status: repair.repaired_at ? 'resolved' as const : 'open' as const,
      };
    }).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    });

    // Build field season options for the dropdown
    const fieldSeasonOptions: FieldSeasonOption[] = fieldSeasons.map((fs) => {
      const fieldLink = fs.field?.[0];
      const field = fieldLink ? fieldMap.get(fieldLink.id) : null;
      return {
        id: fs.id,
        fieldName: field?.name || fieldLink?.value || 'Unknown Field',
        operation: getOperationName(field),
      };
    }).sort((a, b) => a.fieldName.localeCompare(b.fieldName));

    return { repairs: processedRepairs, fieldSeasons: fieldSeasonOptions };
  } catch (error) {
    console.error('Error fetching repairs data:', error);
    return { repairs: [], fieldSeasons: [] };
  }
}

export default async function RepairsPage() {
  const { repairs, fieldSeasons } = await getRepairsData();
  return <RepairsClient repairs={repairs} fieldSeasons={fieldSeasons} />;
}
