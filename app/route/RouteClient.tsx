'use client';

import { useState } from 'react';

export interface PendingInstall {
  id: number;
  fieldName: string;
  operation: string;
  acres: number;
  crop: string;
  probeSerial: string;
  lat: number;
  lng: number;
  status: string;
  // Irrigation details
  irrigationType?: string;
  rowDirection?: string;
  dripTubingDirection?: string;
  dripTubingSpacing?: number;
  dripEmitterSpacing?: number;
  dripZones?: number;
  dripGpm?: number;
  dripDepth?: number;
  // Location data
  elevation?: string | number;
  soilType?: string;
  placementNotes?: string;
}

interface RouteClientProps {
  pendingInstalls: PendingInstall[];
  today: string;
}

export default function RouteClient({ pendingInstalls, today }: RouteClientProps) {
  const [installs, setInstalls] = useState(pendingInstalls);
  const [completing, setCompleting] = useState<number | null>(null);

  const handleMarkComplete = async (install: PendingInstall) => {
    if (!confirm(`Mark "${install.fieldName}" as installed?`)) return;

    setCompleting(install.id);
    try {
      const response = await fetch(`/api/field-seasons/${install.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          probe_status: 'Installed',
          install_date: new Date().toISOString().split('T')[0],
        }),
      });

      if (response.ok) {
        setInstalls(installs.filter((i) => i.id !== install.id));
      } else {
        alert('Failed to mark as complete');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to mark as complete');
    } finally {
      setCompleting(null);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Today&apos;s Route</h2>
          <span className="season-badge">{installs.length} Stops</span>
        </div>
        <div className="header-right">
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{today}</span>
        </div>
      </header>

      <div className="content">
        <div className="route-list">
          {installs.length === 0 ? (
            <div className="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 48, height: 48, color: 'var(--text-muted)', marginBottom: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>All caught up!</h3>
              <p style={{ color: 'var(--text-muted)' }}>No pending installs for today.</p>
            </div>
          ) : (
            installs.map((install, index) => (
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
                  {install.irrigationType && (
                    <div className="route-detail">
                      <span className="route-label">Irrigation</span>
                      <span className="route-value">{install.irrigationType}</span>
                    </div>
                  )}
                  {install.rowDirection && (
                    <div className="route-detail">
                      <span className="route-label">Row Dir.</span>
                      <span className="route-value">{install.rowDirection}</span>
                    </div>
                  )}
                </div>
                {/* Drip details - only show for drip irrigation */}
                {install.irrigationType === 'Drip' && (
                  <div className="route-card-body" style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '8px' }}>
                    <div className="route-detail">
                      <span className="route-label">Tubing Dir.</span>
                      <span className="route-value">{install.dripTubingDirection || '—'}</span>
                    </div>
                    <div className="route-detail">
                      <span className="route-label">Tube/Emitter</span>
                      <span className="route-value">
                        {install.dripTubingSpacing ? `${install.dripTubingSpacing}"` : '—'} / {install.dripEmitterSpacing ? `${install.dripEmitterSpacing}"` : '—'}
                      </span>
                    </div>
                    <div className="route-detail">
                      <span className="route-label">Zones</span>
                      <span className="route-value">{install.dripZones || '—'}</span>
                    </div>
                    <div className="route-detail">
                      <span className="route-label">GPM</span>
                      <span className="route-value">{install.dripGpm || '—'}</span>
                    </div>
                    <div className="route-detail">
                      <span className="route-label">Depth</span>
                      <span className="route-value">{install.dripDepth ? `${install.dripDepth}"` : '—'}</span>
                    </div>
                  </div>
                )}
                {/* Placement notes - only show if present */}
                {install.placementNotes && (
                  <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                    <span className="route-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Placement Notes</span>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>{install.placementNotes}</p>
                  </div>
                )}
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
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => handleMarkComplete(install)}
                    disabled={completing === install.id}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {completing === install.id ? 'Completing...' : 'Mark Complete'}
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
