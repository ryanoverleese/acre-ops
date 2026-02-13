'use client';

import { useState, useMemo } from 'react';
import { useResizableColumns } from '@/hooks/useResizableColumns';

export interface LinkedContact {
  contactId: number;
  name: string;
  email?: string;
  phone?: string;
  isMainContact: boolean;
}

export interface ProcessedOperation {
  id: number;
  name: string;
  linkedContacts: LinkedContact[];
  billingEntities: { id: number; name: string }[];
  fieldCount: number;
  probeCount: number;
  notes?: string;
}

export interface ContactOption {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

interface OperationsClientProps {
  operations: ProcessedOperation[];
  allContacts: ContactOption[];
  embedded?: boolean;
}

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  name: 180,
  contacts: 200,
  billingEntities: 180,
  fields: 80,
  probes: 80,
  notes: 150,
};
const COLUMN_WIDTHS_STORAGE_KEY = 'operations-column-widths';

const initialAddForm = { name: '', notes: '' };

export default function OperationsClient({ operations: initialOperations, allContacts, embedded }: OperationsClientProps) {
  const { columnWidths, resizingColumn, handleResizeStart, handleResetColumnWidth } = useResizableColumns({
    defaultWidths: DEFAULT_COLUMN_WIDTHS,
    storageKey: COLUMN_WIDTHS_STORAGE_KEY,
  });

  const [operations, setOperations] = useState(initialOperations);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<ProcessedOperation | null>(null);
  const [addForm, setAddForm] = useState(initialAddForm);
  const [editForm, setEditForm] = useState({ name: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Linked contacts management
  const [linkedContacts, setLinkedContacts] = useState<LinkedContact[]>([]);
  const [showAddContactDropdown, setShowAddContactDropdown] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newContactIsMain, setNewContactIsMain] = useState(false);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredOperations = useMemo(() => {
    let filtered = operations;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (op) =>
          op.name.toLowerCase().includes(query) ||
          op.notes?.toLowerCase().includes(query) ||
          op.linkedContacts.some((c) => c.name.toLowerCase().includes(query))
      );
    }

    filtered = [...filtered].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortColumn) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'fields': aVal = a.fieldCount; bVal = b.fieldCount; break;
        case 'probes': aVal = a.probeCount; bVal = b.probeCount; break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [operations, searchQuery, sortColumn, sortDirection]);

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
        const newOp = await response.json();
        setOperations([...operations, {
          id: newOp.id,
          name: newOp.name,
          linkedContacts: [],
          billingEntities: [],
          fieldCount: 0,
          probeCount: 0,
          notes: newOp.notes,
        }]);
        setShowAddModal(false);
        setAddForm(initialAddForm);
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
        setOperations(operations.map((op) =>
          op.id === selectedOperation.id
            ? { ...op, name: editForm.name, notes: editForm.notes, linkedContacts }
            : op
        ));
        setShowEditModal(false);
        setSelectedOperation(null);
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
    setLinkedContacts([...op.linkedContacts]);
    setShowEditModal(true);
  };

  const handleAddContact = async () => {
    if (!newContactId || !selectedOperation) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${newContactId}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: selectedOperation.id,
          isMainContact: newContactIsMain,
        }),
      });
      if (response.ok) {
        const contact = allContacts.find((c) => c.id === parseInt(newContactId));
        if (contact) {
          setLinkedContacts([...linkedContacts, {
            contactId: contact.id,
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
            isMainContact: newContactIsMain,
          }]);
        }
        setShowAddContactDropdown(false);
        setNewContactId('');
        setNewContactIsMain(false);
      } else {
        alert('Failed to add contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to add contact');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveContact = async (lc: LinkedContact) => {
    if (!confirm(`Remove ${lc.name} from this operation?`)) return;
    if (!selectedOperation) return;
    try {
      const response = await fetch(`/api/contacts/${lc.contactId}/operations?operationId=${selectedOperation.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setLinkedContacts(linkedContacts.filter((c) => c.contactId !== lc.contactId));
      } else {
        alert('Failed to remove contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to remove contact');
    }
  };

  const availableContacts = allContacts.filter(
    (c) => !linkedContacts.some((lc) => lc.contactId === c.id)
  );

  return (
    <>
      {!embedded && (
        <header className="header">
          <div className="header-left">
            <h2>Operations</h2>
            <span className="season-badge">{operations.length} Total</span>
          </div>
        </header>
      )}

      <div className={embedded ? undefined : 'content'}>
        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">
              {searchQuery ? `Matching Operations (${filteredOperations.length})` : 'All Operations'}
            </h3>
            <div className="table-actions">
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
          </div>
          <table className="desktop-table" style={{ userSelect: resizingColumn ? 'none' : undefined }}>
            <colgroup>
              <col style={{ width: columnWidths.name }} />
              <col style={{ width: columnWidths.contacts }} />
              <col style={{ width: columnWidths.billingEntities }} />
              <col style={{ width: columnWidths.fields }} />
              <col style={{ width: columnWidths.probes }} />
              <col style={{ width: columnWidths.notes }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="sortable th-resizable" onClick={() => handleSort('name')}>
                  <span className="th-content">
                    Operation Name
                    {sortColumn === 'name' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('name', e)}
                    onDoubleClick={() => handleResetColumnWidth('name')}
                    className={`resize-handle${resizingColumn === 'name' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="th-resizable">
                  <span className="th-content">Contacts</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('contacts', e)}
                    onDoubleClick={() => handleResetColumnWidth('contacts')}
                    className={`resize-handle${resizingColumn === 'contacts' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="th-resizable">
                  <span className="th-content">Billing Entities</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('billingEntities', e)}
                    onDoubleClick={() => handleResetColumnWidth('billingEntities')}
                    className={`resize-handle${resizingColumn === 'billingEntities' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="sortable th-resizable" onClick={() => handleSort('fields')}>
                  <span className="th-content">
                    Fields
                    {sortColumn === 'fields' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('fields', e)}
                    onDoubleClick={() => handleResetColumnWidth('fields')}
                    className={`resize-handle${resizingColumn === 'fields' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="sortable th-resizable" onClick={() => handleSort('probes')}>
                  <span className="th-content">
                    Probes
                    {sortColumn === 'probes' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </span>
                  <div
                    onMouseDown={(e) => handleResizeStart('probes', e)}
                    onDoubleClick={() => handleResetColumnWidth('probes')}
                    className={`resize-handle${resizingColumn === 'probes' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="th-resizable">
                  <span className="th-content">Notes</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('notes', e)}
                    onDoubleClick={() => handleResetColumnWidth('notes')}
                    className={`resize-handle${resizingColumn === 'notes' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOperations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ops-empty-cell">
                    {searchQuery ? 'No matching operations found.' : 'No operations found.'}
                  </td>
                </tr>
              ) : (
                filteredOperations.map((op) => (
                  <tr key={op.id}>
                    <td className="operation-name">{op.name}</td>
                    <td>
                      {op.linkedContacts.length > 0 ? (
                        <div className="ops-contacts-col">
                          {op.linkedContacts.map((c) => (
                            <div key={c.contactId} className="ops-contact-row">
                              <span>{c.name}</span>
                              {c.isMainContact && (
                                <span className="ops-main-badge">Main</span>
                              )}
                              {c.phone && (
                                <span className="ops-contact-phone">{c.phone}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="ops-muted">—</span>
                      )}
                    </td>
                    <td>
                      {op.billingEntities.length > 0 ? (
                        <div className="ops-badge-wrap">
                          {op.billingEntities.map((be) => (
                            <span key={be.id} className="status-badge in-stock">{be.name}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="ops-muted">—</span>
                      )}
                    </td>
                    <td className="field-count">{op.fieldCount}</td>
                    <td className="field-count">{op.probeCount}</td>
                    <td className="ops-notes-cell">
                      {op.notes || '—'}
                    </td>
                    <td>
                      <div className="ops-action-btns">
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

          <div className="mobile-cards">
            {filteredOperations.length === 0 ? (
              <div className="empty-state">No operations found.</div>
            ) : (
              filteredOperations.map((op) => (
                <div key={op.id} className="mobile-card">
                  <div className="mobile-card-header">
                    <span className="mobile-card-title">{op.name}</span>
                    <div className="ops-mobile-badges">
                      <span className="status-badge in-stock">{op.fieldCount} fields</span>
                      <span className="status-badge installed">{op.probeCount} probes</span>
                    </div>
                  </div>
                  <div className="mobile-card-body">
                    {op.linkedContacts.length > 0 && (
                      <div className="mobile-card-row">
                        <span>Contacts:</span> {op.linkedContacts.map((c) => c.name).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="mobile-card-actions">
                    <button className="btn btn-secondary" onClick={() => openEditModal(op)}>Edit</button>
                    <button className="btn btn-secondary" onClick={() => handleDelete(op)}>Delete</button>
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

                {/* Linked Contacts Section */}
                <div className="form-group">
                  <label className="ops-linked-label">Linked Contacts</label>

                  {linkedContacts.length > 0 ? (
                    <div className="ops-linked-list">
                      {linkedContacts.map((lc) => (
                        <div key={lc.contactId} className="ops-linked-row">
                          <div className="ops-linked-info">
                            <span className="ops-linked-name">{lc.name}</span>
                            {lc.isMainContact && (
                              <span className="ops-main-badge">Main</span>
                            )}
                            {lc.phone && <span className="ops-linked-phone">{lc.phone}</span>}
                          </div>
                          <button
                            type="button"
                            className="action-btn"
                            title="Remove"
                            onClick={() => handleRemoveContact(lc)}
                          >
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ops-no-contacts">No contacts linked to this operation.</p>
                  )}

                  {!showAddContactDropdown ? (
                    <button
                      type="button"
                      className="btn btn-secondary ops-full-width"
                      onClick={() => setShowAddContactDropdown(true)}
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Contact
                    </button>
                  ) : (
                    <div className="ops-contact-form">
                      <select
                        className="ops-full-width"
                        value={newContactId}
                        onChange={(e) => setNewContactId(e.target.value)}
                      >
                        <option value="">Select contact...</option>
                        {availableContacts.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <label className="ops-checkbox-label">
                        <input
                          type="checkbox"
                          checked={newContactIsMain}
                          onChange={(e) => setNewContactIsMain(e.target.checked)}
                        />
                        Main Contact
                      </label>
                      <div className="ops-form-actions">
                        <button
                          type="button"
                          className="btn btn-secondary ops-flex-1"
                          onClick={() => {
                            setShowAddContactDropdown(false);
                            setNewContactId('');
                            setNewContactIsMain(false);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary ops-flex-1"
                          onClick={handleAddContact}
                          disabled={!newContactId || saving}
                        >
                          {saving ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}
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
