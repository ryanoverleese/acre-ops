'use client';

import { useState, useMemo } from 'react';
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
  const [loading, setLoading] = useState<Record<string, boolean>>({});
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

  // Approve a probe assignment
  const handleApproveProbeAssignment = async (probeAssignmentId: number) => {
    const key = `pa-${probeAssignmentId}`;
    setLoading((prev) => ({ ...prev, [key]: true }));
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
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to approve');
      }
    } catch {
      alert('Failed to approve');
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Request change for a probe assignment
  const handleRequestChangeProbeAssignment = async (probeAssignmentId: number) => {
    const key = `pa-${probeAssignmentId}`;
    const notes = changeNotes[key];
    if (!notes?.trim()) {
      alert('Please enter notes describing the requested change');
      return;
    }

    setLoading((prev) => ({ ...prev, [key]: true }));
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
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to request change');
      }
    } catch {
      alert('Failed to request change');
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Bulk approve all pending probe assignments
  const handleBulkApproveProbeAssignments = async () => {
    const pendingAssignments = probeAssignments.filter((pa) => pa.approvalStatus === 'Pending');
    if (pendingAssignments.length === 0) return;

    if (!confirm(`Approve all ${pendingAssignments.length} pending probe locations?`)) return;

    setBulkLoading(true);
    try {
      // Approve each one
      const approvalDate = new Date().toISOString().split('T')[0];
      await Promise.all(
        pendingAssignments.map((pa) =>
          fetch(`/api/probe-assignments/${pa.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              approval_status: 'Approved',
              approval_date: approvalDate,
            }),
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
      alert('Failed to bulk approve');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleApprove = async (fieldSeasonId: number) => {
    const key = `fs-${fieldSeasonId}`;
    setLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldSeasonId,
          action: 'approve',
        }),
      });

      if (response.ok) {
        setFields((prev) =>
          prev.map((f) =>
            f.fieldSeasonId === fieldSeasonId
              ? { ...f, approvalStatus: 'Approved', approvalDate: new Date().toISOString().split('T')[0] }
              : f
          )
        );
      } else {
        const error = await response.json();
        console.error('Approve error:', error);
        alert(`Failed to approve field (ID: ${fieldSeasonId}): ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Approve exception:', err);
      alert('Failed to approve field');
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleRequestChange = async (fieldSeasonId: number) => {
    const key = `fs-${fieldSeasonId}`;
    const notes = changeNotes[key];
    if (!notes?.trim()) {
      alert('Please enter notes describing the requested change');
      return;
    }

    setLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldSeasonId,
          action: 'request_change',
          notes,
        }),
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
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to request change');
      }
    } catch {
      alert('Failed to request change');
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleBulkApprove = async () => {
    if (hasProbeAssignments) {
      return handleBulkApproveProbeAssignments();
    }

    const pendingFields = fields.filter((f) => f.approvalStatus === 'Pending');
    if (pendingFields.length === 0) return;

    if (!confirm(`Approve all ${pendingFields.length} pending fields?`)) return;

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
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to bulk approve');
      }
    } catch {
      alert('Failed to bulk approve');
    } finally {
      setBulkLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'status-badge status-approved';
      case 'Change Requested':
        return 'status-badge status-change-requested';
      default:
        return 'status-badge status-pending';
    }
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
              {bulkLoading ? 'Approving...' : 'Approve All Locations'}
            </button>
          </div>
        )}

        {/* Probe Assignments grouped by Field */}
        {hasProbeAssignments ? (
          <div className="approval-fields">
            {Object.entries(groupedProbeAssignments).map(([fieldName, probes]) => (
              <div key={fieldName} className="approval-field-group">
                <h2 className="field-group-title">{fieldName}</h2>
                {probes.map((pa) => {
                  const key = `pa-${pa.id}`;
                  const isLoading = loading[key];

                  return (
                    <div key={pa.id} className="approval-card expanded" style={{ marginBottom: '16px' }}>
                      {/* Card Header */}
                      <div className="card-header">
                        <div className="card-title">
                          <h3>Probe {pa.probeNumber}{pa.probeSerial ? ` - #${pa.probeSerial}` : ''}</h3>
                          <span className={getStatusBadgeClass(pa.approvalStatus)}>
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

                        {/* Actions */}
                        {pa.approvalStatus === 'Pending' && (
                          <div className="card-actions">
                            <button
                              className="btn btn-primary"
                              onClick={() => handleApproveProbeAssignment(pa.id)}
                              disabled={isLoading}
                            >
                              {isLoading ? 'Approving...' : 'Approve Location'}
                            </button>
                            <div className="change-request-form">
                              <textarea
                                placeholder="Describe the change you'd like..."
                                value={changeNotes[key] || ''}
                                onChange={(e) =>
                                  setChangeNotes((prev) => ({ ...prev, [key]: e.target.value }))
                                }
                              />
                              <button
                                className="btn btn-secondary"
                                onClick={() => handleRequestChangeProbeAssignment(pa.id)}
                                disabled={isLoading}
                              >
                                Request Change
                              </button>
                            </div>
                          </div>
                        )}

                        {pa.approvalStatus === 'Approved' && pa.approvalDate && (
                          <div className="card-approved-info">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Approved on {pa.approvalDate}
                          </div>
                        )}

                        {pa.approvalStatus === 'Change Requested' && pa.approvalNotes && (
                          <div className="card-change-info">
                            <strong>Change Requested:</strong>
                            <p>{pa.approvalNotes}</p>
                          </div>
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
              const isLoading = loading[key];

              return (
                <div key={field.fieldSeasonId} className="approval-card expanded">
                  {/* Card Header */}
                  <div className="card-header">
                    <div className="card-title">
                      <h3>{field.name}</h3>
                      <span className={getStatusBadgeClass(field.approvalStatus)}>
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

                    {/* Actions */}
                    {field.approvalStatus === 'Pending' && (
                      <div className="card-actions">
                        <button
                          className="btn btn-primary"
                          onClick={() => handleApprove(field.fieldSeasonId)}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Approving...' : 'Approve Location'}
                        </button>
                        <div className="change-request-form">
                          <textarea
                            placeholder="Describe the change you'd like..."
                            value={changeNotes[key] || ''}
                            onChange={(e) =>
                              setChangeNotes((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleRequestChange(field.fieldSeasonId)}
                            disabled={isLoading}
                          >
                            Request Change
                          </button>
                        </div>
                      </div>
                    )}

                    {field.approvalStatus === 'Approved' && field.approvalDate && (
                    <div className="card-approved-info">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Approved on {field.approvalDate}
                    </div>
                  )}

                  {field.approvalStatus === 'Change Requested' && field.approvalNotes && (
                    <div className="card-change-info">
                      <strong>Change Requested:</strong>
                      <p>{field.approvalNotes}</p>
                    </div>
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
              {bulkLoading ? 'Approving...' : 'Approve All Locations'}
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
