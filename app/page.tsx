import { getOperations, getFields, getProbes, getRepairs } from '@/lib/baserow';
import DashboardClient, { DashboardStats, DashboardOperation } from './DashboardClient';

async function getDashboardData(): Promise<{ stats: DashboardStats; operations: DashboardOperation[] }> {
  try {
    const [operations, fields, probes, repairs] = await Promise.all([
      getOperations(),
      getFields(),
      getProbes(),
      getRepairs(),
    ]);

    const needsRepair = repairs.filter((r) => r.repaired_at === null || r.repaired_at === undefined).length;

    const stats: DashboardStats = {
      operationsCount: operations.length,
      fieldsCount: fields.length,
      probesCount: probes.length,
      repairsCount: needsRepair,
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
      stats: { operationsCount: 0, fieldsCount: 0, probesCount: 0, repairsCount: 0 },
      operations: [],
    };
  }
}

export default async function Dashboard() {
  const { stats, operations } = await getDashboardData();
  return <DashboardClient stats={stats} operations={operations} />;
}
