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
  const [showProbeAssign, setShowProbeAssign] = useState(false);
  const [selectedProbeId, setSelectedProbeId] = useState<string>('');
  const [savingProbe, setSavingProbe] = useState(false);
  const [showAddSeasonModal, setShowAddSeasonModal] = useState(false);
  const [addSeasonForm, setAddSeasonForm] = useState({
    season: '2026',
    crop: '',
    service_type: '',
    antenna_type: '',
  });
  const [savingSeason, setSavingSeason] = useState(false);
  const [showRolloverModal, setShowRolloverModal] = useState(false);
  const [rolloverForm, setRolloverForm] = useState({
    fromSeason: '2025',
    toSeason: '2026',
    copyProbes: false,
  });
  const [rollingOver, setRollingOver] = useState(false);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Filter fields by current season first (or show all unique fields)
  const seasonFields = useMemo(() => {
    if (currentSeason === 'all') {
      // Show unique fields (dedupe by field ID, keep most recent season)
      const fieldMap = new Map<number, ProcessedField>();
      // Sort by season descending so we keep the most recent
      const sorted = [...fields].sort((a, b) => (b.season || '').localeCompare(a.season || ''));
      sorted.forEach((f) => {
        if (!fieldMap.has(f.id)) {
          fieldMap.set(f.id, f);
        }
      });
      return Array.from(fieldMap.values());
    }
    return fields.filter((f) => f.season === currentSeason || (!f.season && currentSeason === ''));
  }, [fields, currentSeason]);

  // Calculate status counts for current season
  const statusCounts = useMemo(() => {
    const normalizeStatus = (status: string | undefined | null) => (status || 'unassigned').toLowerCase().replace(' ', '-');
    return {
      all: seasonFields.length,
      'unassigned': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'unassigned').length,
      'assigned': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'assigned').length,
      'installed': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'installed').length,
    };
  }, [seasonFields]);

  // Calculate fields that can be rolled over (exist in fromSeason but not in toSeason)
  const rolloverStats = useMemo(() => {
    const fromFields = fields.filter((f) => f.season === rolloverForm.fromSeason);
    const toFieldIds = new Set(
      fields.filter((f) => f.season === rolloverForm.toSeason).map((f) => f.id)
    );
    const fieldsToRollover = fromFields.filter((f) => !toFieldIds.has(f.id));
    return {
      fromCount: fromFields.length,
      toCount: fields.filter((f) => f.season === rolloverForm.toSeason).length,
      canRollover: fieldsToRollover.length,
      fieldsToRollover,
    };
  }, [fields, rolloverForm.fromSeason, rolloverForm.toSeason]);

  const filteredFields = useMemo(() => {
    let filtered = seasonFields;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((f) =>
        (f.name || '').toLowerCase().includes(query) ||
        (f.operation || '').toLowerCase().includes(query) ||
        (f.crop || '').toLowerCase().includes(query) ||
        f.probe?.toLowerCase().includes(query)
      );
    }

    if (currentFilter !== 'all') {
      const normalizeStatus = (status: string | undefined | null) => (status || 'unassigned').toLowerCase().replace(' ', '-');
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
        case 'name': aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase(); break;
        case 'operation': aVal = (a.operation || '').toLowerCase(); bVal = (b.operation || '').toLowerCase(); break;
        case 'acres': aVal = a.acres || 0; bVal = b.acres || 0; break;
        case 'crop': aVal = (a.crop || '').toLowerCase(); bVal = (b.crop || '').toLowerCase(); break;
        case 'status': aVal = (a.probeStatus || '').toLowerCase(); bVal = (b.probeStatus || '').toLowerCase(); break;
        default: aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase();
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
      status: (f.probeStatus || 'unassigned').toLowerCase().replace(' ', '-'),
      lat: f.lat,
      lng: f.lng,
    }));
  }, [filteredFields]);

  // Sort probes by owner operation for the dropdown
  const sortedProbes = useMemo(() => {
    return [...probes].sort((a, b) => {
      // Sort by owner operation first, then by serial number
      const opCompare = (a.ownerOperation || '').localeCompare(b.ownerOperation || '');
      if (opCompare !== 0) return opCompare;
      return (a.serialNumber || '').localeCompare(b.serialNumber || '');
    });
  }, [probes]);

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
    setShowProbeAssign(false);
    setSelectedProbeId(field.probeId?.toString() || '');
  };

  const handleClosePanel = () => {
    setSelectedField(null);
    setIsEditing(false);
    setEditForm({});
    setShowProbeAssign(false);
    setSelectedProbeId('');
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

  const handleAssignProbe = async () => {
    if (!selectedField || !selectedField.fieldSeasonId) {
      alert('Cannot assign probe: No field season found');
      return;
    }
    setSavingProbe(true);
    try {
      const probeId = selectedProbeId ? parseInt(selectedProbeId, 10) : null;
      const response = await fetch(`/api/field-seasons/${selectedField.fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          probe: probeId,
          probe_status: probeId ? 'Assigned' : 'Unassigned',
        }),
      });
      if (response.ok) {
        setShowProbeAssign(false);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to assign probe');
      }
    } catch (error) {
      console.error('Assign probe error:', error);
      alert('Failed to assign probe');
    } finally {
      setSavingProbe(false);
    }
  };

  const handleAddSeason = async () => {
    if (!selectedField) return;
    if (!addSeasonForm.season) {
      alert('Season is required');
      return;
    }
    setSavingSeason(true);
    try {
      const response = await fetch('/api/field-seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: selectedField.id,
          season: addSeasonForm.season,
          crop: addSeasonForm.crop || undefined,
          service_type: addSeasonForm.service_type || undefined,
          antenna_type: addSeasonForm.antenna_type || undefined,
        }),
      });
      if (response.ok) {
        setShowAddSeasonModal(false);
        setAddSeasonForm({ season: '2026', crop: '', service_type: '', antenna_type: '' });
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create season');
      }
    } catch (error) {
      console.error('Add season error:', error);
      alert('Failed to create season');
    } finally {
      setSavingSeason(false);
    }
  };

  const handleRollover = async () => {
    if (rolloverStats.canRollover === 0) {
      alert('No fields to roll over');
      return;
    }

    if (!confirm(`This will create ${rolloverStats.canRollover} new field season entries for ${rolloverForm.toSeason}. Continue?`)) {
      return;
    }

    setRollingOver(true);
    try {
      const items = rolloverStats.fieldsToRollover.map((f) => ({
        field: f.id,
        season: rolloverForm.toSeason,
        service_type: f.serviceType || undefined,
        antenna_type: f.antennaType || undefined,
        probe: f.probeId || undefined,
        copy_probe: rolloverForm.copyProbes,
      }));

      const response = await fetch('/api/field-seasons/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Successfully created ${result.created} field seasons for ${rolloverForm.toSeason}!`);
        setShowRolloverModal(false);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to roll over fields');
      }
    } catch (error) {
      console.error('Rollover error:', error);
      alert('Failed to roll over fields');
    } finally {
      setRollingOver(false);
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

  const getStatusBadge = (status: string | undefined | null) => {
    const safeStatus = status || 'Unassigned';
    const normalized = safeStatus.toLowerCase().replace(' ', '-');
    const statusMap: Record<string, { class: string; label: string }> = {
      installed: { class: 'installed', label: 'Installed' },
      assigned: { class: 'pending', label: 'Assigned' },
      unassigned: { class: 'needs-probe', label: 'Unassigned' },
      rma: { class: 'repair', label: 'RMA' },
    };
    const config = statusMap[normalized] || { class: 'needs-probe', label: safeStatus };
    return (
      <span className={`status-badge ${config.class}`}>
        <span className="status-dot"></span>
        {config.label}
      </span>
    );
  };

  const getCropBadge = (crop: string | undefined | null) => {
    const safeCrop = crop || 'Unknown';
    const cropLower = safeCrop.toLowerCase();
    let cropClass = 'other';
    if (cropLower === 'corn' || cropLower === 'seed corn') cropClass = 'corn';
    else if (cropLower === 'soybeans') cropClass = 'soybeans';
    else if (cropLower === 'wheat') cropClass = 'wheat';
    return <span className={`crop-badge ${cropClass}`}>{safeCrop}</span>;
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
            <option value="all">All Seasons</option>
            {availableSeasons.map((s) => (
              <option key={s} value={s}>{s} Season</option>
            ))}
          </select>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setShowRolloverModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Copy to New Season
          </button>
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
                <h3 className="table-title">Fields — {currentSeason === 'all' ? 'All Seasons' : `${currentSeason} Season`}</h3>
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
                        No fields found{currentSeason !== 'all' ? ` for ${currentSeason} season` : ''}.
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
                  <div className="empty-state">No fields found{currentSeason !== 'all' ? ` for ${currentSeason} season` : ''}.</div>
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
                      <span className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {showProbeAssign ? (
                          <>
                            <select
                              value={selectedProbeId}
                              onChange={(e) => setSelectedProbeId(e.target.value)}
                              style={{ flex: 1 }}
                            >
                              <option value="">— Unassign Probe —</option>
                              {sortedProbes.map((p) => (
                                <option key={p.id} value={p.id}>
                                  #{p.serialNumber} ({p.ownerOperation})
                                </option>
                              ))}
                            </select>
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={handleAssignProbe}
                              disabled={savingProbe}
                            >
                              {savingProbe ? '...' : 'Save'}
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={() => {
                                setShowProbeAssign(false);
                                setSelectedProbeId(selectedField.probeId?.toString() || '');
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {selectedField.probe || '—'}
                            {selectedField.fieldSeasonId && (
                              <button
                                className="action-btn"
                                title="Change probe"
                                onClick={() => setShowProbeAssign(true)}
                                style={{ marginLeft: '4px' }}
                              >
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Status</span>
                      <span className="detail-value">{getStatusBadge(selectedField.probeStatus)}</span>
                    </div>
                    {selectedField.lat && selectedField.lng && (
                      <div className="detail-row">
                        <span className="detail-label">Location</span>
                        <span className="detail-value">{Number(selectedField.lat).toFixed(4)}, {Number(selectedField.lng).toFixed(4)}</span>
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
                    <button
                      className="btn btn-secondary"
                      onClick={() => setShowAddSeasonModal(true)}
                    >
                      Add Season
                    </button>
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

        {/* Add Season Modal */}
        {showAddSeasonModal && selectedField && (
          <div className="detail-panel-overlay" onClick={() => setShowAddSeasonModal(false)}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>Add Season for {selectedField.name}</h3>
                <button className="close-btn" onClick={() => setShowAddSeasonModal(false)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                <div className="edit-form">
                  <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    Create a new season entry for this field. This will allow you to assign a probe and track service for the new season.
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Season *</label>
                      <select value={addSeasonForm.season} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, season: e.target.value })}>
                        <option value="2027">2027</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Crop</label>
                      <select value={addSeasonForm.crop} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, crop: e.target.value })}>
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
                      <select value={addSeasonForm.service_type} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, service_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Full Service">Full Service</option>
                        <option value="DIY">DIY</option>
                        <option value="VRS">VRS</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Antenna Type</label>
                      <select value={addSeasonForm.antenna_type} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, antenna_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Short">Short</option>
                        <option value="Tall">Tall</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div className="detail-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowAddSeasonModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddSeason} disabled={savingSeason}>
                  {savingSeason ? 'Creating...' : 'Create Season'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rollover Modal */}
        {showRolloverModal && (
          <div className="detail-panel-overlay" onClick={() => setShowRolloverModal(false)}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>Copy Fields to New Season</h3>
                <button className="close-btn" onClick={() => setShowRolloverModal(false)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                <div className="edit-form">
                  <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    Copy all fields from one season to another. This will create new season entries for fields that don&apos;t already exist in the target season.
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>From Season</label>
                      <select
                        value={rolloverForm.fromSeason}
                        onChange={(e) => setRolloverForm({ ...rolloverForm, fromSeason: e.target.value })}
                      >
                        {availableSeasons.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>To Season</label>
                      <select
                        value={rolloverForm.toSeason}
                        onChange={(e) => setRolloverForm({ ...rolloverForm, toSeason: e.target.value })}
                      >
                        <option value="2027">2027</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                      </select>
                    </div>
                  </div>

                  <div style={{
                    background: 'var(--bg-tertiary)',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span>Fields in {rolloverForm.fromSeason}:</span>
                      <strong>{rolloverStats.fromCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span>Already in {rolloverForm.toSeason}:</span>
                      <strong>{rolloverStats.toCount}</strong>
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--border)',
                      color: 'var(--accent-green)'
                    }}>
                      <span>Will be copied:</span>
                      <strong>{rolloverStats.canRollover}</strong>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={rolloverForm.copyProbes}
                        onChange={(e) => setRolloverForm({ ...rolloverForm, copyProbes: e.target.checked })}
                        style={{ width: '18px', height: '18px' }}
                      />
                      Also copy probe assignments
                    </label>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      If checked, probes from the source season will be assigned to the same fields in the new season.
                    </p>
                  </div>
                </div>
              </div>
              <div className="detail-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowRolloverModal(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleRollover}
                  disabled={rollingOver || rolloverStats.canRollover === 0}
                >
                  {rollingOver ? 'Copying...' : `Copy ${rolloverStats.canRollover} Fields`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
