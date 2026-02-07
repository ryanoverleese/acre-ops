'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ApprovalField, ApprovalProbeAssignment } from './page';

// Dynamically import map component
const ApprovalMap = dynamic(() => import('./ApprovalMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)' }}>
      <div className="loading">Loading map...</div>
    </div>
  ),
});

interface ApprovalClientProps {
  operationName: string;
  season: number;
  fields: ApprovalField[];
  probeAssignments?: ApprovalProbeAssignment[];
}

export default function ApprovalClient({ operationName, season, fields: initialFields, probeAssignments: initialProbeAssignments = [] }: ApprovalClientProps) {
  const [fields, setFields] = useState(initialFields);
  const [probeAssignments, setProbeAssignments] = useState(initialProbeAssignments);
  const [changeNotes, setChangeNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  // Use probe assignments if available, otherwise fall back to fields
  const hasProbeAssignments = probeAssignments.length > 0;

  // Group probe assignments by field
  const groupedProbeAssignments = useMemo(() => {
    const groups: Record<string, ApprovalProbeAssignment[]> = {};
    probeAssignments.forEach((pa) => {
      if (!groups[pa.fieldName]) {
        groups[pa.fieldName] = [];
      }
      groups[pa.fieldName].push(pa);
    });
    return groups;
  }, [probeAssignments]);

  const approvedCount = hasProbeAssignments
    ? probeAssignments.filter((pa) => pa.approvalStatus === 'Approved').length
    : fields.filter((f) => f.approvalStatus === 'Approved').length;
  const totalCount = hasProbeAssignments ? probeAssignments.length : fields.length;
  const pendingCount = hasProbeAssignments
    ? probeAssignments.filter((pa) => pa.approvalStatus === 'Pending').length
    : fields.filter((f) => f.approvalStatus === 'Pending').length;
  const changeRequestedCount = hasProbeAssignments
    ? probeAssignments.filter((pa) => pa.approvalStatus === 'Change Requested').length
    : fields.filter((f) => f.approvalStatus === 'Change Requested').length;

  const showSaved = useCallback((key: string) => {
    setSaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [key]: false })), 2000);
  }, []);

  // Auto-save approve for probe assignment
  const handleApproveProbeAssignment = async (probeAssignmentId: number) => {
    const key = `pa-${probeAssignmentId}`;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_status: 'Approved',
          approval_date: new Date().toISOString().split('T')[0],
        }),
      });

      if (response.ok) {
        setProbeAssignments((prev) =>
          prev.map((pa) =>
            pa.id === probeAssignmentId
              ? { ...pa, approvalStatus: 'Approved', approvalDate: new Date().toISOString().split('T')[0] }
              : pa
          )
        );
        showSaved(key);
      }
    } catch {
      // silent fail
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Undo approve - set back to Pending
  const handleUndoApproveProbeAssignment = async (probeAssignmentId: number) => {
    const key = `pa-${probeAssignmentId}`;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: 'Pending', approval_date: '' }),
      });

      if (response.ok) {
        setProbeAssignments((prev) =>
          prev.map((pa) =>
            pa.id === probeAssignmentId
              ? { ...pa, approvalStatus: 'Pending', approvalDate: '' }
              : pa
          )
        );
      }
    } catch {
      // silent fail
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Auto-save change request on blur for probe assignment
  const handleChangeNotesBlur = async (probeAssignmentId: number) => {
    const key = `pa-${probeAssignmentId}`;
    const notes = changeNotes[key]?.trim();
    if (!notes) return; // Don't save empty notes

    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_status: 'Change Requested',
          approval_notes: notes,
        }),
      });

      if (response.ok) {
        setProbeAssignments((prev) =>
          prev.map((pa) =>
            pa.id === probeAssignmentId
              ? { ...pa, approvalStatus: 'Change Requested', approvalNotes: notes }
              : pa
          )
        );
        setChangeNotes((prev) => ({ ...prev, [key]: '' }));
        showSaved(key);
      }
    } catch {
      // silent fail
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Auto-save approve for legacy field
  const handleApprove = async (fieldSeasonId: number) => {
    const key = `fs-${fieldSeasonId}`;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldSeasonId, action: 'approve' }),
      });

      if (response.ok) {
        setFields((prev) =>
          prev.map((f) =>
            f.fieldSeasonId === fieldSeasonId
              ? { ...f, approvalStatus: 'Approved', approvalDate: new Date().toISOString().split('T')[0] }
              : f
          )
        );
        showSaved(key);
      }
    } catch {
      // silent fail
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Undo approve for legacy field
  const handleUndoApprove = async (fieldSeasonId: number) => {
    const key = `fs-${fieldSeasonId}`;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldSeasonId, action: 'approve', undo: true }),
      });

      if (response.ok) {
        setFields((prev) =>
          prev.map((f) =>
            f.fieldSeasonId === fieldSeasonId
              ? { ...f, approvalStatus: 'Pending', approvalDate: '' }
              : f
          )
        );
      }
    } catch {
      // silent fail
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Auto-save change request on blur for legacy field
  const handleFieldChangeNotesBlur = async (fieldSeasonId: number) => {
    const key = `fs-${fieldSeasonId}`;
    const notes = changeNotes[key]?.trim();
    if (!notes) return;

    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldSeasonId, action: 'request_change', notes }),
      });

      if (response.ok) {
        setFields((prev) =>
          prev.map((f) =>
            f.fieldSeasonId === fieldSeasonId
              ? { ...f, approvalStatus: 'Change Requested', approvalNotes: notes }
              : f
          )
        );
        setChangeNotes((prev) => ({ ...prev, [key]: '' }));
        showSaved(key);
      }
    } catch {
      // silent fail
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleBulkApprove = async () => {
    if (hasProbeAssignments) {
      const pendingAssignments = probeAssignments.filter((pa) => pa.approvalStatus === 'Pending');
      if (pendingAssignments.length === 0) return;

      setBulkLoading(true);
      try {
        const approvalDate = new Date().toISOString().split('T')[0];
        await Promise.all(
          pendingAssignments.map((pa) =>
            fetch(`/api/probe-assignments/${pa.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ approval_status: 'Approved', approval_date: approvalDate }),
            })
          )
        );

        setProbeAssignments((prev) =>
          prev.map((pa) =>
            pa.approvalStatus === 'Pending'
              ? { ...pa, approvalStatus: 'Approved', approvalDate }
              : pa
          )
        );
      } catch {
        // silent fail
      } finally {
        setBulkLoading(false);
      }
    } else {
      const pendingFields = fields.filter((f) => f.approvalStatus === 'Pending');
      if (pendingFields.length === 0) return;

      setBulkLoading(true);
      try {
        const response = await fetch('/api/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fieldSeasonIds: pendingFields.map((f) => f.fieldSeasonId),
            action: 'bulk_approve',
          }),
        });

        if (response.ok) {
          setFields((prev) =>
            prev.map((f) =>
              f.approvalStatus === 'Pending'
                ? { ...f, approvalStatus: 'Approved', approvalDate: new Date().toISOString().split('T')[0] }
                : f
            )
          );
        }
      } catch {
        // silent fail
      } finally {
        setBulkLoading(false);
      }
    }
  };

  // Render status area for a card (approve button, approved badge, or change requested)
  const renderStatusActions = (
    status: string,
    key: string,
    approveHandler: () => void,
    undoHandler: () => void,
    blurHandler: () => void,
    approvalDate?: string,
    approvalNotes?: string,
  ) => {
    const isSaving = saving[key];
    const isSaved = saved[key];

    return (
      <div className="card-actions" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Approve / Approved toggle */}
        <button
          onClick={status === 'Approved' ? undoHandler : approveHandler}
          disabled={isSaving}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '12px 24px', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
            borderRadius: 'var(--radius)', border: 'none', width: '100%',
            transition: 'all 0.2s',
            background: status === 'Approved' ? '#16a34a' : status === 'Change Requested' ? 'var(--bg-tertiary)' : '#2563eb',
            color: status === 'Approved' ? '#fff' : status === 'Change Requested' ? 'var(--text-muted)' : '#fff',
            transform: status === 'Approved' ? 'scale(1.02)' : 'none',
            boxShadow: status === 'Approved' ? '0 2px 8px rgba(22,163,74,0.3)' : 'none',
          }}
        >
          {isSaving ? (
            'Saving...'
          ) : status === 'Approved' ? (
            <>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approved{approvalDate ? ` on ${approvalDate}` : ''} (tap to undo)
            </>
          ) : (
            'Approve Location'
          )}
        </button>

        {/* Saved indicator */}
        {isSaved && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#16a34a', fontSize: '13px', fontWeight: 600 }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </div>
        )}

        {/* Change request textarea - always visible for Pending, shows notes for Change Requested */}
        {status === 'Change Requested' && approvalNotes && (
          <div style={{
            background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 'var(--radius)',
            padding: '12px', fontSize: '13px',
          }}>
            <strong style={{ display: 'block', marginBottom: '4px' }}>Change Requested:</strong>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{approvalNotes}</p>
          </div>
        )}

        {(status === 'Pending' || status === 'Change Requested') && (
          <textarea
            placeholder={status === 'Change Requested' ? 'Add additional notes...' : 'Describe the change you\'d like... (saves automatically)'}
            value={changeNotes[key] || ''}
            onChange={(e) => setChangeNotes((prev) => ({ ...prev, [key]: e.target.value }))}
            onBlur={blurHandler}
            style={{
              width: '100%', minHeight: '60px', padding: '10px', fontSize: '14px',
              borderRadius: 'var(--radius)', border: '1px solid var(--border)',
              background: 'var(--bg-secondary)', color: 'var(--text-primary)',
              resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="approval-page">
      <div className="approval-container">
        {/* Header */}
        <header className="approval-header">
          <div className="approval-header-content">
            <h1>{operationName}</h1>
            <p className="approval-subtitle">{season} Season - Probe Placement Approval</p>
          </div>
          <div className="approval-progress">
            <div className="progress-stats">
              <span className="stat approved">{approvedCount} Approved</span>
              <span className="stat pending">{pendingCount} Pending</span>
              {changeRequestedCount > 0 && (
                <span className="stat change-requested">{changeRequestedCount} Changes Requested</span>
              )}
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(approvedCount / totalCount) * 100}%` }}
              />
            </div>
            <p className="progress-text">{approvedCount} of {totalCount} {hasProbeAssignments ? 'probe locations' : 'fields'} approved</p>
          </div>
        </header>

        {/* Bulk Actions */}
        {pendingCount > 0 && (
          <div className="bulk-actions">
            <button
              className="btn btn-primary"
              onClick={handleBulkApprove}
              disabled={bulkLoading}
            >
              {bulkLoading ? 'Approving...' : `Approve All ${pendingCount} Locations`}
            </button>
          </div>
        )}

        {/* Probe Assignments grouped by Field */}
        {hasProbeAssignments ? (
          <div className="approval-fields">
            {Object.entries(groupedProbeAssignments).map(([fieldName, probes]) => (
              <div key={fieldName} className="approval-field-group">
                {probes.map((pa) => {
                  const key = `pa-${pa.id}`;

                  return (
                    <div key={pa.id} className="approval-card expanded" style={{ marginBottom: '16px' }}>
                      {/* Card Header */}
                      <div className="card-header">
                        <div className="card-title">
                          <h3>{fieldName} - Probe {pa.probeNumber}{pa.probeSerial ? ` - #${pa.probeSerial}` : ''}</h3>
                          <span className={`status-badge ${pa.approvalStatus === 'Approved' ? 'status-approved' : pa.approvalStatus === 'Change Requested' ? 'status-change-requested' : 'status-pending'}`}>
                            {pa.approvalStatus}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="card-content">
                        {/* Map */}
                        {pa.placementLat && pa.placementLng && (
                          <div className="card-map">
                            <ApprovalMap lat={Number(pa.placementLat)} lng={Number(pa.placementLng)} fieldName={`${fieldName} - Probe ${pa.probeNumber}`} />
                          </div>
                        )}

                        {/* Details */}
                        <div className="card-details">
                          {pa.placementLat && pa.placementLng && (
                            <div className="detail-row">
                              <span className="detail-label">Coordinates</span>
                              <span className="detail-value">
                                {Number(pa.placementLat).toFixed(6)}, {Number(pa.placementLng).toFixed(6)}
                              </span>
                            </div>
                          )}
                          {pa.elevation && (
                            <div className="detail-row">
                              <span className="detail-label">Elevation</span>
                              <span className="detail-value">{pa.elevation} ft</span>
                            </div>
                          )}
                          {pa.soilType && (
                            <div className="detail-row">
                              <span className="detail-label">Soil Type</span>
                              <span className="detail-value">{pa.soilType}</span>
                            </div>
                          )}
                          {pa.placementNotes && (
                            <div className="detail-row full-width">
                              <span className="detail-label">Placement Notes</span>
                              <p className="detail-notes">{pa.placementNotes}</p>
                            </div>
                          )}
                        </div>

                        {/* Auto-save actions */}
                        {renderStatusActions(
                          pa.approvalStatus,
                          key,
                          () => handleApproveProbeAssignment(pa.id),
                          () => handleUndoApproveProbeAssignment(pa.id),
                          () => handleChangeNotesBlur(pa.id),
                          pa.approvalDate,
                          pa.approvalNotes,
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          /* Legacy Field Cards */
          <div className="approval-fields">
            {fields.map((field) => {
              const key = `fs-${field.fieldSeasonId}`;

              return (
                <div key={field.fieldSeasonId} className="approval-card expanded">
                  {/* Card Header */}
                  <div className="card-header">
                    <div className="card-title">
                      <h3>{field.name}</h3>
                      <span className={`status-badge ${field.approvalStatus === 'Approved' ? 'status-approved' : field.approvalStatus === 'Change Requested' ? 'status-change-requested' : 'status-pending'}`}>
                        {field.approvalStatus}
                      </span>
                    </div>
                    <div className="card-summary">
                      <span>{field.acres} acres</span>
                      <span>{field.crop}</span>
                      <span>{field.serviceType}</span>
                    </div>
                  </div>

                  {/* Content - Always visible */}
                  <div className="card-content">
                    {/* Map */}
                    <div className="card-map">
                      <ApprovalMap lat={Number(field.lat)} lng={Number(field.lng)} fieldName={field.name} />
                    </div>

                    {/* Details */}
                    <div className="card-details">
                      <div className="detail-row">
                        <span className="detail-label">Coordinates</span>
                        <span className="detail-value">
                          {Number(field.lat).toFixed(6)}, {Number(field.lng).toFixed(6)}
                        </span>
                      </div>
                      {field.elevation && (
                        <div className="detail-row">
                          <span className="detail-label">Elevation</span>
                          <span className="detail-value">{field.elevation} ft</span>
                        </div>
                      )}
                      {field.soilType && (
                        <div className="detail-row">
                          <span className="detail-label">Soil Type</span>
                          <span className="detail-value">{field.soilType}</span>
                        </div>
                      )}
                      {field.placementNotes && (
                        <div className="detail-row full-width">
                          <span className="detail-label">Placement Notes</span>
                          <p className="detail-notes">{field.placementNotes}</p>
                        </div>
                      )}
                    </div>

                    {/* Auto-save actions */}
                    {renderStatusActions(
                      field.approvalStatus,
                      key,
                      () => handleApprove(field.fieldSeasonId),
                      () => handleUndoApprove(field.fieldSeasonId),
                      () => handleFieldChangeNotesBlur(field.fieldSeasonId),
                      field.approvalDate,
                      field.approvalNotes,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Bulk Actions */}
        {pendingCount > 0 && (
          <div className="bulk-actions" style={{ marginTop: '32px', marginBottom: '32px' }}>
            <button
              className="btn btn-primary"
              onClick={handleBulkApprove}
              disabled={bulkLoading}
            >
              {bulkLoading ? 'Approving...' : `Approve All ${pendingCount} Locations`}
            </button>
          </div>
        )}

        {/* Footer */}
        <footer className="approval-footer">
          <p>Thank you for reviewing your probe placement locations.</p>
        </footer>
      </div>
    </div>
  );
}
