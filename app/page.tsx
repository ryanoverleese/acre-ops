import { getOperations, getFields, getProbes, getRepairs } from '@/lib/baserow';

async function DashboardStats() {
  try {
    const [operations, fields, probes, repairs] = await Promise.all([
      getOperations(),
      getFields(),
      getProbes(),
      getRepairs(),
    ]);

    const needsRepair = repairs.filter(r => r.Status !== 'Completed').length;

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filter
            </button>
            <button className="btn btn-secondary">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Export
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {operations.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No operations found. Add some in Baserow.
                </td>
              </tr>
            ) : (
              operations.map((op) => (
                <tr key={op.id}>
                  <td>
                    <div className="operation-name">{op.Name}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {op.Notes || '—'}
                    </span>
                  </td>
                  <td>
                    <button className="action-btn">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  } catch (error) {
    return (
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Operations Overview</h3>
        </div>
        <div className="loading">
          <div className="loading-spinner"></div>
          Unable to load operations. Check your Baserow connection.
        </div>
      </div>
    );
  }
}

export default function Dashboard() {
  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Dashboard</h2>
          <span className="season-badge">2025 Season</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search operations, fields, probes..." />
          </div>
          <button className="btn btn-primary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Install
          </button>
        </div>
      </header>

      <div className="content">
        <DashboardStats />
        <OperationsTable />
      </div>
    </>
  );
}
