'use client';

import { useState, useMemo } from 'react';

export interface ProcessedOperation {
  id: number;
  name: string;
  contacts: { id: number; name: string; email?: string; phone?: string }[];
  billingEntities: { id: number; name: string }[];
  fieldCount: number;
  notes?: string;
}

interface OperationsClientProps {
  operations: ProcessedOperation[];
}

const initialAddForm = { name: '', notes: '' };

export default function OperationsClient({ operations: initialOperations }: OperationsClientProps) {
  const [operations, setOperations] = useState(initialOperations);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<ProcessedOperation | null>(null);
  const [addForm, setAddForm] = useState(initialAddForm);
  const [editForm, setEditForm] = useState({ name: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const filteredOperations = useMemo(() => {
    if (!searchQuery.trim()) return operations;
    const query = searchQuery.toLowerCase();
    return operations.filter(
      (op) =>
        op.name.toLowerCase().includes(query) ||
        op.notes?.toLowerCase().includes(query) ||
        op.contacts.some((c) => c.name.toLowerCase().includes(query))
    );
  }, [operations, searchQuery]);

  const handleAdd = async () => {
    if (!addForm.name.trim()) {
      alert('Operation name is required');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm(initialAddForm);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create operation');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create operation');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedOperation) return;
    if (!editForm.name.trim()) {
      alert('Operation name is required');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/operations/${selectedOperation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (response.ok) {
        setShowEditModal(false);
        setSelectedOperation(null);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update operation');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update operation');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (op: ProcessedOperation) => {
    if (!confirm(`Delete operation "${op.name}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/operations/${op.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setOperations(operations.filter((o) => o.id !== op.id));
      } else {
        alert('Failed to delete operation');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete operation');
    }
  };

  const openEditModal = (op: ProcessedOperation) => {
    setSelectedOperation(op);
    setEditForm({ name: op.name, notes: op.notes || '' });
    setShowEditModal(true);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Operations</h2>
          <span className="season-badge">{operations.length} Total</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search operations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Operation
          </button>
        </div>
      </header>

      <div className="content">
        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">
              {searchQuery ? `Matching Operations (${filteredOperations.length})` : 'All Operations'}
            </h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Operation Name</th>
                <th>Contacts</th>
                <th>Billing Entities</th>
                <th>Fields</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOperations.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {searchQuery ? 'No matching operations found.' : 'No operations found.'}
                  </td>
                </tr>
              ) : (
                filteredOperations.map((op) => (
                  <tr key={op.id}>
                    <td className="operation-name">{op.name}</td>
                    <td>
                      {op.contacts.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {op.contacts.map((c) => (
                            <div key={c.id} style={{ fontSize: '13px' }}>
                              <span>{c.name}</span>
                              {c.phone && (
                                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{c.phone}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {op.billingEntities.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {op.billingEntities.map((be) => (
                            <span key={be.id} className="status-badge in-stock">{be.name}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="field-count">{op.fieldCount}</td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {op.notes || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="action-btn" title="Edit" onClick={() => openEditModal(op)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button className="action-btn" title="Delete" onClick={() => handleDelete(op)}>
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
              <h3>Add New Operation</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Operation Name *</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    placeholder="Enter operation name"
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
                {saving ? 'Creating...' : 'Create Operation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedOperation && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Operation</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Operation Name *</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Enter operation name"
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
