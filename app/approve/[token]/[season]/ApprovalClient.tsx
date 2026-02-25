'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ApprovalProbeAssignment } from './page';

// Dynamically import map component
const ApprovalMap = dynamic(() => import('./ApprovalMap'), {
  ssr: false,
  loading: () => (
    <div className="approval-map-loading">
      <div className="loading">Loading map...</div>
    </div>
  ),
});

interface ApprovalClientProps {
  operationName: string;
  season: number;
  probeAssignments?: ApprovalProbeAssignment[];
}

export default function ApprovalClient({ operationName, season, probeAssignments: initialProbeAssignments = [] }: ApprovalClientProps) {
  const [probeAssignments, setProbeAssignments] = useState(initialProbeAssignments);
  const [changeNotes, setChangeNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

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

  const approvedCount = probeAssignments.filter((pa) => pa.approvalStatus === 'Approved').length;
  const totalCount = probeAssignments.length;
  const pendingCount = probeAssignments.filter((pa) => pa.approvalStatus === 'Pending').length;
  const changeRequestedCount = probeAssignments.filter((pa) => pa.approvalStatus === 'Change Requested').length;

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

  const handleBulkApprove = async () => {
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

    const buttonClass = `approval-action-btn${status === 'Approved' ? ' is-approved' : status === 'Change Requested' ? ' is-change-requested' : ''}`;

    return (
      <div className="card-actions">
        {/* Approve / Approved toggle */}
        <button
          onClick={status === 'Approved' ? undoHandler : approveHandler}
          disabled={isSaving}
          className={buttonClass}
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
          <div className="approval-saved-indicator">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </div>
        )}

        {/* Change request textarea - always visible for Pending, shows notes for Change Requested */}
        {status === 'Change Requested' && approvalNotes && (
          <div className="approval-change-box">
            <strong>Change Requested:</strong>
            <p>{approvalNotes}</p>
          </div>
        )}

        {(status === 'Pending' || status === 'Change Requested') && (
          <textarea
            className="approval-change-textarea"
            placeholder={status === 'Change Requested' ? 'Add additional notes...' : 'Describe the change you\'d like... (saves automatically)'}
            value={changeNotes[key] || ''}
            onChange={(e) => setChangeNotes((prev) => ({ ...prev, [key]: e.target.value }))}
            onBlur={blurHandler}
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
          {totalCount > 0 && (
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
              <p className="progress-text">{approvedCount} of {totalCount} probe locations approved</p>
            </div>
          )}
        </header>

        {totalCount === 0 ? (
          <div className="approval-empty">
            <p>No probe assignments to approve for this season yet.</p>
          </div>
        ) : (
          <>
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
            <div className="approval-fields">
              {Object.entries(groupedProbeAssignments).map(([fieldName, probes]) => (
                <div key={fieldName} className="approval-field-group">
                  {probes.map((pa) => {
                    const key = `pa-${pa.id}`;

                    return (
                      <div key={pa.id} className="approval-card expanded approval-card-spaced">
                        {/* Card Header */}
                        <div className="card-header">
                          <div className="card-title">
                            <h3>{fieldName} - Probe {pa.probeNumber}{pa.label ? ` — ${pa.label}` : ''}{pa.probeSerial ? ` - #${pa.probeSerial}` : ''}</h3>
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
                              <ApprovalMap lat={Number(pa.placementLat)} lng={Number(pa.placementLng)} fieldName={`${fieldName} - Probe ${pa.probeNumber}${pa.label ? ` — ${pa.label}` : ''}`} />
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
                            {pa.waterSource && (
                              <div className="detail-row">
                                <span className="detail-label">Primary Water Source</span>
                                <span className="detail-value">{pa.waterSource}</span>
                              </div>
                            )}
                            {pa.fuelSource && (
                              <div className="detail-row">
                                <span className="detail-label">Primary Fuel Source</span>
                                <span className="detail-value">{pa.fuelSource}</span>
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

            {/* Bottom Bulk Actions */}
            {pendingCount > 0 && (
              <div className="bulk-actions bulk-actions-bottom">
                <button
                  className="btn btn-primary"
                  onClick={handleBulkApprove}
                  disabled={bulkLoading}
                >
                  {bulkLoading ? 'Approving...' : `Approve All ${pendingCount} Locations`}
                </button>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <footer className="approval-footer">
          <p>Thank you for reviewing your probe placement locations.</p>
        </footer>
      </div>
    </div>
  );
}
