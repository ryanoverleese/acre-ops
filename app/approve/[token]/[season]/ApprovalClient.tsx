'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { ApprovalField } from './page';

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
}

export default function ApprovalClient({ operationName, season, fields: initialFields }: ApprovalClientProps) {
  const [fields, setFields] = useState(initialFields);
  const [changeNotes, setChangeNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  const approvedCount = fields.filter((f) => f.approvalStatus === 'Approved').length;
  const pendingCount = fields.filter((f) => f.approvalStatus === 'Pending').length;
  const changeRequestedCount = fields.filter((f) => f.approvalStatus === 'Change Requested').length;

  const handleApprove = async (fieldSeasonId: number) => {
    setLoading((prev) => ({ ...prev, [fieldSeasonId]: true }));
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
      setLoading((prev) => ({ ...prev, [fieldSeasonId]: false }));
    }
  };

  const handleRequestChange = async (fieldSeasonId: number) => {
    const notes = changeNotes[fieldSeasonId];
    if (!notes?.trim()) {
      alert('Please enter notes describing the requested change');
      return;
    }

    setLoading((prev) => ({ ...prev, [fieldSeasonId]: true }));
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
        setChangeNotes((prev) => ({ ...prev, [fieldSeasonId]: '' }));
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to request change');
      }
    } catch {
      alert('Failed to request change');
    } finally {
      setLoading((prev) => ({ ...prev, [fieldSeasonId]: false }));
    }
  };

  const handleBulkApprove = async () => {
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
                style={{ width: `${(approvedCount / fields.length) * 100}%` }}
              />
            </div>
            <p className="progress-text">{approvedCount} of {fields.length} fields approved</p>
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

        {/* Field Cards */}
        <div className="approval-fields">
          {fields.map((field) => {
            const isLoading = loading[field.fieldSeasonId];

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
                          value={changeNotes[field.fieldSeasonId] || ''}
                          onChange={(e) =>
                            setChangeNotes((prev) => ({ ...prev, [field.fieldSeasonId]: e.target.value }))
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
