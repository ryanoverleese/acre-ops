'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { ProcessedField, OperationOption, BillingEntityOption } from './page';

const FieldsMap = dynamic(() => import('@/components/FieldsMap'), {
  ssr: false,
  loading: () => <div className="fields-map" style={{ display: 'block' }}><div className="loading"><div className="loading-spinner"></div>Loading map...</div></div>,
});

interface FieldsClientProps {
  initialFields: ProcessedField[];
  operations: OperationOption[];
  billingEntities: BillingEntityOption[];
  statusCounts: {
    all: number;
    'needs-probe': number;
    pending: number;
    installed: number;
    repair: number;
  };
}

const initialAddForm = {
  billing_entity: '',
  name: '',
  acres: '',
  pivot_acres: '',
  billed_acres: '',
  lat: '',
  lng: '',
  water_source: '',
  fuel_source: '',
  notes: '',
  season: '2026',
  crop: '',
  service_type: '',
  antenna_type: '',
};

export default function FieldsClient({
  initialFields,
  operations,
  billingEntities,
  statusCounts,
}: FieldsClientProps) {
  const [fields, setFields] = useState(initialFields);
  const [currentFilter, setCurrentFilter] = useState<string>('all');
  const [currentOperation, setCurrentOperation] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapVisible, setMapVisible] = useState(false);
  const [colorBy, setColorBy] = useState<'none' | 'crop' | 'status' | 'operation'>('none');
  const [selectedField, setSelectedField] = useState<ProcessedField | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ProcessedField>>({});
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(initialAddForm);

  const filteredFields = useMemo(() => {
    let filtered = fields;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((f) =>
        f.name.toLowerCase().includes(query) ||
        f.operation.toLowerCase().includes(query) ||
        f.crop.toLowerCase().includes(query) ||
        f.probe?.toLowerCase().includes(query)
      );
    }
    if (currentFilter !== 'all') {
      filtered = filtered.filter((f) => f.status === currentFilter);
    }
    if (currentOperation !== 'all') {
      filtered = filtered.filter((f) => f.operationId?.toString() === currentOperation);
    }
    return filtered;
  }, [fields, searchQuery, currentFilter, currentOperation]);

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
      pivotAcres: field.pivotAcres,
      billedAcres: field.billedAcres,
      crop: field.crop,
      lat: field.lat,
      lng: field.lng,
      waterSource: field.waterSource,
      fuelSource: field.fuelSource,
      notes: field.notes,
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
          pivot_acres: editForm.pivotAcres,
          billed_acres: editForm.billedAcres,
          lat: editForm.lat,
          lng: editForm.lng,
          water_source: editForm.waterSource || null,
          fuel_source: editForm.fuelSource || null,
          notes: editForm.notes || null,
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
        pivotAcres: selectedField.pivotAcres,
        billedAcres: selectedField.billedAcres,
        crop: selectedField.crop,
        lat: selectedField.lat,
        lng: selectedField.lng,
        waterSource: selectedField.waterSource,
        fuelSource: selectedField.fuelSource,
        notes: selectedField.notes,
      });
    }
    setIsEditing(false);
  };

  const handleDelete = async (field: ProcessedField) => {
    if (!confirm(`Delete field "${field.name}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/fields/${field.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setFields(fields.filter((f) => f.id !== field.id));
        if (selectedField?.id === field.id) {
          setSelectedField(null);
          setIsEditing(false);
        }
      } else {
        alert('Failed to delete field');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete field');
    }
  };

  const handleAddField = async () => {
    if (!addForm.billing_entity) {
      alert('Billing Entity is required');
      return;
    }
    if (!addForm.name.trim()) {
      alert('Field name is required');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_entity: parseInt(addForm.billing_entity),
          name: addForm.name,
          acres: addForm.acres ? parseFloat(addForm.acres) : undefined,
          pivot_acres: addForm.pivot_acres ? parseFloat(addForm.pivot_acres) : undefined,
          billed_acres: addForm.billed_acres ? parseFloat(addForm.billed_acres) : undefined,
          lat: addForm.lat ? parseFloat(addForm.lat) : undefined,
          lng: addForm.lng ? parseFloat(addForm.lng) : undefined,
          water_source: addForm.water_source || undefined,
          fuel_source: addForm.fuel_source || undefined,
          notes: addForm.notes || undefined,
          season: parseInt(addForm.season),
          crop: addForm.crop || undefined,
          service_type: addForm.service_type || undefined,
          antenna_type: addForm.antenna_type || undefined,
        }),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm(initialAddForm);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create field');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create field');
    } finally {
      setSaving(false);
    }
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
                <div className="search-box" style={{ width: '200px' }}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search fields..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
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
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
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
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="action-btn" title="Edit" onClick={(e) => { e.stopPropagation(); handleRowClick(field); }}>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button className="action-btn" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(field); }}>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
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
                  <div className="form-row">
                    <div className="form-group">
                      <label>Acres</label>
                      <input type="number" value={editForm.acres || ''} onChange={(e) => setEditForm({ ...editForm, acres: parseFloat(e.target.value) })} />
                    </div>
                    <div className="form-group">
                      <label>Pivot Acres</label>
                      <input type="number" value={editForm.pivotAcres || ''} onChange={(e) => setEditForm({ ...editForm, pivotAcres: parseFloat(e.target.value) })} />
                    </div>
                    <div className="form-group">
                      <label>Billed Acres</label>
                      <input type="number" value={editForm.billedAcres || ''} onChange={(e) => setEditForm({ ...editForm, billedAcres: parseFloat(e.target.value) })} />
                    </div>
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
                  <div className="form-row">
                    <div className="form-group">
                      <label>Water Source</label>
                      <select value={editForm.waterSource || ''} onChange={(e) => setEditForm({ ...editForm, waterSource: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Well">Well</option>
                        <option value="Canal">Canal</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Fuel Source</label>
                      <select value={editForm.fuelSource || ''} onChange={(e) => setEditForm({ ...editForm, fuelSource: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Electric">Electric</option>
                        <option value="Natural Gas">Natural Gas</option>
                        <option value="Diesel">Diesel</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <textarea value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Enter notes..." rows={2} />
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

      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" style={{ width: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add New Field</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-section-title">Field Information</div>
                <div className="form-group">
                  <label>Billing Entity *</label>
                  <select
                    value={addForm.billing_entity}
                    onChange={(e) => setAddForm({ ...addForm, billing_entity: e.target.value })}
                  >
                    <option value="">Select billing entity...</option>
                    {billingEntities.map((be) => (
                      <option key={be.id} value={be.id}>{be.name} ({be.operationName})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Field Name *</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="Enter field name"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Acres</label>
                    <input
                      type="number"
                      value={addForm.acres}
                      onChange={(e) => setAddForm({ ...addForm, acres: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Pivot Acres</label>
                    <input
                      type="number"
                      value={addForm.pivot_acres}
                      onChange={(e) => setAddForm({ ...addForm, pivot_acres: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Billed Acres</label>
                    <input
                      type="number"
                      value={addForm.billed_acres}
                      onChange={(e) => setAddForm({ ...addForm, billed_acres: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={addForm.lat}
                      onChange={(e) => setAddForm({ ...addForm, lat: e.target.value })}
                      placeholder="41.234567"
                    />
                  </div>
                  <div className="form-group">
                    <label>Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={addForm.lng}
                      onChange={(e) => setAddForm({ ...addForm, lng: e.target.value })}
                      placeholder="-96.123456"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Water Source</label>
                    <select
                      value={addForm.water_source}
                      onChange={(e) => setAddForm({ ...addForm, water_source: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Well">Well</option>
                      <option value="Canal">Canal</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fuel Source</label>
                    <select
                      value={addForm.fuel_source}
                      onChange={(e) => setAddForm({ ...addForm, fuel_source: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Electric">Electric</option>
                      <option value="Natural Gas">Natural Gas</option>
                      <option value="Diesel">Diesel</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={addForm.notes}
                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                    placeholder="Enter notes..."
                    rows={2}
                  />
                </div>

                <div className="form-section-title" style={{ marginTop: '16px' }}>Season Information</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Season</label>
                    <select
                      value={addForm.season}
                      onChange={(e) => setAddForm({ ...addForm, season: e.target.value })}
                    >
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                      <option value="2027">2027</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Crop</label>
                    <select
                      value={addForm.crop}
                      onChange={(e) => setAddForm({ ...addForm, crop: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Corn">Corn</option>
                      <option value="Soybeans">Soybeans</option>
                      <option value="Wheat">Wheat</option>
                      <option value="Seed Corn">Seed Corn</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Service Type</label>
                    <select
                      value={addForm.service_type}
                      onChange={(e) => setAddForm({ ...addForm, service_type: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Full Service">Full Service</option>
                      <option value="DIY">DIY</option>
                      <option value="VRS">VRS</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Antenna Type</label>
                    <select
                      value={addForm.antenna_type}
                      onChange={(e) => setAddForm({ ...addForm, antenna_type: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Short">Short</option>
                      <option value="Tall">Tall</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddField} disabled={saving}>
                {saving ? 'Creating...' : 'Create Field'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
