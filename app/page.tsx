import { getOperations, getFields, getProbes, getRepairs, getFieldSeasons } from '@/lib/baserow';
import DashboardClient, { DashboardStats, DashboardOperation } from './DashboardClient';

async function getDashboardData(): Promise<{ stats: DashboardStats; operations: DashboardOperation[] }> {
  try {
    const [operations, fields, probes, repairs, fieldSeasons] = await Promise.all([
      getOperations(),
      getFields(),
      getProbes(),
      getRepairs(),
      getFieldSeasons(),
    ]);

    const needsRepair = repairs.filter((r) => r.repaired_at === null || r.repaired_at === undefined).length;

    // Calculate install stats for current season (2026)
    const currentSeasonRecords = fieldSeasons.filter(fs => fs.season === 2026);
    const installedCount = currentSeasonRecords.filter(fs =>
      fs.probe_status?.value?.toLowerCase() === 'installed'
    ).length;
    const assignedCount = currentSeasonRecords.filter(fs =>
      fs.probe_status?.value?.toLowerCase() === 'assigned'
    ).length;
    const unassignedCount = currentSeasonRecords.filter(fs =>
      !fs.probe_status?.value || fs.probe_status?.value?.toLowerCase() === 'unassigned'
    ).length;

    const stats: DashboardStats = {
      operationsCount: operations.length,
      fieldsCount: fields.length,
      probesCount: probes.length,
      repairsCount: needsRepair,
      installedCount,
      assignedCount,
      unassignedCount,
    };

    const dashboardOperations: DashboardOperation[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
      notes: op.notes,
    }));

    return { stats, operations: dashboardOperations };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return {
      stats: {
        operationsCount: 0,
        fieldsCount: 0,
        probesCount: 0,
        repairsCount: 0,
        installedCount: 0,
        assignedCount: 0,
        unassignedCount: 0,
      },
      operations: [],
    };
  }
}

export default async function Dashboard() {
  const { stats, operations } = await getDashboardData();
  return <DashboardClient stats={stats} operations={operations} />;
}
