import { getRepairs, getFieldSeasons, getFields, getBillingEntities, getOperations } from '@/lib/baserow';

interface ProcessedRepair {
  id: number;
  fieldName: string;
  operation: string;
  reportedAt: string;
  problem: string;
  fix?: string;
  repairedAt?: string;
  notifiedCustomer: boolean;
  status: 'open' | 'resolved';
}

async function getRepairsData(): Promise<ProcessedRepair[]> {
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

    return repairs.map((repair) => {
      const fsLink = repair.field_season?.[0];
      const fieldSeason = fsLink ? fieldSeasonMap.get(fsLink.id) : null;
      const fieldLink = fieldSeason?.field?.[0];
      const field = fieldLink ? fieldMap.get(fieldLink.id) : null;

      let operationName = 'Unknown';
      if (field?.billing_entity?.[0]) {
        const opId = billingToOperationMap.get(field.billing_entity[0].id);
        if (opId) {
          operationName = operationMap.get(opId) || 'Unknown';
        }
      }

      return {
        id: repair.id,
        fieldName: field?.name || fsLink?.value || 'Unknown Field',
        operation: operationName,
        reportedAt: repair.reported_at || '',
        problem: repair.problem || 'No description',
        fix: repair.fix,
        repairedAt: repair.repaired_at,
        notifiedCustomer: repair.notified_customer || false,
        status: repair.repaired_at ? 'resolved' as const : 'open' as const,
      };
    }).sort((a, b) => {
      // Open repairs first, then by reported date
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime();
    });
  } catch (error) {
    console.error('Error fetching repairs data:', error);
    return [];
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default async function RepairsPage() {
  const repairs = await getRepairsData();
  const openCount = repairs.filter((r) => r.status === 'open').length;
  const resolvedCount = repairs.filter((r) => r.status === 'resolved').length;

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Repairs</h2>
          <span className="season-badge" style={{ background: 'var(--accent-red-dim)', color: 'var(--accent-red)' }}>
            {openCount} Open
          </span>
        </div>
        <div className="header-right">
          <button className="btn btn-primary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Report Repair
          </button>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">Total Repairs</div>
            <div className="stat-value blue">{repairs.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open</div>
            <div className="stat-value red">{openCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Resolved</div>
            <div className="stat-value green">{resolvedCount}</div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">All Repairs</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Field</th>
                <th>Operation</th>
                <th>Problem</th>
                <th>Reported</th>
                <th>Repaired</th>
                <th>Notified</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {repairs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No repairs found.
                  </td>
                </tr>
              ) : (
                repairs.map((repair) => (
                  <tr key={repair.id}>
                    <td>
                      <span className={`status-badge ${repair.status === 'open' ? 'repair' : 'installed'}`}>
                        <span className="status-dot"></span>
                        {repair.status === 'open' ? 'Open' : 'Resolved'}
                      </span>
                    </td>
                    <td className="operation-name">{repair.fieldName}</td>
                    <td style={{ fontSize: '13px' }}>{repair.operation}</td>
                    <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {repair.problem}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {formatDate(repair.reportedAt)}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {formatDate(repair.repairedAt || '')}
                    </td>
                    <td>
                      {repair.notifiedCustomer ? (
                        <svg fill="none" stroke="var(--accent-green)" viewBox="0 0 24 24" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
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
      </div>
    </>
  );
}
