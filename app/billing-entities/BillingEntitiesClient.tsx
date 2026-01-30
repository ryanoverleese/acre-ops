'use client';

import { useState, useMemo } from 'react';
import type { ProcessedBillingEntity, OperationOption, ContactOption } from './page';

interface Props {
  initialEntities: ProcessedBillingEntity[];
  operations: OperationOption[];
  contacts: ContactOption[];
}

interface SelectedContact {
  id: number;
  name: string;
}

const initialForm = {
  name: '',
  operation: '',
  address: '',
  notes: '',
};

export default function BillingEntitiesClient({ initialEntities, operations, contacts }: Props) {
  const [entities, setEntities] = useState(initialEntities);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<ProcessedBillingEntity | null>(null);
  const [form, setForm] = useState(initialForm);
  const [selectedContacts, setSelectedContacts] = useState<SelectedContact[]>([]);
  const [saving, setSaving] = useState(false);
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

  // Filter contacts by operation and exclude already selected
  const availableContacts = useMemo(() => {
    const selectedIds = new Set(selectedContacts.map((c) => c.id));
    let filtered = contacts.filter((c) => !selectedIds.has(c.id));
    if (form.operation) {
      filtered = filtered.filter((c) => c.operationIds.includes(parseInt(form.operation)));
    }
    return filtered;
  }, [contacts, form.operation, selectedContacts]);

  const filteredEntities = useMemo(() => {
    let filtered = entities;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.operationName.toLowerCase().includes(query) ||
          e.invoiceContactNames.some((name) => name.toLowerCase().includes(query))
      );
    }

    filtered = [...filtered].sort((a, b) => {
      let aVal = '';
      let bVal = '';

      switch (sortColumn) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'operation': aVal = a.operationName.toLowerCase(); bVal = b.operationName.toLowerCase(); break;
        case 'contact': aVal = a.invoiceContactNames.join(',').toLowerCase(); bVal = b.invoiceContactNames.join(',').toLowerCase(); break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [entities, searchQuery, sortColumn, sortDirection]);

  const handleSelectContact = (contactId: string) => {
    if (!contactId) return;
    const contact = contacts.find((c) => c.id === parseInt(contactId));
    if (contact && !selectedContacts.some((sc) => sc.id === contact.id)) {
      setSelectedContacts([...selectedContacts, { id: contact.id, name: contact.name }]);
    }
  };

  const handleRemoveContact = (contactId: number) => {
    setSelectedContacts(selectedContacts.filter((c) => c.id !== contactId));
  };

  const handleAdd = async () => {
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: form.name };
      if (form.operation) payload.operation = [parseInt(form.operation)];
      if (selectedContacts.length > 0) payload.invoice_contact = selectedContacts.map((c) => c.id);
      if (form.address) payload.address = form.address;
      if (form.notes) payload.notes = form.notes;

      const response = await fetch('/api/billing-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const newEntity = await response.json();
        const opName = form.operation ? operations.find((o) => o.id === parseInt(form.operation))?.name || '' : '';

        setEntities([
          ...entities,
          {
            id: newEntity.id,
            name: newEntity.name || '',
            operationId: form.operation ? parseInt(form.operation) : null,
            operationName: opName,
            invoiceContactIds: selectedContacts.map((c) => c.id),
            invoiceContactNames: selectedContacts.map((c) => c.name),
            address: form.address || '',
            notes: newEntity.notes || '',
          },
        ]);
        setShowAddModal(false);
        setForm(initialForm);
        setSelectedContacts([]);
      } else {
        alert('Failed to create billing entity');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to create billing entity');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedEntity) return;
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: form.name };
      payload.operation = form.operation ? [parseInt(form.operation)] : [];
      payload.invoice_contact = selectedContacts.map((c) => c.id);
      payload.address = form.address || null;
      payload.notes = form.notes || null;

      const response = await fetch(`/api/billing-entities/${selectedEntity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const opName = form.operation ? operations.find((o) => o.id === parseInt(form.operation))?.name || '' : '';

        setEntities(
          entities.map((e) =>
            e.id === selectedEntity.id
              ? {
                  ...e,
                  name: form.name,
                  operationId: form.operation ? parseInt(form.operation) : null,
                  operationName: opName,
                  invoiceContactIds: selectedContacts.map((c) => c.id),
                  invoiceContactNames: selectedContacts.map((c) => c.name),
                  address: form.address,
                  notes: form.notes,
                }
              : e
          )
        );
        setShowEditModal(false);
        setSelectedEntity(null);
        setForm(initialForm);
        setSelectedContacts([]);
      } else {
        alert('Failed to update billing entity');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to update billing entity');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entity: ProcessedBillingEntity) => {
    if (!confirm(`Delete "${entity.name}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/billing-entities/${entity.id}`, { method: 'DELETE' });
      if (response.ok) {
        setEntities(entities.filter((e) => e.id !== entity.id));
      } else {
        alert('Failed to delete billing entity');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete billing entity');
    }
  };

  const openAddModal = () => {
    setForm(initialForm);
    setSelectedContacts([]);
    setShowAddModal(true);
  };

  const openEditModal = (entity: ProcessedBillingEntity) => {
    setSelectedEntity(entity);
    setForm({
      name: entity.name,
      operation: entity.operationId?.toString() || '',
      address: entity.address || '',
      notes: entity.notes,
    });
    // Pre-populate selected contacts
    const entityContacts: SelectedContact[] = entity.invoiceContactIds.map((id, idx) => ({
      id,
      name: entity.invoiceContactNames[idx] || '',
    }));
    setSelectedContacts(entityContacts);
    setShowEditModal(true);
  };

  const renderContactsField = () => (
    <div className="form-group">
      <label>Invoice Contacts</label>

      {/* Show selected contacts as chips */}
      {selectedContacts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {selectedContacts.map((contact) => (
            <span
              key={contact.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'var(--accent-blue-dim, rgba(59, 130, 246, 0.2))',
                color: 'var(--accent-blue, #3b82f6)',
                borderRadius: '4px',
                fontSize: '13px',
              }}
            >
              {contact.name}
              <button
                type="button"
                onClick={() => handleRemoveContact(contact.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0',
                  cursor: 'pointer',
                  color: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Remove"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown to add more */}
      <select
        value=""
        onChange={(e) => handleSelectContact(e.target.value)}
      >
        <option value="">
          {selectedContacts.length === 0 ? 'Select contact...' : '+ Add another contact...'}
        </option>
        {availableContacts.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {form.operation && availableContacts.length === 0 && selectedContacts.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
          No contacts linked to this operation yet
        </p>
      )}
    </div>
  );

  return (
    <>
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">All Billing Entities ({filteredEntities.length})</h3>
          <div className="table-actions">
            <div className="search-box" style={{ width: '200px' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={openAddModal}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Billing Entity
            </button>
          </div>
        </div>

        <table className="desktop-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('name')}>
                Name
                {sortColumn === 'name' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('operation')}>
                Operation
                {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('contact')}>
                Invoice Contacts
                {sortColumn === 'contact' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredEntities.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No billing entities found.
                </td>
              </tr>
            ) : (
              filteredEntities.map((entity) => (
                <tr key={entity.id}>
                  <td className="operation-name">{entity.name}</td>
                  <td style={{ fontSize: '13px' }}>{entity.operationName || '—'}</td>
                  <td style={{ fontSize: '13px' }}>{entity.invoiceContactNames.length > 0 ? entity.invoiceContactNames.join(', ') : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="action-btn" title="Edit" onClick={() => openEditModal(entity)}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button className="action-btn" title="Delete" onClick={() => handleDelete(entity)}>
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
          {filteredEntities.length === 0 ? (
            <div className="empty-state">No billing entities found.</div>
          ) : (
            filteredEntities.map((entity) => (
              <div key={entity.id} className="mobile-card">
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{entity.name}</span>
                </div>
                <div className="mobile-card-body">
                  {entity.operationName && <div className="mobile-card-row"><span>Operation:</span> {entity.operationName}</div>}
                  {entity.invoiceContactNames.length > 0 && <div className="mobile-card-row"><span>Contacts:</span> {entity.invoiceContactNames.join(', ')}</div>}
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary" onClick={() => openEditModal(entity)}>Edit</button>
                  <button className="btn btn-secondary" onClick={() => handleDelete(entity)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add Billing Entity</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Billing entity name" />
                </div>
                <div className="form-group">
                  <label>Operation</label>
                  <select value={form.operation} onChange={(e) => { setForm({ ...form, operation: e.target.value }); setSelectedContacts([]); }}>
                    <option value="">Select operation...</option>
                    {operations.map((op) => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                </div>
                {renderContactsField()}
                <div className="form-group">
                  <label>Mailing Address</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Enter mailing address..." rows={2} />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Enter notes..." rows={3} />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedEntity && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Billing Entity</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Operation</label>
                  <select value={form.operation} onChange={(e) => { setForm({ ...form, operation: e.target.value }); setSelectedContacts([]); }}>
                    <option value="">Select operation...</option>
                    {operations.map((op) => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                </div>
                {renderContactsField()}
                <div className="form-group">
                  <label>Mailing Address</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Enter mailing address..." rows={2} />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
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
