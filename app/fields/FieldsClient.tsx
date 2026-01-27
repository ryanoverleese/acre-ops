'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { ProcessedField, OperationOption } from './page';

const FieldsMap = dynamic(() => import('@/components/FieldsMap'), {
  ssr: false,
  loading: () => <div className="fields-map" style={{ display: 'block' }}><div className="loading"><div className="loading-spinner"></div>Loading map...</div></div>,
});

interface FieldsClientProps {
  initialFields: ProcessedField[];
  operations: OperationOption[];
  statusCounts: {
    all: number;
    'needs-probe': number;
    pending: number;
    installed: number;
    repair: number;
  };
}

export default function FieldsClient({
  initialFields,
  operations,
  statusCounts,
}: FieldsClientProps) {
  const [currentFilter, setCurrentFilter] = useState<string>('all');
  const [currentOperation, setCurrentOperation] = useState<string>('all');
  const [mapVisible, setMapVisible] = useState(false);
  const [colorBy, setColorBy] = useState<'none' | 'crop' | 'status' | 'operation'>('none');
  const [selectedField, setSelectedField] = useState<ProcessedField | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ProcessedField>>({});
  const [saving, setSaving] = useState(false);

  const filteredFields = useMemo(() => {
    let filtered = initialFields;
    if (currentFilter !== 'all') {
      filtered = filtered.filter((f) => f.status === currentFilter);
    }
    if (currentOperation !== 'all') {
      filtered = filtered.filter((f) => f.operationId?.toString() === currentOperation);
    }
    return filtered;
  }, [initialFields, currentFilter, currentOperation]);

  const mapFields = useMemo(() => {
    return filteredFields.map((f) => ({
      id: f.id,
      name: f.name,
      operation: f.operation,
      operationId: f.operationId,
      acres: f.acres,
      crop: f.crop,
      probe: f.probe,
      status: f.status,
      lat: f.lat,
      lng: f.lng,
    }));
  }, [filteredFields]);

  const handleRowClick = (field: ProcessedField) => {
    setSelectedField(field);
    setEditForm({
      name: field.name,
      acres: field.acres,
      crop: field.crop,
      lat: field.lat,
      lng: field.lng,
    });
    setIsEditing(false);
  };

  const handleClosePanel = () => {
    setSelectedField(null);
    setIsEditing(false);
    setEditForm({});
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!selectedField) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/fields/${selectedField.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          acres: editForm.acres,
          lat: editForm.lat,
          lng: editForm.lng,
        }),
      });
      if (response.ok) {
        window.location.reload();
      } else {
        alert('Failed to save changes');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedField) {
      setEditForm({
        name: selectedField.name,
        acres: selectedField.acres,
        crop: selectedField.crop,
        lat: selectedField.lat,
        lng: selectedField.lng,
      });
    }
    setIsEditing(false);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { class: string; label: string }> = {
      installed: { class: 'installed', label: 'Installed' },
      pending: { class: 'pending', label: 'Pending' },
      assigned: { class: 'pending', label: 'Assigned' },
      repair: { class: 'repair', label: 'Repair' },
      'needs-probe': { class: 'needs-probe', label: 'Needs Probe' },
    };
    const config = statusMap[status] || { class: 'needs-probe', label: status };
    return (
      <span className={`status-badge ${config.class}`}>
        <span className="status-dot"></span>
        {config.label}
      </span>
    );
  };

  const getCropBadge = (crop: string) => {
    const cropClass = crop.toLowerCase() === 'corn' ? 'corn' : 'soybeans';
    return <span className={`crop-badge ${cropClass}`}>{crop}</span>;
  };

  return (
    <>
      <div className="tabs" style={{ marginBottom: '16px' }}>
        <button className={`tab ${currentFilter === 'all' ? 'active' : ''}`} onClick={() => setCurrentFilter('all')}>
          All Fields ({statusCounts.all})
        </button>
        <button className={`tab ${currentFilter === 'needs-probe' ? 'active' : ''}`} onClick={() => setCurrentFilter('needs-probe')}>
          Needs Probe ({statusCounts['needs-probe']})
        </button>
        <button className={`tab ${currentFilter === 'pending' ? 'active' : ''}`} onClick={() => setCurrentFilter('pending')}>
          Ready to Install ({statusCounts.pending})
        </button>
        <button className={`tab ${currentFilter === 'installed' ? 'active' : ''}`} onClick={() => setCurrentFilter('installed')}>
          Installed ({statusCounts.installed})
        </button>
      </div>

      <div className={`fields-container ${mapVisible ? 'map-visible' : ''}`}>
        <div className="fields-list">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">Fields — 2025 Season</h3>
              <div className="table-actions">
                <select value={currentOperation} onChange={(e) => setCurrentOperation(e.target.value)}>
                  <option value="all">All Operations</option>
                  {operations.map((op) => (
                    <option key={op.id} value={op.id.toString()}>{op.name}</option>
                  ))}
                </select>
                <button className={`map-toggle ${mapVisible ? 'active' : ''}`} onClick={() => setMapVisible(!mapVisible)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Map View
                </button>
                {mapVisible && (
                  <select
                    value={colorBy}
                    onChange={(e) => setColorBy(e.target.value as 'none' | 'crop' | 'status' | 'operation')}
                    className="color-by-select"
                  >
                    <option value="none">Color by...</option>
                    <option value="crop">Crop</option>
                    <option value="status">Status</option>
                    <option value="operation">Operation</option>
                  </select>
                )}
                <button className="btn btn-primary">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Field
                </button>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>Operation</th>
                  <th>Acres</th>
                  <th>Crop</th>
                  <th>Probe</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredFields.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No fields found.
                    </td>
                  </tr>
                ) : (
                  filteredFields.map((field) => (
                    <tr key={field.id} style={{ cursor: 'pointer' }} onClick={() => handleRowClick(field)} className={selectedField?.id === field.id ? 'selected' : ''}>
                      <td className="operation-name">{field.name}</td>
                      <td><span style={{ fontSize: '13px' }}>{field.operation}</span></td>
                      <td className="field-count">{field.acres}</td>
                      <td>{getCropBadge(field.crop)}</td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: field.probe ? 'inherit' : 'var(--text-muted)' }}>
                        {field.probe || '—'}
                      </td>
                      <td>{getStatusBadge(field.status)}</td>
                      <td>
                        <button className="action-btn" onClick={(e) => { e.stopPropagation(); handleRowClick(field); }}>
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
        <FieldsMap fields={mapFields} visible={mapVisible} colorBy={colorBy} />
      </div>

      {selectedField && (
        <div className="detail-panel-overlay" onClick={handleClosePanel}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>{isEditing ? 'Edit Field' : selectedField.name}</h3>
              <button className="close-btn" onClick={handleClosePanel}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              {isEditing ? (
                <div className="edit-form">
                  <div className="form-group">
                    <label>Field Name</label>
                    <input type="text" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Acres</label>
                    <input type="number" value={editForm.acres || ''} onChange={(e) => setEditForm({ ...editForm, acres: parseFloat(e.target.value) })} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Latitude</label>
                      <input type="number" step="0.000001" value={editForm.lat || ''} onChange={(e) => setEditForm({ ...editForm, lat: parseFloat(e.target.value) })} />
                    </div>
                    <div className="form-group">
                      <label>Longitude</label>
                      <input type="number" step="0.000001" value={editForm.lng || ''} onChange={(e) => setEditForm({ ...editForm, lng: parseFloat(e.target.value) })} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="detail-info">
                  <div className="detail-row">
                    <span className="detail-label">Operation</span>
                    <span className="detail-value">{selectedField.operation}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Acres</span>
                    <span className="detail-value">{selectedField.acres}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Crop</span>
                    <span className="detail-value">{getCropBadge(selectedField.crop)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Probe</span>
                    <span className="detail-value" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {selectedField.probe || '—'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Status</span>
                    <span className="detail-value">{getStatusBadge(selectedField.status)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Location</span>
                    <span className="detail-value">
                      {selectedField.lat != null && selectedField.lng != null ? (
                        <a 
                          href={`https://www.google.com/maps/place/${selectedField.lat},${selectedField.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent-green)' }}
                        >
                          {Number(selectedField.lat).toFixed(6)}, {Number(selectedField.lng).toFixed(6)}
                        </a>
                      ) : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="detail-panel-footer">
              {isEditing ? (
                <>
                  <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={handleClosePanel}>Close</button>
                  <button className="btn btn-primary" onClick={handleEdit}>Edit Field</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
