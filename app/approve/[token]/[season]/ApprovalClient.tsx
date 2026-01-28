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

interface DebugInfo {
  operationId: number;
  totalBillingEntities: number;
  operationBillingEntities: { id: number; name: string }[];
  totalFields: number;
  operationFields: { id: number; name: string }[];
  totalFieldSeasons: number;
  operationFieldSeasons: number;
  allFieldSeasonsForOp?: { id: number; fieldId?: number; fieldName?: string; season?: number; seasonType: string }[];
}

interface ApprovalClientProps {
  operationName: string;
  season: number;
  fields: ApprovalField[];
  debugInfo?: DebugInfo;
}

export default function ApprovalClient({ operationName, season, fields: initialFields, debugInfo }: ApprovalClientProps) {
  const [fields, setFields] = useState(initialFields);
  const [expandedFieldId, setExpandedFieldId] = useState<number | null>(null);
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
        alert(error.error || 'Failed to approve');
      }
    } catch {
      alert('Failed to approve');
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
              {bulkLoading ? 'Approving...' : `Approve All ${pendingCount} Pending Fields`}
            </button>
          </div>
        )}

        {/* Field Cards */}
        <div className="approval-fields">
          {fields.map((field) => {
            const isExpanded = expandedFieldId === field.id;
            const isLoading = loading[field.fieldSeasonId];

            return (
              <div key={field.fieldSeasonId} className={`approval-card ${isExpanded ? 'expanded' : ''}`}>
                {/* Card Header */}
                <div className="card-header" onClick={() => setExpandedFieldId(isExpanded ? null : field.id)}>
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
                  <button className="expand-btn">
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="card-content">
                    {/* Map */}
                    <div className="card-map">
                      <ApprovalMap lat={field.lat} lng={field.lng} fieldName={field.name} />
                    </div>

                    {/* Details */}
                    <div className="card-details">
                      <div className="detail-row">
                        <span className="detail-label">Coordinates</span>
                        <span className="detail-value">
                          {field.lat.toFixed(6)}, {field.lng.toFixed(6)}
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
                )}
              </div>
            );
          })}
        </div>

        {/* Debug Info */}
        {debugInfo && (
          <div style={{ marginTop: '24px', padding: '16px', background: '#fff3cd', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace' }}>
            <strong>DEBUG INFO:</strong>
            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
              <li>Operation ID: {debugInfo.operationId}</li>
              <li>Total billing entities in DB: {debugInfo.totalBillingEntities}</li>
              <li>Billing entities for this operation: {debugInfo.operationBillingEntities.length}
                {debugInfo.operationBillingEntities.length > 0 && (
                  <ul>{debugInfo.operationBillingEntities.map(be => <li key={be.id}>{be.name} (ID: {be.id})</li>)}</ul>
                )}
              </li>
              <li>Total fields in DB: {debugInfo.totalFields}</li>
              <li>Fields for this operation: {debugInfo.operationFields.length}
                {debugInfo.operationFields.length > 0 && (
                  <ul>{debugInfo.operationFields.map(f => <li key={f.id}>{f.name} (ID: {f.id})</li>)}</ul>
                )}
              </li>
              <li>Total field seasons in DB: {debugInfo.totalFieldSeasons}</li>
              <li>Field seasons for this operation + {season}: {debugInfo.operationFieldSeasons}</li>
              <li><strong>All field seasons for these fields (any season):</strong>
                {debugInfo.allFieldSeasonsForOp && debugInfo.allFieldSeasonsForOp.length > 0 ? (
                  <ul>{debugInfo.allFieldSeasonsForOp.map(fs => (
                    <li key={fs.id}>
                      {fs.fieldName} (FieldID: {fs.fieldId}) - Season: {fs.season} (type: {fs.seasonType})
                    </li>
                  ))}</ul>
                ) : (
                  <span style={{ color: 'red' }}> NONE - these fields have no field_season records!</span>
                )}
              </li>
            </ul>
          </div>
        )}

        {/* Footer */}
        <footer className="approval-footer">
          <p>Thank you for reviewing your probe placement locations.</p>
          <p className="footer-contact">Questions? Contact your agronomist.</p>
        </footer>
      </div>
    </div>
  );
}
