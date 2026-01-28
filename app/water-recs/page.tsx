import { getWaterRecs, getFieldSeasons, getFields, getBillingEntities, getOperations } from '@/lib/baserow';
import WaterRecsClient, { ProcessedWaterRec, FieldSeasonOption } from './WaterRecsClient';

async function getWaterRecsData(): Promise<{ waterRecs: ProcessedWaterRec[]; fieldSeasons: FieldSeasonOption[] }> {
  try {
    const [waterRecs, fieldSeasons, fields, billingEntities, operations] = await Promise.all([
      getWaterRecs(),
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

    const processedRecs: ProcessedWaterRec[] = waterRecs.map((rec) => {
      const fsLink = rec.field_season?.[0];
      const fieldSeason = fsLink ? fieldSeasonMap.get(fsLink.id) : null;
      const fieldLink = fieldSeason?.field?.[0];
      const field = fieldLink ? fieldMap.get(fieldLink.id) : null;

      return {
        id: rec.id,
        fieldSeasonId: fsLink?.id || 0,
        fieldName: field?.name || fsLink?.value || 'Unknown Field',
        operation: getOperationName(field),
        crop: fieldSeason?.crop?.value || 'Unknown',
        date: rec.date || '',
        recommendation: rec.recommendation || '',
        suggestedWaterDay: rec.suggested_water_day?.value || '',
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

    return { waterRecs: processedRecs, fieldSeasons: fieldSeasonOptions };
  } catch (error) {
    console.error('Error fetching water recs data:', error);
    return { waterRecs: [], fieldSeasons: [] };
  }
}

export default async function WaterRecsPage() {
  const { waterRecs, fieldSeasons } = await getWaterRecsData();
  return <WaterRecsClient waterRecs={waterRecs} fieldSeasons={fieldSeasons} />;
}
