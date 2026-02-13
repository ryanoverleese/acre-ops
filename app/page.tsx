import { getRepairs, getFieldSeasons, getProbeAssignments, getOrders, getBillingEntities } from '@/lib/baserow';
import DashboardClient, { DashboardStats, DashboardRepair, DashboardOrder } from './DashboardClient';

async function getDashboardData(): Promise<{ stats: DashboardStats; openRepairs: DashboardRepair[]; recentOrders: DashboardOrder[] }> {
  try {
    const [repairs, fieldSeasons, probeAssignments, orders, billingEntities] = await Promise.all([
      getRepairs(),
      getFieldSeasons(),
      getProbeAssignments(),
      getOrders(),
      getBillingEntities(),
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

    return { stats, openRepairs, recentOrders };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return {
      stats: { installedCount: 0, assignedCount: 0, unassignedCount: 0, totalAssignments: 0 },
      openRepairs: [],
      recentOrders: [],
    };
  }
}

export default async function Dashboard() {
  const { stats, openRepairs, recentOrders } = await getDashboardData();
  return <DashboardClient stats={stats} openRepairs={openRepairs} recentOrders={recentOrders} />;
}
