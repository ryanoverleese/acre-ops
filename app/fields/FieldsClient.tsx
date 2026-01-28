'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { ProcessedField, OperationOption, BillingEntityOption, ProbeOption } from './page';

const FieldsMap = dynamic(() => import('@/components/FieldsMap'), {
  ssr: false,
  loading: () => <div className="fields-map" style={{ display: 'block' }}><div className="loading"><div className="loading-spinner"></div>Loading map...</div></div>,
});

interface FieldsClientProps {
  initialFields: ProcessedField[];
  operations: OperationOption[];
  billingEntities: BillingEntityOption[];
  probes: ProbeOption[];
  availableSeasons: string[];
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
  probes,
  availableSeasons,
}: FieldsClientProps) {
  const [fields] = useState(initialFields);
  const [currentSeason, setCurrentSeason] = useState(availableSeasons[0] || '2026');
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
  const [addForm, setAddForm] = useState({ ...initialAddForm, season: currentSeason });
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Filter fields by current season first
  const seasonFields = useMemo(() => {
    return fields.filter((f) => f.season === currentSeason || (!f.season && currentSeason === ''));
  }, [fields, currentSeason]);

  // Calculate status counts for current season
  const statusCounts = useMemo(() => {
    const normalizeStatus = (status: string) => status.toLowerCase().replace(' ', '-');
    return {
      all: seasonFields.length,
      'unassigned': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'unassigned').length,
      'assigned': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'assigned').length,
      'installed': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'installed').length,
    };
  }, [seasonFields]);

  const filteredFields = useMemo(() => {
    let filtered = seasonFields;

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
      const normalizeStatus = (status: string) => status.toLowerCase().replace(' ', '-');
      filtered = filtered.filter((f) => normalizeStatus(f.probeStatus) === currentFilter);
    }

    if (currentOperation !== 'all') {
      filtered = filtered.filter((f) => f.operationId?.toString() === currentOperation);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortColumn) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'operation': aVal = a.operation.toLowerCase(); bVal = b.operation.toLowerCase(); break;
        case 'acres': aVal = a.acres; bVal = b.acres; break;
        case 'crop': aVal = a.crop.toLowerCase(); bVal = b.crop.toLowerCase(); break;
        case 'status': aVal = a.probeStatus.toLowerCase(); bVal = b.probeStatus.toLowerCase(); break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [seasonFields, searchQuery, currentFilter, currentOperation, sortColumn, sortDirection]);

  const mapFields = useMemo(() => {
    return filteredFields.map((f) => ({
      id: f.id,
      name: f.name,
      operation: f.operation,
      operationId: f.operationId,
      acres: f.acres,
      crop: f.crop,
      probe: f.probe,
      status: f.probeStatus.toLowerCase().replace(' ', '-'),
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

  const handleDelete = async () => {
    if (!selectedField) return;
    if (!confirm(`Delete field "${selectedField.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`/api/fields/${selectedField.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        window.location.reload();
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
          billing_entity: parseInt(addForm.billing_entity, 10),
          name: addForm.name,
          acres: addForm.acres ? parseFloat(addForm.acres) : undefined,
          pivot_acres: addForm.pivot_acres ? parseFloat(addForm.pivot_acres) : undefined,
          billed_acres: addForm.billed_acres ? parseFloat(addForm.billed_acres) : undefined,
          lat: addForm.lat ? parseFloat(addForm.lat) : undefined,
          lng: addForm.lng ? parseFloat(addForm.lng) : undefined,
          water_source: addForm.water_source || undefined,
          fuel_source: addForm.fuel_source || undefined,
          notes: addForm.notes || undefined,
          season: addForm.season,
          crop: addForm.crop || undefined,
          service_type: addForm.service_type || undefined,
          antenna_type: addForm.antenna_type || undefined,
        }),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm({ ...initialAddForm, season: currentSeason });
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
    const normalized = status.toLowerCase().replace(' ', '-');
    const statusMap: Record<string, { class: string; label: string }> = {
      installed: { class: 'installed', label: 'Installed' },
      assigned: { class: 'pending', label: 'Assigned' },
      unassigned: { class: 'needs-probe', label: 'Unassigned' },
      rma: { class: 'repair', label: 'RMA' },
    };
    const config = statusMap[normalized] || { class: 'needs-probe', label: status };
    return (
      <span className={`status-badge ${config.class}`}>
        <span className="status-dot"></span>
        {config.label}
      </span>
    );
  };

  const getCropBadge = (crop: string) => {
    const cropLower = crop.toLowerCase();
    let cropClass = 'other';
    if (cropLower === 'corn' || cropLower === 'seed corn') cropClass = 'corn';
    else if (cropLower === 'soybeans') cropClass = 'soybeans';
    else if (cropLower === 'wheat') cropClass = 'wheat';
    return <span className={`crop-badge ${cropClass}`}>{crop}</span>;
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Fields</h2>
          <select
            value={currentSeason}
            onChange={(e) => setCurrentSeason(e.target.value)}
            className="season-selector"
            style={{
              background: 'var(--accent-green-dim)',
              color: 'var(--accent-green)',
              border: 'none',
              padding: '4px 12px',
              borderRadius: '16px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {availableSeasons.map((s) => (
              <option key={s} value={s}>{s} Season</option>
            ))}
          </select>
        </div>
        <div className="header-right">
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Field
          </button>
        </div>
      </header>

      <div className="content">
        <div className="tabs" style={{ marginBottom: '16px' }}>
          <button className={`tab ${currentFilter === 'all' ? 'active' : ''}`} onClick={() => setCurrentFilter('all')}>
            All Fields ({statusCounts.all})
          </button>
          <button className={`tab ${currentFilter === 'unassigned' ? 'active' : ''}`} onClick={() => setCurrentFilter('unassigned')}>
            Unassigned ({statusCounts['unassigned']})
          </button>
          <button className={`tab ${currentFilter === 'assigned' ? 'active' : ''}`} onClick={() => setCurrentFilter('assigned')}>
            Assigned ({statusCounts['assigned']})
          </button>
          <button className={`tab ${currentFilter === 'installed' ? 'active' : ''}`} onClick={() => setCurrentFilter('installed')}>
            Installed ({statusCounts['installed']})
          </button>
        </div>

        <div className={`fields-container ${mapVisible ? 'map-visible' : ''}`}>
          <div className="fields-list">
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Fields — {currentSeason} Season</h3>
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
                </div>
              </div>
              <table className="desktop-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('name')}>
                      Field Name
                      {sortColumn === 'name' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort('operation')}>
                      Operation
                      {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort('acres')}>
                      Acres
                      {sortColumn === 'acres' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </th>
                    <th className="sortable" onClick={() => handleSort('crop')}>
                      Crop
                      {sortColumn === 'crop' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </th>
                    <th>Probe</th>
                    <th className="sortable" onClick={() => handleSort('status')}>
                      Status
                      {sortColumn === 'status' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFields.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No fields found for {currentSeason} season.
                      </td>
                    </tr>
                  ) : (
                    filteredFields.map((field) => (
                      <tr key={`${field.id}-${field.fieldSeasonId}`} onClick={() => handleRowClick(field)} style={{ cursor: 'pointer' }}>
                        <td className="operation-name">{field.name}</td>
                        <td style={{ fontSize: '13px' }}>{field.operation}</td>
                        <td className="field-count">{field.acres}</td>
                        <td>{getCropBadge(field.crop)}</td>
                        <td>
                          {field.probe ? (
                            <code style={{ fontSize: '13px' }}>{field.probe}</code>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>{getStatusBadge(field.probeStatus)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button className="action-btn" title="Edit" onClick={() => handleRowClick(field)}>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="mobile-cards">
                {filteredFields.length === 0 ? (
                  <div className="empty-state">No fields found for {currentSeason} season.</div>
                ) : (
                  filteredFields.map((field) => (
                    <div key={`${field.id}-${field.fieldSeasonId}`} className="mobile-card" onClick={() => handleRowClick(field)}>
                      <div className="mobile-card-header">
                        <span className="mobile-card-title">{field.name}</span>
                        {getStatusBadge(field.probeStatus)}
                      </div>
                      <div className="mobile-card-body">
                        <div className="mobile-card-row"><span>Operation:</span> {field.operation}</div>
                        <div className="mobile-card-row"><span>Acres:</span> {field.acres}</div>
                        <div className="mobile-card-row"><span>Crop:</span> {field.crop}</div>
                        {field.probe && <div className="mobile-card-row"><span>Probe:</span> {field.probe}</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {mapVisible && (
            <div className="fields-map">
              <FieldsMap fields={mapFields} visible={mapVisible} colorBy={colorBy} />
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedField && (
          <div className="detail-panel-overlay" onClick={handleClosePanel}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>{selectedField.name}</h3>
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
                        <input type="number" value={editForm.acres || ''} onChange={(e) => setEditForm({ ...editForm, acres: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="form-group">
                        <label>Pivot Acres</label>
                        <input type="number" value={editForm.pivotAcres || ''} onChange={(e) => setEditForm({ ...editForm, pivotAcres: parseFloat(e.target.value) || undefined })} />
                      </div>
                      <div className="form-group">
                        <label>Billed Acres</label>
                        <input type="number" value={editForm.billedAcres || ''} onChange={(e) => setEditForm({ ...editForm, billedAcres: parseFloat(e.target.value) || undefined })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Latitude</label>
                        <input type="number" step="any" value={editForm.lat || ''} onChange={(e) => setEditForm({ ...editForm, lat: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="form-group">
                        <label>Longitude</label>
                        <input type="number" step="any" value={editForm.lng || ''} onChange={(e) => setEditForm({ ...editForm, lng: parseFloat(e.target.value) || 0 })} />
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
                      <textarea value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
                    </div>
                  </div>
                ) : (
                  <div className="detail-info">
                    <div className="detail-row">
                      <span className="detail-label">Operation</span>
                      <span className="detail-value">{selectedField.operation}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Season</span>
                      <span className="detail-value">{selectedField.season || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Acres</span>
                      <span className="detail-value">{selectedField.acres}</span>
                    </div>
                    {selectedField.pivotAcres && (
                      <div className="detail-row">
                        <span className="detail-label">Pivot Acres</span>
                        <span className="detail-value">{selectedField.pivotAcres}</span>
                      </div>
                    )}
                    <div className="detail-row">
                      <span className="detail-label">Crop</span>
                      <span className="detail-value">{getCropBadge(selectedField.crop)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Service Type</span>
                      <span className="detail-value">{selectedField.serviceType || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Probe</span>
                      <span className="detail-value">{selectedField.probe || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Status</span>
                      <span className="detail-value">{getStatusBadge(selectedField.probeStatus)}</span>
                    </div>
                    {selectedField.lat && selectedField.lng && (
                      <div className="detail-row">
                        <span className="detail-label">Location</span>
                        <span className="detail-value">{selectedField.lat.toFixed(4)}, {selectedField.lng.toFixed(4)}</span>
                      </div>
                    )}
                    {selectedField.waterSource && (
                      <div className="detail-row">
                        <span className="detail-label">Water Source</span>
                        <span className="detail-value">{selectedField.waterSource}</span>
                      </div>
                    )}
                    {selectedField.fuelSource && (
                      <div className="detail-row">
                        <span className="detail-label">Fuel Source</span>
                        <span className="detail-value">{selectedField.fuelSource}</span>
                      </div>
                    )}
                    {selectedField.notes && (
                      <div className="detail-row">
                        <span className="detail-label">Notes</span>
                        <span className="detail-value">{selectedField.notes}</span>
                      </div>
                    )}
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
                    <button className="btn btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={handleDelete}>Delete</button>
                    <button className="btn btn-primary" onClick={handleEdit}>Edit</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Field Modal */}
        {showAddModal && (
          <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
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
                  <div className="form-group">
                    <label>Billing Entity *</label>
                    <select value={addForm.billing_entity} onChange={(e) => setAddForm({ ...addForm, billing_entity: e.target.value })}>
                      <option value="">Select billing entity...</option>
                      {billingEntities.map((be) => (
                        <option key={be.id} value={be.id}>{be.name} ({be.operationName})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Field Name *</label>
                    <input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Enter field name" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Acres</label>
                      <input type="number" value={addForm.acres} onChange={(e) => setAddForm({ ...addForm, acres: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Pivot Acres</label>
                      <input type="number" value={addForm.pivot_acres} onChange={(e) => setAddForm({ ...addForm, pivot_acres: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Billed Acres</label>
                      <input type="number" value={addForm.billed_acres} onChange={(e) => setAddForm({ ...addForm, billed_acres: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Latitude</label>
                      <input type="number" step="any" value={addForm.lat} onChange={(e) => setAddForm({ ...addForm, lat: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Longitude</label>
                      <input type="number" step="any" value={addForm.lng} onChange={(e) => setAddForm({ ...addForm, lng: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Water Source</label>
                      <select value={addForm.water_source} onChange={(e) => setAddForm({ ...addForm, water_source: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Well">Well</option>
                        <option value="Canal">Canal</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Fuel Source</label>
                      <select value={addForm.fuel_source} onChange={(e) => setAddForm({ ...addForm, fuel_source: e.target.value })}>
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
                    <textarea value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} rows={2} />
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
                  <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Season Info ({addForm.season})</h4>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Season</label>
                      <select value={addForm.season} onChange={(e) => setAddForm({ ...addForm, season: e.target.value })}>
                        <option value="2027">2027</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Crop</label>
                      <select value={addForm.crop} onChange={(e) => setAddForm({ ...addForm, crop: e.target.value })}>
                        <option value="">Select crop...</option>
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
                      <select value={addForm.service_type} onChange={(e) => setAddForm({ ...addForm, service_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Full Service">Full Service</option>
                        <option value="DIY">DIY</option>
                        <option value="VRS">VRS</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Antenna Type</label>
                      <select value={addForm.antenna_type} onChange={(e) => setAddForm({ ...addForm, antenna_type: e.target.value })}>
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
      </div>
    </>
  );
}
