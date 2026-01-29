'use client';

import { useState, useMemo } from 'react';

export interface ProcessedProbe {
  id: number;
  serialNumber: string;
  brand: string;
  status: string;
  rackLocation: string;
  ownerBillingEntity: string;
  ownerBillingEntityId?: number;
  yearNew?: number;
  notes?: string;
}

export interface BillingEntityOption {
  id: number;
  name: string;
}

interface ProbesClientProps {
  probes: ProcessedProbe[];
  billingEntities: BillingEntityOption[];
  statusCounts: Record<string, number>;
}

const BRAND_OPTIONS = [
  'CropX V4',
  'Sentek 36"/CropX Gateway',
  'Sentek 48" Blue/Sentek Rocket',
];

const STATUS_OPTIONS = [
  'In Stock',
  'Assigned',
  'Installed',
  'RMA',
  'Retired',
];

const initialAddForm = {
  serial_number: '',
  brand: '',
  owner_billing_entity: '',
  year_new: '',
  status: 'In Stock',
  rack_location: '',
  notes: '',
};

export default function ProbesClient({ probes: initialProbes, billingEntities, statusCounts }: ProbesClientProps) {
  const [probes, setProbes] = useState(initialProbes);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProbe, setSelectedProbe] = useState<ProcessedProbe | null>(null);
  const [addForm, setAddForm] = useState(initialAddForm);
  const [editForm, setEditForm] = useState(initialAddForm);
  const [saving, setSaving] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('serialNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredProbes = useMemo(() => {
    let filtered = probes;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (probe) =>
          probe.serialNumber.toLowerCase().includes(query) ||
          probe.brand.toLowerCase().includes(query) ||
          probe.ownerBillingEntity.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortColumn) {
        case 'serialNumber': aVal = a.serialNumber.toLowerCase(); bVal = b.serialNumber.toLowerCase(); break;
        case 'brand': aVal = a.brand.toLowerCase(); bVal = b.brand.toLowerCase(); break;
        case 'status': aVal = a.status.toLowerCase(); bVal = b.status.toLowerCase(); break;
        case 'owner': aVal = a.ownerBillingEntity.toLowerCase(); bVal = b.ownerBillingEntity.toLowerCase(); break;
        case 'year': aVal = a.yearNew || 0; bVal = b.yearNew || 0; break;
        default: aVal = a.serialNumber.toLowerCase(); bVal = b.serialNumber.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [probes, searchQuery, sortColumn, sortDirection]);

  const handleAdd = async () => {
    if (!addForm.serial_number.trim()) {
      alert('Serial number is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        serial_number: addForm.serial_number,
      };
      if (addForm.brand) payload.brand = addForm.brand;
      if (addForm.owner_billing_entity) payload.owner_billing_entity = parseInt(addForm.owner_billing_entity, 10);
      if (addForm.year_new) payload.year_new = parseInt(addForm.year_new, 10);
      if (addForm.status) payload.status = addForm.status;
      if (addForm.rack_location) payload.rack_location = addForm.rack_location;
      if (addForm.notes) payload.notes = addForm.notes;

      const response = await fetch('/api/probes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm(initialAddForm);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create probe');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create probe');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedProbe) return;
    if (!editForm.serial_number.trim()) {
      alert('Serial number is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        serial_number: editForm.serial_number,
        brand: editForm.brand || null,
        owner_billing_entity: editForm.owner_billing_entity ? parseInt(editForm.owner_billing_entity, 10) : null,
        year_new: editForm.year_new ? parseInt(editForm.year_new, 10) : null,
        status: editForm.status || null,
        rack_location: editForm.rack_location || null,
        notes: editForm.notes || null,
      };

      const response = await fetch(`/api/probes/${selectedProbe.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowEditModal(false);
        setSelectedProbe(null);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update probe');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update probe');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (probe: ProcessedProbe) => {
    if (!confirm(`Delete probe "${probe.serialNumber}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/probes/${probe.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setProbes(probes.filter((p) => p.id !== probe.id));
      } else {
        alert('Failed to delete probe');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete probe');
    }
  };

  const openEditModal = (probe: ProcessedProbe) => {
    setSelectedProbe(probe);
    setEditForm({
      serial_number: probe.serialNumber,
      brand: probe.brand,
      owner_billing_entity: probe.ownerBillingEntityId?.toString() || '',
      year_new: probe.yearNew?.toString() || '',
      status: probe.status,
      rack_location: probe.rackLocation === '—' ? '' : probe.rackLocation,
      notes: probe.notes || '',
    });
    setShowEditModal(true);
  };

  const getBrandBadge = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('sentek')) {
      return <span className="brand-badge sentek">{brand}</span>;
    }
    if (brandLower.includes('cropx')) {
      return <span className="brand-badge cropx">{brand}</span>;
    }
    return <span className="brand-badge">{brand}</span>;
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    let className = 'status-badge ';
    if (statusLower === 'in stock' || statusLower === 'in-stock') {
      className += 'in-stock';
    } else if (statusLower === 'deployed' || statusLower === 'installed') {
      className += 'installed';
    } else if (statusLower === 'assigned') {
      className += 'pending';
    } else if (statusLower === 'rma' || statusLower === 'repair' || statusLower === 'needs repair') {
      className += 'repair';
    } else if (statusLower === 'retired') {
      className += 'retired';
    } else {
      className += 'pending';
    }
    return (
      <span className={className}>
        <span className="status-dot"></span>
        {status}
      </span>
    );
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Probe Inventory</h2>
          <span className="season-badge">{statusCounts.all} Total</span>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">Total Probes</div>
            <div className="stat-value blue">{statusCounts.all || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">In Stock</div>
            <div className="stat-value green">{statusCounts['in-stock'] || statusCounts['in stock'] || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Installed</div>
            <div className="stat-value amber">{statusCounts['deployed'] || statusCounts['installed'] || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">RMA</div>
            <div className="stat-value red">{statusCounts['rma'] || statusCounts['repair'] || 0}</div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">
              {searchQuery ? `Matching Probes (${filteredProbes.length})` : 'All Probes'}
            </h3>
            <div className="table-actions">
              <div className="search-box">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by serial number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Probe
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('serialNumber')}>
                  Serial Number
                  {sortColumn === 'serialNumber' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('brand')}>
                  Brand
                  {sortColumn === 'brand' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('status')}>
                  Status
                  {sortColumn === 'status' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th>Rack Location</th>
                <th className="sortable" onClick={() => handleSort('owner')}>
                  Owner
                  {sortColumn === 'owner' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('year')}>
                  Year New
                  {sortColumn === 'year' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredProbes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {searchQuery ? 'No matching probes found.' : 'No probes found.'}
                  </td>
                </tr>
              ) : (
                filteredProbes.map((probe) => (
                  <tr key={probe.id}>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                      #{probe.serialNumber}
                    </td>
                    <td>{getBrandBadge(probe.brand)}</td>
                    <td>{getStatusBadge(probe.status)}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>
                      {probe.rackLocation}
                    </td>
                    <td style={{ fontSize: '13px' }}>{probe.ownerBillingEntity}</td>
                    <td className="field-count">{probe.yearNew || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="action-btn" title="Edit" onClick={() => openEditModal(probe)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button className="action-btn" title="Delete" onClick={() => handleDelete(probe)}>
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

      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add New Probe</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Serial Number *</label>
                  <input
                    type="text"
                    value={addForm.serial_number}
                    onChange={(e) => setAddForm({ ...addForm, serial_number: e.target.value })}
                    placeholder="Enter serial number"
                  />
                </div>
                <div className="form-group">
                  <label>Brand</label>
                  <select
                    value={addForm.brand}
                    onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })}
                  >
                    <option value="">Select brand...</option>
                    {BRAND_OPTIONS.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Owner (Billing Entity)</label>
                  <select
                    value={addForm.owner_billing_entity}
                    onChange={(e) => setAddForm({ ...addForm, owner_billing_entity: e.target.value })}
                  >
                    <option value="">Select billing entity...</option>
                    {billingEntities.map((be) => (
                      <option key={be.id} value={be.id}>{be.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Year New</label>
                  <input
                    type="number"
                    value={addForm.year_new}
                    onChange={(e) => setAddForm({ ...addForm, year_new: e.target.value })}
                    placeholder="e.g. 2024"
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={addForm.status}
                    onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Rack Location</label>
                  <input
                    type="text"
                    value={addForm.rack_location}
                    onChange={(e) => setAddForm({ ...addForm, rack_location: e.target.value })}
                    placeholder="e.g. A1-03"
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={addForm.notes}
                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                    placeholder="Enter notes..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Create Probe'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedProbe && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Probe</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Serial Number *</label>
                  <input
                    type="text"
                    value={editForm.serial_number}
                    onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                    placeholder="Enter serial number"
                  />
                </div>
                <div className="form-group">
                  <label>Brand</label>
                  <select
                    value={editForm.brand}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                  >
                    <option value="">Select brand...</option>
                    {BRAND_OPTIONS.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Owner (Billing Entity)</label>
                  <select
                    value={editForm.owner_billing_entity}
                    onChange={(e) => setEditForm({ ...editForm, owner_billing_entity: e.target.value })}
                  >
                    <option value="">Select billing entity...</option>
                    {billingEntities.map((be) => (
                      <option key={be.id} value={be.id}>{be.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Year New</label>
                  <input
                    type="number"
                    value={editForm.year_new}
                    onChange={(e) => setEditForm({ ...editForm, year_new: e.target.value })}
                    placeholder="e.g. 2024"
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Rack Location</label>
                  <input
                    type="text"
                    value={editForm.rack_location}
                    onChange={(e) => setEditForm({ ...editForm, rack_location: e.target.value })}
                    placeholder="e.g. A1-03"
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Enter notes..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
