'use client';

import { useState, useMemo } from 'react';
import EmptyState from '@/components/EmptyState';

export interface ProcessedRepair {
  id: number;
  fieldSeasonId: number;
  fieldName: string;
  operation: string;
  reportedAt: string;
  problem: string;
  fix?: string;
  repairedAt?: string;
  notifiedCustomer: boolean;
  status: 'open' | 'resolved';
  probeAssignmentId?: number;
  probeNumber?: number;
  probeSerial?: string | null;
}

export interface FieldSeasonOption {
  id: number;
  fieldName: string;
  operation: string;
  probe1Serial?: string;
  probe2Serial?: string;
}

export interface ProbeAssignmentOption {
  id: number;
  fieldSeasonId: number;
  fieldName: string;
  probeNumber: number;
  probeSerial?: string;
}

interface RepairsClientProps {
  repairs: ProcessedRepair[];
  fieldSeasons: FieldSeasonOption[];
  probeAssignmentOptions: ProbeAssignmentOption[];
}

const initialForm = {
  field_season: '',
  probe_assignment: '',
  reported_at: new Date().toISOString().split('T')[0],
  problem: '',
  fix: '',
  repaired_at: '',
  notified_customer: false,
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function RepairsClient({ repairs: initialRepairs, fieldSeasons, probeAssignmentOptions }: RepairsClientProps) {
  const [repairs, setRepairs] = useState(initialRepairs);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedRepair, setSelectedRepair] = useState<ProcessedRepair | null>(null);
  const [addForm, setAddForm] = useState(initialForm);
  const [editForm, setEditForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('reportedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Get probe assignments for the selected field_season
  const availableProbeAssignments = useMemo(() => {
    if (!addForm.field_season) return [];
    return probeAssignmentOptions.filter(
      (pa) => pa.fieldSeasonId === parseInt(addForm.field_season, 10)
    );
  }, [addForm.field_season, probeAssignmentOptions]);

  // Handle field selection - auto-select probe if only one exists
  const handleFieldSelect = (fieldSeasonId: string) => {
    const probes = probeAssignmentOptions.filter(
      (pa) => pa.fieldSeasonId === parseInt(fieldSeasonId, 10)
    );

    let probeAssignment = '';
    if (probes.length === 1) {
      probeAssignment = probes[0].id.toString();
    }

    setAddForm({ ...addForm, field_season: fieldSeasonId, probe_assignment: probeAssignment });
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'reportedAt' ? 'desc' : 'asc');
    }
  };

  const filteredRepairs = useMemo(() => {
    let filtered = repairs;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.fieldName.toLowerCase().includes(query) ||
          r.operation.toLowerCase().includes(query) ||
          r.problem.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortColumn) {
        case 'status': aVal = a.status; bVal = b.status; break;
        case 'field': aVal = a.fieldName.toLowerCase(); bVal = b.fieldName.toLowerCase(); break;
        case 'operation': aVal = a.operation.toLowerCase(); bVal = b.operation.toLowerCase(); break;
        case 'reportedAt': aVal = new Date(a.reportedAt).getTime(); bVal = new Date(b.reportedAt).getTime(); break;
        default: aVal = new Date(a.reportedAt).getTime(); bVal = new Date(b.reportedAt).getTime();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [repairs, searchQuery, sortColumn, sortDirection]);

  const openCount = repairs.filter((r) => r.status === 'open').length;
  const resolvedCount = repairs.filter((r) => r.status === 'resolved').length;

  const handleAdd = async () => {
    if (!addForm.field_season) {
      alert('Field is required');
      return;
    }
    // Require probe selection if field has multiple probe assignments
    if (availableProbeAssignments.length > 1 && !addForm.probe_assignment) {
      alert('Please select which probe needs repair');
      return;
    }
    if (!addForm.problem.trim()) {
      alert('Problem description is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        field_season: parseInt(addForm.field_season, 10),
        reported_at: addForm.reported_at,
        problem: addForm.problem,
      };
      if (addForm.probe_assignment) {
        payload.probe_assignment = parseInt(addForm.probe_assignment, 10);
      }
      if (addForm.fix) payload.fix = addForm.fix;
      if (addForm.repaired_at) payload.repaired_at = addForm.repaired_at;
      payload.notified_customer = addForm.notified_customer;

      const response = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm(initialForm);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create repair');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create repair');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedRepair) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        problem: editForm.problem,
        fix: editForm.fix || null,
        repaired_at: editForm.repaired_at || null,
        notified_customer: editForm.notified_customer,
      };

      const response = await fetch(`/api/repairs/${selectedRepair.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowEditModal(false);
        setSelectedRepair(null);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update repair');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update repair');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (repair: ProcessedRepair) => {
    if (!confirm(`Delete repair for "${repair.fieldName}"?`)) return;
    try {
      const response = await fetch(`/api/repairs/${repair.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setRepairs(repairs.filter((r) => r.id !== repair.id));
      } else {
        alert('Failed to delete repair');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete repair');
    }
  };

  const openEditModal = (repair: ProcessedRepair) => {
    setSelectedRepair(repair);
    setEditForm({
      field_season: repair.fieldSeasonId.toString(),
      probe_assignment: repair.probeAssignmentId?.toString() || '',
      reported_at: repair.reportedAt || '',
      problem: repair.problem,
      fix: repair.fix || '',
      repaired_at: repair.repairedAt || '',
      notified_customer: repair.notifiedCustomer,
    });
    setShowEditModal(true);
  };

  const handleMarkResolved = async (repair: ProcessedRepair) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/repairs/${repair.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repaired_at: new Date().toISOString().split('T')[0],
        }),
      });
      if (response.ok) {
        window.location.reload();
      } else {
        alert('Failed to mark as resolved');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to mark as resolved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Repairs</h2>
          <span className="season-badge" style={{ background: 'var(--accent-red-dim)', color: 'var(--accent-red)' }}>
            {openCount} Open
          </span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search repairs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Report Repair
          </button>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">Total Repairs</div>
            <div className="stat-value blue">{repairs.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open</div>
            <div className="stat-value red">{openCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Resolved</div>
            <div className="stat-value green">{resolvedCount}</div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">
              {searchQuery ? `Matching Repairs (${filteredRepairs.length})` : 'All Repairs'}
            </h3>
          </div>
          <table className="desktop-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('status')}>
                  Status
                  {sortColumn === 'status' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('field')}>
                  Field
                  {sortColumn === 'field' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('operation')}>
                  Operation
                  {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th>Problem</th>
                <th className="sortable" onClick={() => handleSort('reportedAt')}>
                  Reported
                  {sortColumn === 'reportedAt' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th>Repaired</th>
                <th>Notified</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRepairs.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={searchQuery ? 'search' : 'repairs'}
                      title={searchQuery ? 'No matching repairs' : 'No repairs yet'}
                      description={searchQuery ? 'Try a different search term' : 'Repairs will appear here when reported'}
                    />
                  </td>
                </tr>
              ) : (
                filteredRepairs.map((repair) => (
                  <tr key={repair.id}>
                    <td>
                      <span className={`status-badge ${repair.status === 'open' ? 'repair' : 'installed'}`}>
                        <span className="status-dot"></span>
                        {repair.status === 'open' ? 'Open' : 'Resolved'}
                      </span>
                    </td>
                    <td className="operation-name">
                      {repair.fieldName}
                      {repair.probeNumber && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>
                          {' '}(Probe {repair.probeNumber}){repair.probeSerial ? ` - #${repair.probeSerial}` : ''}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '13px' }}>{repair.operation}</td>
                    <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {repair.problem}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {formatDate(repair.reportedAt)}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {formatDate(repair.repairedAt || '')}
                    </td>
                    <td>
                      {repair.notifiedCustomer ? (
                        <svg fill="none" stroke="var(--accent-green)" viewBox="0 0 24 24" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {repair.status === 'open' && (
                          <button
                            className="action-btn"
                            title="Mark Resolved"
                            onClick={() => handleMarkResolved(repair)}
                          >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}
                        <button className="action-btn" title="Edit" onClick={() => openEditModal(repair)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button className="action-btn" title="Delete" onClick={() => handleDelete(repair)}>
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
          <div className="mobile-cards">
            {filteredRepairs.length === 0 ? (
              <EmptyState
                icon={searchQuery ? 'search' : 'repairs'}
                title={searchQuery ? 'No matching repairs' : 'No repairs yet'}
                description={searchQuery ? 'Try a different search term' : 'Repairs will appear here when reported'}
              />
            ) : (
              filteredRepairs.map((repair) => (
                <div key={repair.id} className="mobile-card" onClick={() => openEditModal(repair)}>
                  <div className="mobile-card-header">
                    <span className="mobile-card-title">
                      {repair.fieldName}
                      {repair.probeNumber && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '12px' }}>
                          {' '}(Probe {repair.probeNumber}){repair.probeSerial ? ` - #${repair.probeSerial}` : ''}
                        </span>
                      )}
                    </span>
                    <span className={`status-badge ${repair.status === 'open' ? 'repair' : 'installed'}`}>
                      <span className="status-dot"></span>
                      {repair.status === 'open' ? 'Open' : 'Resolved'}
                    </span>
                  </div>
                  <div className="mobile-card-body">
                    <div className="mobile-card-row"><span>Operation:</span> {repair.operation}</div>
                    <div className="mobile-card-row"><span>Problem:</span> {repair.problem}</div>
                    <div className="mobile-card-row"><span>Reported:</span> {formatDate(repair.reportedAt)}</div>
                    {repair.repairedAt && (
                      <div className="mobile-card-row"><span>Repaired:</span> {formatDate(repair.repairedAt)}</div>
                    )}
                    {repair.fix && (
                      <div className="mobile-card-row"><span>Fix:</span> {repair.fix}</div>
                    )}
                    <div className="mobile-card-row">
                      <span>Notified:</span> {repair.notifiedCustomer ? 'Yes' : 'No'}
                    </div>
                  </div>
                  <div className="mobile-card-footer" style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    {repair.status === 'open' ? (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={(e) => { e.stopPropagation(); handleMarkResolved(repair); }}
                      >
                        Mark Resolved
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={(e) => { e.stopPropagation(); handleDelete(repair); }}
                      >
                        Delete
                      </button>
                    )}
                    <span style={{
                      color: 'var(--accent-green)',
                      fontSize: '13px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      Edit
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Report Repair</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Field *</label>
                  <select
                    value={addForm.field_season}
                    onChange={(e) => handleFieldSelect(e.target.value)}
                  >
                    <option value="">Select field...</option>
                    {fieldSeasons.map((fs) => (
                      <option key={fs.id} value={fs.id}>
                        {fs.fieldName} ({fs.operation})
                      </option>
                    ))}
                  </select>
                </div>
                {availableProbeAssignments.length > 1 && (
                  <div className="form-group">
                    <label>Which Probe? *</label>
                    <select
                      value={addForm.probe_assignment}
                      onChange={(e) => setAddForm({ ...addForm, probe_assignment: e.target.value })}
                    >
                      <option value="">Select probe...</option>
                      {availableProbeAssignments.map((pa) => (
                        <option key={pa.id} value={pa.id}>
                          Probe {pa.probeNumber}{pa.probeSerial ? ` - #${pa.probeSerial}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {availableProbeAssignments.length === 1 && (
                  <div className="form-group">
                    <label>Probe</label>
                    <input
                      type="text"
                      value={`Probe ${availableProbeAssignments[0].probeNumber}${availableProbeAssignments[0].probeSerial ? ` - #${availableProbeAssignments[0].probeSerial}` : ''}`}
                      disabled
                    />
                  </div>
                )}
                <div className="form-group">
                  <label>Reported Date *</label>
                  <input
                    type="date"
                    value={addForm.reported_at}
                    onChange={(e) => setAddForm({ ...addForm, reported_at: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Problem Description *</label>
                  <textarea
                    value={addForm.problem}
                    onChange={(e) => setAddForm({ ...addForm, problem: e.target.value })}
                    placeholder="Describe the problem..."
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Fix (if resolved)</label>
                  <textarea
                    value={addForm.fix}
                    onChange={(e) => setAddForm({ ...addForm, fix: e.target.value })}
                    placeholder="Describe the fix..."
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Repaired Date</label>
                  <input
                    type="date"
                    value={addForm.repaired_at}
                    onChange={(e) => setAddForm({ ...addForm, repaired_at: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={addForm.notified_customer}
                      onChange={(e) => setAddForm({ ...addForm, notified_customer: e.target.checked })}
                    />
                    Customer Notified
                  </label>
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Report Repair'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedRepair && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Repair</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Field</label>
                  <input type="text" value={selectedRepair.fieldName} disabled />
                </div>
                <div className="form-group">
                  <label>Problem Description *</label>
                  <textarea
                    value={editForm.problem}
                    onChange={(e) => setEditForm({ ...editForm, problem: e.target.value })}
                    placeholder="Describe the problem..."
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Fix</label>
                  <textarea
                    value={editForm.fix}
                    onChange={(e) => setEditForm({ ...editForm, fix: e.target.value })}
                    placeholder="Describe the fix..."
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Repaired Date</label>
                  <input
                    type="date"
                    value={editForm.repaired_at}
                    onChange={(e) => setEditForm({ ...editForm, repaired_at: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={editForm.notified_customer}
                      onChange={(e) => setEditForm({ ...editForm, notified_customer: e.target.checked })}
                    />
                    Customer Notified
                  </label>
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
