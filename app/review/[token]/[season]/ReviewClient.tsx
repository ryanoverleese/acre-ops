'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ReviewFieldInfoItem, ReviewProbeAssignment, ReviewSelectOptions, ReviewBillingEntityOption } from './page';

const ApprovalMap = dynamic(() => import('@/app/approve/[token]/[season]/ApprovalMap'), {
  ssr: false,
  loading: () => (
    <div className="approval-map-loading">
      <div className="loading">Loading map...</div>
    </div>
  ),
});

interface ReviewClientProps {
  operationName: string;
  season: number;
  token: string;
  fields: ReviewFieldInfoItem[];
  probeAssignments: ReviewProbeAssignment[];
  selectOptions: ReviewSelectOptions;
  billingEntityOptions: ReviewBillingEntityOption[];
  visibleQuestions: string[];
}

interface FieldForm {
  irrigationType: string;
  rowDirection: string;
  waterSource: string;
  fuelSource: string;
  crop: string;
  sideDress: string;
  hybridVariety: string;
  plantingDate: string;
}

function ButtonGroup({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="fi-button-group">
      <div className="fi-button-group-label">{label}</div>
      <div className="fi-button-group-options">
        {options.map((o) => {
          const isSelected = value === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(isSelected ? '' : o.value)}
              className={`fi-button-option${isSelected ? ' selected' : ''}`}
            >
              {isSelected && (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ReviewClient({
  operationName, season, token, fields: initialFields, probeAssignments: initialProbeAssignments,
  selectOptions, billingEntityOptions, visibleQuestions,
}: ReviewClientProps) {
  const showQuestion = (key: string) => visibleQuestions.includes(key);

  // Field info state
  const [fields, setFields] = useState(initialFields);
  const [billingEntities, setBillingEntities] = useState<Record<number, number | null>>(() => {
    const initial: Record<number, number | null> = {};
    initialFields.forEach((f) => { initial[f.fieldId] = f.billingEntityId; });
    return initial;
  });
  const [beSaving, setBeSaving] = useState<Record<number, boolean>>({});
  const [beSaved, setBeSaved] = useState<Record<number, boolean>>({});
  const [forms, setForms] = useState<Record<number, FieldForm>>(() => {
    const initial: Record<number, FieldForm> = {};
    initialFields.forEach((f) => {
      initial[f.fieldSeasonId] = {
        irrigationType: f.irrigationType, rowDirection: f.rowDirection,
        waterSource: f.waterSource, fuelSource: f.fuelSource,
        crop: f.crop, sideDress: f.sideDress,
        hybridVariety: f.hybridVariety, plantingDate: f.plantingDate,
      };
    });
    return initial;
  });
  const [fiSaving, setFiSaving] = useState<Record<number, boolean>>({});
  const [fiSaved, setFiSaved] = useState<Record<number, boolean>>({});

  // Probe approval state
  const [probeAssignments, setProbeAssignments] = useState(initialProbeAssignments);
  const [changeNotes, setChangeNotes] = useState<Record<string, string>>({});
  const [paSaving, setPaSaving] = useState<Record<string, boolean>>({});
  const [paSaved, setPaSaved] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  // Group probe assignments by fieldSeasonId for matching with field cards
  const probesByFieldSeason = useMemo(() => {
    const groups: Record<number, ReviewProbeAssignment[]> = {};
    probeAssignments.forEach((pa) => {
      if (!groups[pa.fieldSeasonId]) groups[pa.fieldSeasonId] = [];
      groups[pa.fieldSeasonId].push(pa);
    });
    return groups;
  }, [probeAssignments]);

  // Stats
  const filledCount = fields.filter((f) => {
    const form = forms[f.fieldSeasonId];
    return form && (form.irrigationType || form.crop);
  }).length;
  const approvedCount = probeAssignments.filter((pa) => pa.approvalStatus === 'Approved').length;
  const totalProbes = probeAssignments.length;
  const pendingCount = probeAssignments.filter((pa) => pa.approvalStatus === 'Pending').length;
  const changeRequestedCount = probeAssignments.filter((pa) => pa.approvalStatus === 'Change Requested').length;

  // Field info save handlers
  const API_FIELD_MAP: Record<string, string> = {
    irrigationType: 'irrigation_type', rowDirection: 'row_direction',
    waterSource: 'water_source', fuelSource: 'fuel_source',
    crop: 'crop', sideDress: 'side_dress',
    hybridVariety: 'hybrid_variety', plantingDate: 'planting_date',
  };

  const saveFieldChange = async (field: ReviewFieldInfoItem, key: keyof FieldForm, value: string) => {
    setForms((prev) => ({ ...prev, [field.fieldSeasonId]: { ...prev[field.fieldSeasonId], [key]: value } }));
    const apiField = API_FIELD_MAP[key];
    if (!apiField) return;
    setFiSaving((prev) => ({ ...prev, [field.fieldSeasonId]: true }));
    try {
      const res = await fetch('/api/field-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fieldId: field.fieldId, fieldSeasonId: field.fieldSeasonId, field: apiField, value: value || '' }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setFields((prev) => prev.map((f) => f.fieldSeasonId === field.fieldSeasonId ? { ...f, [key]: value } : f));
      setFiSaved((prev) => ({ ...prev, [field.fieldSeasonId]: true }));
      setTimeout(() => setFiSaved((prev) => ({ ...prev, [field.fieldSeasonId]: false })), 2000);
    } catch {
      // silent fail
    } finally {
      setFiSaving((prev) => ({ ...prev, [field.fieldSeasonId]: false }));
    }
  };

  const saveBillingEntity = async (field: ReviewFieldInfoItem, beId: number | null) => {
    setBillingEntities((prev) => ({ ...prev, [field.fieldId]: beId }));
    setBeSaving((prev) => ({ ...prev, [field.fieldId]: true }));
    try {
      const res = await fetch('/api/field-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, fieldId: field.fieldId, field: 'billing_entity', value: beId }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setBeSaved((prev) => ({ ...prev, [field.fieldId]: true }));
      setTimeout(() => setBeSaved((prev) => ({ ...prev, [field.fieldId]: false })), 2000);
    } catch {
      // silent fail
    } finally {
      setBeSaving((prev) => ({ ...prev, [field.fieldId]: false }));
    }
  };

  // Probe approval handlers
  const showPaSaved = useCallback((key: string) => {
    setPaSaved((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setPaSaved((prev) => ({ ...prev, [key]: false })), 2000);
  }, []);

  const handleApproveProbeAssignment = async (probeAssignmentId: number) => {
    const key = `pa-${probeAssignmentId}`;
    setPaSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: 'Approved', approval_date: new Date().toISOString().split('T')[0] }),
      });
      if (response.ok) {
        setProbeAssignments((prev) => prev.map((pa) =>
          pa.id === probeAssignmentId ? { ...pa, approvalStatus: 'Approved', approvalDate: new Date().toISOString().split('T')[0] } : pa
        ));
        showPaSaved(key);
      }
    } catch {
      // silent fail
    } finally {
      setPaSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleUndoApproveProbeAssignment = async (probeAssignmentId: number) => {
    const key = `pa-${probeAssignmentId}`;
    setPaSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: 'Pending', approval_date: '' }),
      });
      if (response.ok) {
        setProbeAssignments((prev) => prev.map((pa) =>
          pa.id === probeAssignmentId ? { ...pa, approvalStatus: 'Pending', approvalDate: '' } : pa
        ));
      }
    } catch {
      // silent fail
    } finally {
      setPaSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleChangeNotesBlur = async (probeAssignmentId: number) => {
    const key = `pa-${probeAssignmentId}`;
    const notes = changeNotes[key]?.trim();
    if (!notes) return;
    setPaSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: 'Change Requested', approval_notes: notes }),
      });
      if (response.ok) {
        setProbeAssignments((prev) => prev.map((pa) =>
          pa.id === probeAssignmentId ? { ...pa, approvalStatus: 'Change Requested', approvalNotes: notes } : pa
        ));
        setChangeNotes((prev) => ({ ...prev, [key]: '' }));
        showPaSaved(key);
      }
    } catch {
      // silent fail
    } finally {
      setPaSaving((prev) => ({ ...prev, [key]: false }));
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
      setProbeAssignments((prev) => prev.map((pa) =>
        pa.approvalStatus === 'Pending' ? { ...pa, approvalStatus: 'Approved', approvalDate } : pa
      ));
    } catch {
      // silent fail
    } finally {
      setBulkLoading(false);
    }
  };

  const renderProbeStatusActions = (pa: ReviewProbeAssignment) => {
    const key = `pa-${pa.id}`;
    const isSaving = paSaving[key];
    const isSaved = paSaved[key];
    const buttonClass = `approval-action-btn${pa.approvalStatus === 'Approved' ? ' is-approved' : pa.approvalStatus === 'Change Requested' ? ' is-change-requested' : ''}`;

    return (
      <div className="card-actions">
        <button
          onClick={pa.approvalStatus === 'Approved' ? () => handleUndoApproveProbeAssignment(pa.id) : () => handleApproveProbeAssignment(pa.id)}
          disabled={isSaving}
          className={buttonClass}
        >
          {isSaving ? 'Saving...' : pa.approvalStatus === 'Approved' ? (
            <>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approved{pa.approvalDate ? ` on ${pa.approvalDate}` : ''} (tap to undo)
            </>
          ) : 'Approve Location'}
        </button>
        {isSaved && (
          <div className="approval-saved-indicator">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </div>
        )}
        {pa.approvalStatus === 'Change Requested' && pa.approvalNotes && (
          <div className="approval-change-box">
            <strong>Change Requested:</strong>
            <p>{pa.approvalNotes}</p>
          </div>
        )}
        {(pa.approvalStatus === 'Pending' || pa.approvalStatus === 'Change Requested') && (
          <textarea
            className="approval-change-textarea"
            placeholder={pa.approvalStatus === 'Change Requested' ? 'Add additional notes...' : 'Describe the change you\'d like... (saves automatically)'}
            value={changeNotes[key] || ''}
            onChange={(e) => setChangeNotes((prev) => ({ ...prev, [key]: e.target.value }))}
            onBlur={() => handleChangeNotesBlur(pa.id)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="approval-page">
      <div className="approval-container">
        <header className="approval-header">
          <div className="approval-header-content">
            <h1>{operationName}</h1>
            <p className="approval-subtitle">{season} Season - Field Review</p>
          </div>
          <div className="approval-progress">
            <div className="progress-stats">
              <span className="stat approved">{filledCount} Fields Updated</span>
              <span className="stat pending">{fields.length - filledCount} Remaining</span>
              {totalProbes > 0 && (
                <>
                  <span className="stat approved">{approvedCount} Probes Approved</span>
                  {pendingCount > 0 && <span className="stat pending">{pendingCount} Pending</span>}
                  {changeRequestedCount > 0 && <span className="stat change-requested">{changeRequestedCount} Changes</span>}
                </>
              )}
            </div>
            {totalProbes > 0 && (
              <>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(approvedCount / totalProbes) * 100}%` }} />
                </div>
                <p className="progress-text">{approvedCount} of {totalProbes} probe locations approved</p>
              </>
            )}
          </div>
        </header>

        <p className="fi-hint">
          Fill in field details and approve probe locations below. Changes save automatically.
        </p>

        {/* Bulk approve */}
        {pendingCount > 0 && (
          <div className="bulk-actions">
            <button className="btn btn-primary" onClick={handleBulkApprove} disabled={bulkLoading}>
              {bulkLoading ? 'Approving...' : `Approve All ${pendingCount} Probe Locations`}
            </button>
          </div>
        )}

        <div className="approval-fields">
          {fields.map((field) => {
            const form = forms[field.fieldSeasonId];
            if (!form) return null;
            const fieldProbes = probesByFieldSeason[field.fieldSeasonId] || [];
            const isFiSaving = fiSaving[field.fieldSeasonId];
            const isFiSaved = fiSaved[field.fieldSeasonId];

            return (
              <div key={field.fieldSeasonId} className="approval-card expanded fi-card">
                <div className="card-header">
                  <div className="card-title">
                    <h3>{field.name}</h3>
                    <span className="fi-acres">{field.acres} acres</span>
                  </div>
                </div>

                <div className="card-content">
                  {/* Field Info Section */}
                  {showQuestion('billing_entity') && billingEntityOptions.length > 1 && (
                    <div className="fi-billing-section">
                      <div className="fi-field-label">Billing Entity</div>
                      <div className="fi-select-row">
                        <select
                          className="fi-select"
                          value={billingEntities[field.fieldId] ?? ''}
                          onChange={(e) => saveBillingEntity(field, e.target.value ? parseInt(e.target.value, 10) : null)}
                        >
                          <option value="">Select billing entity...</option>
                          {billingEntityOptions.map((be) => (
                            <option key={be.id} value={be.id}>{be.name}</option>
                          ))}
                        </select>
                        {beSaving[field.fieldId] && <span className="fi-saving-indicator">Saving...</span>}
                        {beSaved[field.fieldId] && (
                          <span className="fi-saved-indicator">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Saved
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {showQuestion('crop') && (
                    <ButtonGroup label="Crop" options={selectOptions.crop} value={form.crop}
                      onChange={(v) => saveFieldChange(field, 'crop', v)} />
                  )}
                  {showQuestion('irrigation_type') && (
                    <ButtonGroup label="Irrigation Type" options={selectOptions.irrigation_type} value={form.irrigationType}
                      onChange={(v) => saveFieldChange(field, 'irrigationType', v)} />
                  )}
                  {showQuestion('row_direction') && (
                    <ButtonGroup label="Row Direction" options={selectOptions.row_direction} value={form.rowDirection}
                      onChange={(v) => saveFieldChange(field, 'rowDirection', v)} />
                  )}
                  {showQuestion('side_dress') && (
                    <ButtonGroup label="Side Dress" options={selectOptions.side_dress} value={form.sideDress}
                      onChange={(v) => saveFieldChange(field, 'sideDress', v)} />
                  )}
                  {showQuestion('water_source') && (
                    <ButtonGroup label="Primary Water Source" options={selectOptions.water_source} value={form.waterSource}
                      onChange={(v) => saveFieldChange(field, 'waterSource', v)} />
                  )}
                  {showQuestion('fuel_source') && (
                    <ButtonGroup label="Primary Fuel Source" options={selectOptions.fuel_source} value={form.fuelSource}
                      onChange={(v) => saveFieldChange(field, 'fuelSource', v)} />
                  )}

                  {(showQuestion('hybrid_variety') || showQuestion('planting_date')) && (
                    <div className="fi-text-fields">
                      {showQuestion('hybrid_variety') && (
                        <div className="fi-text-field">
                          <div className="fi-field-label">Hybrid / Variety</div>
                          <input
                            type="text" className="fi-text-input" value={form.hybridVariety}
                            onChange={(e) => setForms((prev) => ({ ...prev, [field.fieldSeasonId]: { ...prev[field.fieldSeasonId], hybridVariety: e.target.value } }))}
                            onBlur={(e) => { if (e.target.value !== field.hybridVariety) saveFieldChange(field, 'hybridVariety', e.target.value); }}
                            placeholder="e.g. P1185AM"
                          />
                        </div>
                      )}
                      {showQuestion('planting_date') && (
                        <div className="fi-text-field">
                          <div className="fi-field-label">Planting Date</div>
                          <input type="date" className="fi-text-input" value={form.plantingDate}
                            onChange={(e) => saveFieldChange(field, 'plantingDate', e.target.value)} />
                        </div>
                      )}
                    </div>
                  )}

                  {(isFiSaving || isFiSaved) && (
                    <div className="fi-autosave">
                      {isFiSaving && <span className="fi-saving-indicator">Saving...</span>}
                      {isFiSaved && (
                        <span className="fi-saved-indicator">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Saved
                        </span>
                      )}
                    </div>
                  )}

                  {/* Probe Approval Section */}
                  {fieldProbes.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '16px', paddingTop: '16px' }}>
                      {fieldProbes.map((pa) => (
                        <div key={pa.id} style={{ marginBottom: '16px' }}>
                          <div className="card-header" style={{ marginBottom: '8px' }}>
                            <div className="card-title">
                              <h3 style={{ fontSize: '15px' }}>{field.name} — Probe {pa.probeNumber}{pa.label ? ` — ${pa.label}` : ''}{pa.probeSerial ? ` - #${pa.probeSerial}` : ''}</h3>
                              <span className={`status-badge ${pa.approvalStatus === 'Approved' ? 'status-approved' : pa.approvalStatus === 'Change Requested' ? 'status-change-requested' : 'status-pending'}`}>
                                {pa.approvalStatus}
                              </span>
                            </div>
                          </div>

                          {pa.placementLat && pa.placementLng && (
                            <div className="card-map">
                              <ApprovalMap lat={Number(pa.placementLat)} lng={Number(pa.placementLng)} fieldName={`${field.name} - Probe ${pa.probeNumber}${pa.label ? ` — ${pa.label}` : ''}`} />
                            </div>
                          )}

                          <div className="card-details">
                            {pa.placementLat && pa.placementLng && (
                              <div className="detail-row">
                                <span className="detail-label">Coordinates</span>
                                <span className="detail-value">{Number(pa.placementLat).toFixed(6)}, {Number(pa.placementLng).toFixed(6)}</span>
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

                          {renderProbeStatusActions(pa)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom bulk approve */}
        {pendingCount > 0 && (
          <div className="bulk-actions bulk-actions-bottom">
            <button className="btn btn-primary" onClick={handleBulkApprove} disabled={bulkLoading}>
              {bulkLoading ? 'Approving...' : `Approve All ${pendingCount} Probe Locations`}
            </button>
          </div>
        )}

        <footer className="approval-footer">
          <p>Thank you for reviewing your field information and probe locations.</p>
        </footer>
      </div>
    </div>
  );
}
