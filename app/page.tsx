import { getCachedRows, type Repair, type FieldSeason, type ProbeAssignment, type Order, type BillingEntity, type Probe, type Field, type Contact, type Operation } from '@/lib/baserow';
import { buildOperationMap, buildBillingToOperationMaps } from '@/lib/data-mappings';
import DashboardClient, { DashboardStats, DashboardRepair, DashboardOrder, DashboardInstalledProbe, DashboardBooking } from './DashboardClient';

// Revalidate dashboard data every 2 minutes instead of force-dynamic
export const revalidate = 120;

async function getDashboardData(): Promise<{ stats: DashboardStats; openRepairs: DashboardRepair[]; recentOrders: DashboardOrder[]; installedProbes: DashboardInstalledProbe[]; bookings: DashboardBooking[] }> {
  try {
    const [repairs, fieldSeasons, probeAssignments, orders, billingEntities, probes, fields, contacts, operations] = await Promise.all([
      getCachedRows<Repair>('repairs', undefined, 120),
      getCachedRows<FieldSeason>('field_seasons', undefined, 120),
      getCachedRows<ProbeAssignment>('probe_assignments', undefined, 120),
      getCachedRows<Order>('orders', undefined, 120),
      getCachedRows<BillingEntity>('billing_entities', undefined, 300),
      getCachedRows<Probe>('probes', undefined, 120),
      getCachedRows<Field>('fields', undefined, 300),
      getCachedRows<Contact>('contacts', undefined, 300),
      getCachedRows<Operation>('operations', undefined, 300),
    ]);

    // Calculate install stats from probe_assignments for current season
    const currentSeasonFsIds = new Set(
      fieldSeasons.filter(fs => fs.season == 2026).map(fs => fs.id)
    );
    const currentSeasonAssignments = probeAssignments.filter(pa => {
      const fsId = pa.field_season?.[0]?.id;
      return fsId && currentSeasonFsIds.has(fsId);
    });
    const installedCount = currentSeasonAssignments.filter(pa =>
      pa.probe_status?.value?.toLowerCase() === 'installed'
    ).length;
    const assignedCount = currentSeasonAssignments.filter(pa =>
      pa.probe_status?.value?.toLowerCase() === 'assigned'
    ).length;
    const unassignedCount = currentSeasonAssignments.filter(pa =>
      !pa.probe_status?.value || pa.probe_status?.value?.toLowerCase() === 'unassigned'
    ).length;
    const totalAssignments = installedCount + assignedCount + unassignedCount;

    // Build installed probes list
    const probeMap = new Map(probes.map((p) => [p.id, p]));
    const installedProbes: DashboardInstalledProbe[] = currentSeasonAssignments
      .filter(pa => pa.probe_status?.value?.toLowerCase() === 'installed')
      .map((pa) => {
        const fsId = pa.field_season?.[0]?.id;
        const fs = fsId ? fieldSeasons.find(f => f.id === fsId) : null;
        const fieldName = fs?.field?.[0]?.value || 'Unknown Field';
        const probeId = pa.probe?.[0]?.id;
        const probe = probeId ? probeMap.get(probeId) : null;
        return {
          id: pa.id,
          fieldName,
          probeSerial: probe?.serial_number || '—',
          installDate: pa.install_date || '',
          installer: pa.installer || '',
        };
      })
      .sort((a, b) => (b.installDate || '').localeCompare(a.installDate || ''));

    // Build field_season id → field name map
    const fsFieldNameMap = new Map<number, string>();
    fieldSeasons.forEach((fs) => {
      const fieldName = fs.field?.[0]?.value || 'Unknown Field';
      fsFieldNameMap.set(fs.id, fieldName);
    });

    // Open repairs with resolved field names
    const openRepairs: DashboardRepair[] = repairs
      .filter((r) => !r.repaired_at)
      .map((r) => {
        const fsId = r.field_season?.[0]?.id;
        return {
          id: r.id,
          fieldName: (fsId && fsFieldNameMap.get(fsId)) || r.field_season?.[0]?.value || 'Unknown',
          problem: r.problem || '',
          reportedAt: r.reported_at || '',
        };
      })
      .sort((a, b) => (a.reportedAt || '').localeCompare(b.reportedAt || ''));

    // Recent orders with resolved billing entity names
    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name || '']));

    const recentOrders: DashboardOrder[] = orders
      .filter((o) => o.order_date)
      .sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''))
      .slice(0, 5)
      .map((o) => ({
        id: o.id,
        customerName: o.billing_entity?.[0]?.value || billingEntityMap.get(o.billing_entity?.[0]?.id || 0) || 'Unknown',
        orderDate: o.order_date || '',
        status: o.status?.value || '',
        total: o.total || '',
      }));

    const stats: DashboardStats = {
      installedCount,
      assignedCount,
      unassignedCount,
      totalAssignments,
    };

    // Build operation booking tracker
    const operationMap = buildOperationMap(operations);
    const { billingToOperationMap } = buildBillingToOperationMaps(contacts, operationMap);
    const fieldMap = new Map(fields.map(f => [f.id, f]));

    // For each field_season, resolve to operation and track by season
    const opFields2025 = new Map<number, Set<number>>(); // opId → set of field IDs
    const opFields2026 = new Map<number, Set<number>>();

    for (const fs of fieldSeasons) {
      if (fs.season !== 2025 && fs.season !== 2026) continue;
      const fieldId = fs.field?.[0]?.id;
      if (!fieldId) continue;
      const field = fieldMap.get(fieldId);
      const beId = field?.billing_entity?.[0]?.id;
      if (!beId) continue;
      const opId = billingToOperationMap.get(beId);
      if (!opId) continue;

      const bucket = fs.season === 2025 ? opFields2025 : opFields2026;
      if (!bucket.has(opId)) bucket.set(opId, new Set());
      bucket.get(opId)!.add(fieldId);
    }

    // Collect all operation IDs that appear in either year
    const allOpIds = new Set([...opFields2025.keys(), ...opFields2026.keys()]);
    const bookings: DashboardBooking[] = [];

    for (const opId of allOpIds) {
      const count2025 = opFields2025.get(opId)?.size || 0;
      const count2026 = opFields2026.get(opId)?.size || 0;
      let status: DashboardBooking['status'];
      if (count2025 > 0 && count2026 > 0) status = 'returning';
      else if (count2025 > 0) status = 'still-to-go';
      else status = 'new';

      bookings.push({
        operationName: operationMap.get(opId) || 'Unknown',
        fields2025: count2025,
        fields2026: count2026,
        status,
      });
    }

    // Sort: still-to-go first, then new, then returning
    const statusOrder = { 'still-to-go': 0, 'new': 1, 'returning': 2 };
    bookings.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.operationName.localeCompare(b.operationName));

    return { stats, openRepairs, recentOrders, installedProbes, bookings };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return {
      stats: { installedCount: 0, assignedCount: 0, unassignedCount: 0, totalAssignments: 0 },
      openRepairs: [],
      recentOrders: [],
      installedProbes: [],
      bookings: [],
    };
  }
}

export default async function Dashboard() {
  const { stats, openRepairs, recentOrders, installedProbes, bookings } = await getDashboardData();
  return <DashboardClient stats={stats} openRepairs={openRepairs} recentOrders={recentOrders} installedProbes={installedProbes} bookings={bookings} />;
}
