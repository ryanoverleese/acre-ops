import { getOperations, getFields, getProbes, getRepairs } from '@/lib/baserow';

async function DashboardStats() {
  try {
    const [operations, fields, probes, repairs] = await Promise.all([
      getOperations(),
      getFields(),
      getProbes(),
      getRepairs(),
    ]);

    const needsRepair = repairs.filter(r => r.repaired_at === null || r.repaired_at === undefined).length;

    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Operations</div>
          <div className="stat-value green">{operations.length}</div>
          <div className="stat-change">Active operations</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Fields</div>
          <div className="stat-value blue">{fields.length}</div>
          <div className="stat-change">Fields with probe data</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Probes</div>
          <div className="stat-value amber">{probes.length}</div>
          <div className="stat-change">In inventory</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Needs Repair</div>
          <div className="stat-value red">{needsRepair}</div>
          <div className="stat-change">Active repairs</div>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Operations</div>
          <div className="stat-value green">—</div>
          <div className="stat-change">Loading...</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Fields</div>
          <div className="stat-value blue">—</div>
          <div className="stat-change">Loading...</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Probes</div>
          <div className="stat-value amber">—</div>
          <div className="stat-change">Loading...</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Needs Repair</div>
          <div className="stat-value red">—</div>
          <div className="stat-change">Loading...</div>
        </div>
      </div>
    );
  }
}

async function OperationsTable() {
  try {
    const operations = await getOperations();

    return (
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Operations Overview</h3>
          <div className="table-actions">
            <button className="btn btn-secondary">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="rou
