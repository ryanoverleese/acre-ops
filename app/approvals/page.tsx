import {
  getOperations,
  getFields,
  getFieldSeasons,
  getProbeAssignments,
  getProbes,
  getContacts,
} from '@/lib/baserow';
import ApprovalsClient from './ApprovalsClient';

export const dynamic = 'force-dynamic';

export interface ApprovalItem {
  id: number;
  operationId: number;
  operationName: string;
  fieldId: number;
  fieldName: string;
  fieldSeasonId: number;
  probeNumber: number;
  label: string;
  probeSerial?: string;
  placementLat?: number;
  placementLng?: number;
  placementNotes?: string;
  crop: string;
  serviceType: string;
  approvalStatus: string;
  approvalNotes?: string;
  approvalDate?: string;
  season: number;
}

interface OperationSummary {
  id: number;
  name: string;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  total: number;
}

export interface EnrolledOperation {
  id: number;
  name: string;
  fieldCount: number;
  seasons: number[];
}

interface ApprovalsData {
  items: ApprovalItem[];
  operationSummaries: OperationSummary[];
  availableSeasons: number[];
  enrolledOperations: EnrolledOperation[];
}

async function getApprovalsData(): Promise<ApprovalsData> {
  try {
    const [operations, fields, fieldSeasons, probeAssignments, probes, contacts] = await Promise.all([
      getOperations(),
      getFields(),
      getFieldSeasons(),
      getProbeAssignments(),
      getProbes(),
      getContacts(),
    ]);

    const probeMap = new Map(probes.map((p) => [p.id, p.serial_number || 'Unknown']));
    const fieldMap = new Map(fields.map((f) => [f.id, f]));
    const fieldSeasonMap = new Map(fieldSeasons.map((fs) => [fs.id, fs]));

    // Build operation -> billing entity mapping through contacts
    const operationBillingEntities = new Map<number, Set<number>>();
    contacts.forEach((contact) => {
      contact.operations?.forEach((op) => {
        if (!operationBillingEntities.has(op.id)) {
          operationBillingEntities.set(op.id, new Set());
        }
        contact.billing_entity?.forEach((be) => {
          operationBillingEntities.get(op.id)!.add(be.id);
        });
      });
    });

    // Build field -> operation mapping
    const fieldToOperation = new Map<number, { id: number; name: string }>();
    fields.forEach((field) => {
      const beId = field.billing_entity?.[0]?.id;
      if (beId) {
        for (const [opId, beIds] of operationBillingEntities) {
          if (beIds.has(beId)) {
            const op = operations.find((o) => o.id === opId);
            if (op) {
              fieldToOperation.set(field.id, { id: op.id, name: op.name });
            }
            break;
          }
        }
      }
    });

    // Collect available seasons
    const seasons = new Set<number>();
    fieldSeasons.forEach((fs) => {
      if (fs.season) {
        seasons.add(Number(fs.season));
      }
    });

    // Build approval items from probe assignments
    const items: ApprovalItem[] = probeAssignments
      .map((pa): ApprovalItem | null => {
        const fieldSeason = pa.field_season?.[0]?.id
          ? fieldSeasonMap.get(pa.field_season[0].id)
          : null;
        if (!fieldSeason) return null;

        const field = fieldSeason.field?.[0]?.id
          ? fieldMap.get(fieldSeason.field[0].id)
          : null;
        if (!field) return null;

        const operation = fieldToOperation.get(field.id);
        if (!operation) return null;

        const probeSerial = pa.probe?.[0]?.id
          ? probeMap.get(pa.probe[0].id)
          : undefined;

        return {
          id: pa.id,
          operationId: operation.id,
          operationName: operation.name,
          fieldId: field.id,
          fieldName: field.name,
          fieldSeasonId: fieldSeason.id,
          probeNumber: pa.probe_number || 1,
          label: pa.label || '',
          probeSerial,
          placementLat: pa.placement_lat,
          placementLng: pa.placement_lng,
          placementNotes: pa.placement_notes,
          crop: fieldSeason.crop?.value || 'Not Set',
          serviceType: fieldSeason.service_type?.[0]?.value || 'Not Set',
          approvalStatus: pa.approval_status?.value || 'Pending',
          approvalNotes: pa.approval_notes,
          approvalDate: pa.approval_date,
          season: Number(fieldSeason.season),
        };
      })
      .filter((item): item is ApprovalItem => item !== null);

    // Build operation summaries
    const operationStats = new Map<number, OperationSummary>();
    items.forEach((item) => {
      if (!operationStats.has(item.operationId)) {
        operationStats.set(item.operationId, {
          id: item.operationId,
          name: item.operationName,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          total: 0,
        });
      }
      const stats = operationStats.get(item.operationId)!;
      stats.total++;
      if (item.approvalStatus === 'Pending') stats.pendingCount++;
      else if (item.approvalStatus === 'Approved') stats.approvedCount++;
      else if (item.approvalStatus === 'Change Requested' || item.approvalStatus === 'Rejected') stats.rejectedCount++;
    });

    const operationSummaries = Array.from(operationStats.values())
      .sort((a, b) => b.pendingCount - a.pendingCount || a.name.localeCompare(b.name));

    // Build enrolled operations: operations that have field_seasons regardless of probes
    const enrolledOpsMap = new Map<number, { name: string; fieldIds: Set<number>; seasons: Set<number> }>();
    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      if (!fieldId) return;
      const operation = fieldToOperation.get(fieldId);
      if (!operation) return;
      const seasonNum = Number(fs.season);
      if (!seasonNum) return;

      if (!enrolledOpsMap.has(operation.id)) {
        enrolledOpsMap.set(operation.id, { name: operation.name, fieldIds: new Set(), seasons: new Set() });
      }
      const entry = enrolledOpsMap.get(operation.id)!;
      entry.seasons.add(seasonNum);
      // Count unique fields per operation (not field_seasons)
      entry.fieldIds.add(fieldId);
    });

    const enrolledOperations: EnrolledOperation[] = Array.from(enrolledOpsMap.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        fieldCount: data.fieldIds.size,
        seasons: Array.from(data.seasons).sort((a, b) => b - a),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      items,
      operationSummaries,
      availableSeasons: Array.from(seasons).sort((a, b) => b - a),
      enrolledOperations,
    };
  } catch (error) {
    console.error('Error fetching approvals data:', error);
    return { items: [], operationSummaries: [], availableSeasons: [], enrolledOperations: [] };
  }
}

export default async function ApprovalsPage() {
  const { items, operationSummaries, availableSeasons, enrolledOperations } = await getApprovalsData();

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Approvals</h2>
        </div>
      </header>

      <div className="content">
        <ApprovalsClient
          items={items}
          operationSummaries={operationSummaries}
          availableSeasons={availableSeasons}
          enrolledOperations={enrolledOperations}
        />
      </div>
    </>
  );
}
