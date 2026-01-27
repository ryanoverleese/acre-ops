import { getFields, getFieldSeasons, getProbes, getBillingEntities, getOperations } from '@/lib/baserow';

interface PendingInstall {
  id: number;
  fieldName: string;
  operation: string;
  acres: number;
  crop: string;
  probeSerial: string;
  lat: number;
  lng: number;
  status: string;
}

async function getPendingInstalls(): Promise<PendingInstall[]> {
  try {
    const [fields, fieldSeasons, probes, billingEntities, operations] = await Promise.all([
      getFields(),
      getFieldSeasons(),
      getProbes(),
      getBillingEntities(),
      getOperations(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const probeMap = new Map(probes.map((p) => [p.id, p.serial_number]));

    // Map billing entity to operation
    const billingToOperationMap = new Map<number, number>();
    billingEntities.forEach((be) => {
      if (be.operation?.[0]?.id) {
        billingToOperationMap.set(be.id, be.operation[0].id);
      }
    });

    // Find field seasons that are pending/assigned (not installed)
    const pendingSeasons = fieldSeasons.filter((fs) => {
      const status = fs.probe_status?.value?.toLowerCase() || '';
      return (
        (status === 'assigned' || status === 'pending' || status === '') &&
        fs.probe?.[0] && // Has a probe assigned
        !fs.install_date // Not yet installed
      );
    });

    const pendingInstalls: PendingInstall[] = pendingSeasons.map((fs) => {
      const fieldLink = fs.field?.[0];
      const field = fields.find((f) => f.id === fieldLink?.id);
      const probeLink = fs.probe?.[0];

      let operationName = 'Unknown';
      if (field?.billing_entity?.[0]) {
        const opId = billingToOperationMap.get(field.billing_entity[0].id);
        if (opId) {
          operationName = operationMap.get(opId) || 'Unknown';
        }
      }

      return {
        id: fs.id,
        fieldName: field?.name || fieldLink?.value || 'Unknown Field',
        operation: operationName,
        acres: field?.acres || 0,
        crop: fs.crop?.value || 'Unknown',
        probeSerial: probeLink ? probeMap.get(probeLink.id) || probeLink.value : 'Unknown',
        lat: field?.lat || 0,
        lng: field?.lng || 0,
        status: fs.probe_status?.value || 'Pending',
      };
    }).filter((install) => install.lat !== 0 && install.lng !== 0);

    return pendingInstalls;
  } catch (error) {
    console.error('Error fetching pending installs:', error);
    return [];
  }
}

export default async function RoutePage() {
  const pendingInstalls = await getPendingInstalls();

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Today&apos;s Route</h2>
          <span className="season-badge">{pendingInstalls.length} Stops</span>
        </div>
        <div className="header-right">
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{today}</span>
        </div>
      </header>

      <div className="content">
        <div className="route-list">
          {pendingInstalls.length === 0 ? (
            <div className="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 48, height: 48, color: 'var(--text-muted)', marginBottom: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>All caught up!</h3>
              <p style={{ color: 'var(--text-muted)' }}>No pending installs for today.</p>
            </div>
          ) : (
            pendingInstalls.map((install, index) => (
              <div key={install.id} className="route-card">
                <div className="route-card-header">
                  <div className="route-number">{index + 1}</div>
                  <div className="route-field-info">
                    <h3 className="route-field-name">{install.fieldName}</h3>
                    <p className="route-operation">{install.operation} • {install.acres} ac</p>
                  </div>
                  <div className="route-crop">
                    <span className={`crop-badge ${install.crop.toLowerCase()}`}>{install.crop}</span>
                  </div>
                </div>
                <div className="route-card-body">
                  <div className="route-detail">
                    <span className="route-label">Probe</span>
                    <span className="route-value" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      #{install.probeSerial}
                    </span>
                  </div>
                  <div className="route-detail">
                    <span className="route-label">Status</span>
                    <span className="status-badge pending">
                      <span className="status-dot"></span>
                      {install.status}
                    </span>
                  </div>
                </div>
                <div className="route-card-footer">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${install.lat},${install.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Navigate
                  </a>
                  <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Mark Complete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
