import { getWaterRecs, getFieldSeasons, getFields, getOperations, getContacts, getProbeAssignments, getTableFieldOptions } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import WaterRecsClient from './WaterRecsClient';

export const dynamic = 'force-dynamic';

export interface ReportField {
  fieldSeasonId: number;
  fieldId: number;
  fieldName: string;
  crop: string;
  acres: number;
}

export interface OperationGroup {
  id: number;
  name: string;
  fields: ReportField[];
}

export interface WaterRecRecord {
  id: number;
  fieldSeasonId: number;
  date: string;
  recommendation: string;
  suggestedWaterDay: string;
  priority: boolean;
}

export default async function WaterRecsPage() {
  const currentYear = new Date().getFullYear();

  try {
    const [operations, rawFields, fieldSeasons, contacts, waterRecs, probeAssignments, waterRecOptions] = await Promise.all([
      getOperations(),
      getFields(),
      getFieldSeasons(),
      getContacts(),
      getWaterRecs(),
      getProbeAssignments(),
      getTableFieldOptions('water_recs'),
    ]);

    // Get water day options from Baserow single_select field
    const waterDayOptions = (waterRecOptions.suggested_water_day || []).map(o => o.value);

    const operationMap = buildOperationMap(operations);
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);

    // Build field → operation mapping
    const fieldToOperation = new Map<number, number>();
    const fieldMap = new Map(rawFields.map(f => [f.id, f]));
    rawFields.forEach(field => {
      const beId = field.billing_entity?.[0]?.id;
      if (beId && billingToOperationMap.has(beId)) {
        fieldToOperation.set(field.id, billingToOperationMap.get(beId)!);
      }
    });

    // Find field_seasons with at least one installed probe
    const installedFieldSeasons = new Set<number>();
    probeAssignments.forEach(pa => {
      const status = pa.probe_status?.value;
      if (status?.toLowerCase() === 'installed') {
        const fsId = pa.field_season?.[0]?.id;
        if (fsId) installedFieldSeasons.add(fsId);
      }
    });

    // Group active field_seasons by operation
    const opFieldsMap = new Map<number, ReportField[]>();

    fieldSeasons.forEach(fs => {
      const fieldId = fs.field?.[0]?.id;
      if (!fieldId) return;
      if (String(fs.season) !== String(currentYear)) return;
      if (!installedFieldSeasons.has(fs.id)) return;

      const opId = fieldToOperation.get(fieldId);
      if (!opId) return;

      const field = fieldMap.get(fieldId);
      if (!field) return;

      if (!opFieldsMap.has(opId)) opFieldsMap.set(opId, []);
      opFieldsMap.get(opId)!.push({
        fieldSeasonId: fs.id,
        fieldId: field.id,
        fieldName: field.name || 'Unknown',
        crop: fs.crop?.value || '',
        acres: field.acres || 0,
      });
    });

    const operationGroups: OperationGroup[] = [];
    for (const [opId, fields] of opFieldsMap) {
      operationGroups.push({
        id: opId,
        name: operationMap.get(opId) || 'Unknown',
        fields: fields.sort((a, b) => a.fieldName.localeCompare(b.fieldName)),
      });
    }
    operationGroups.sort((a, b) => a.name.localeCompare(b.name));

    // Process water recs
    const fieldSeasonMap = new Map(fieldSeasons.map(fs => [fs.id, fs]));
    const processedRecs: WaterRecRecord[] = waterRecs.map(wr => {
      const fsId = wr.field_season?.[0]?.id || 0;
      return {
        id: wr.id,
        fieldSeasonId: fsId,
        date: wr.date || '',
        recommendation: wr.recommendation || '',
        suggestedWaterDay: wr.suggested_water_day?.value || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        priority: !!(wr as any).priority,
      };
    });

    // Also build a fieldSeasonId → operation mapping for water rec filtering
    const fsToOperation = new Map<number, number>();
    fieldSeasons.forEach(fs => {
      const fieldId = fs.field?.[0]?.id;
      if (fieldId) {
        const opId = fieldToOperation.get(fieldId);
        if (opId) fsToOperation.set(fs.id, opId);
      }
    });

    // Build fieldSeasonId → fieldName mapping for water recs display
    const fsToFieldName = new Map<number, string>();
    fieldSeasons.forEach(fs => {
      const fieldId = fs.field?.[0]?.id;
      if (fieldId) {
        const field = fieldMap.get(fieldId);
        if (field) fsToFieldName.set(fs.id, field.name || 'Unknown');
      }
    });

    return (
      <WaterRecsClient
        operations={operationGroups}
        waterRecs={processedRecs}
        currentSeason={currentYear}
        fsToOperation={Object.fromEntries(fsToOperation)}
        fsToFieldName={Object.fromEntries(fsToFieldName)}
        waterDayOptions={waterDayOptions}
      />
    );
  } catch (error) {
    console.error('Error loading reports page:', error);
    return (
      <WaterRecsClient
        operations={[]}
        waterRecs={[]}
        currentSeason={currentYear}
        fsToOperation={{}}
        fsToFieldName={{}}
        waterDayOptions={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']}
      />
    );
  }
}
