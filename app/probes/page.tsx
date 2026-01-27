import { getProbes, getOperations } from '@/lib/baserow';

interface ProcessedProbe {
  id: number;
  serialNumber: string;
  brand: string;
  status: string;
  rackLocation: string;
  ownerOperation: string;
  yearNew?: number;
  notes?: string;
}

async function getProbesData(): Promise<{
  probes: ProcessedProbe[];
  statusCounts: Record<string, number>;
}> {
  try {
    const [probes, operations] = await Promise.all([
      getProbes(),
      getOperations(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    const processedProbes: ProcessedProbe[] = probes.map((probe) => {
      const ownerLink = probe.owner_operation?.[0];
      return {
        id: probe.id,
        serialNumber: probe.serial_number || 'Unknown',
        brand: probe.brand?.value || 'Unknown',
        status: probe.status?.value || 'Unknown',
        rackLocation: probe.rack_location || '—',
        ownerOperation: ownerLink ? operationMap.get(ownerLink.id) || ownerLink.value : '—',
        yearNew: probe.year_new,
        notes: probe.notes,
      };
    });

    const statusCounts: Record<string, number> = {
      all: processedProbes.length,
    };
    processedProbes.forEach((p) => {
      const status = p.status.toLowerCase().replace(' ', '-');
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return { probes: processedProbes, statusCounts };
  } catch (error) {
    console.error('Error fetching probes data:', error);
    return { probes: [], statusCounts: { all: 0 } };
  }
}

export default async function ProbesPage() {
  const { probes, statusCounts } = await getProbesData();

  const getBrandBadge = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('sentek')) {
      return <span className="brand-badge sentek">{brand}</span>;
    }
    if (brandLower.includes('cropx')) {
      return <span className="brand-badge cropx">{brand}</span>;
    }
    return <span className="brand-badge">{brand}</span>;
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    let className = 'status-badge ';
    if (statusLower === 'in stock' || statusLower === 'in-stock') {
      className += 'in-stock';
    } else if (statusLower === 'deployed' || statusLower === 'installed') {
      className += 'installed';
    } else if (statusLower === 'repair' || statusLower === 'needs repair') {
      className += 'repair';
    } else {
      className += 'pending';
    }
    return (
      <span className={className}>
        <span className="status-dot"></span>
        {status}
      </span>
    );
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Probe Inventory</h2>
          <span className="season-badge">{statusCounts.all} Total</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search by serial number..." />
          </div>
          <button className="btn btn-primary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Probe
          </button>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">Total Probes</div>
            <div className="stat-value blue">{statusCounts.all || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">In Stock</div>
            <div className="stat-value green">{statusCounts['in-stock'] || statusCounts['in stock'] || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Deployed</div>
            <div className="stat-value amber">{statusCounts['deployed'] || statusCounts['installed'] || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Needs Repair</div>
            <div className="stat-value red">{statusCounts['repair'] || statusCounts['needs-repair'] || 0}</div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">All Probes</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Brand</th>
                <th>Status</th>
                <th>Rack Location</th>
                <th>Owner Operation</th>
                <th>Year New</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {probes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No probes found.
                  </td>
                </tr>
              ) : (
                probes.map((probe) => (
                  <tr key={probe.id}>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                      #{probe.serialNumber}
                    </td>
                    <td>{getBrandBadge(probe.brand)}</td>
                    <td>{getStatusBadge(probe.status)}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>
                      {probe.rackLocation}
                    </td>
                    <td style={{ fontSize: '13px' }}>{probe.ownerOperation}</td>
                    <td className="field-count">{probe.yearNew || '—'}</td>
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
