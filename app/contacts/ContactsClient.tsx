'use client';

import { useState, useMemo } from 'react';
import type { ProcessedContact, OperationOption } from './page';

interface ContactsClientProps {
  initialContacts: ProcessedContact[];
  operations: OperationOption[];
}

const CUSTOMER_TYPE_OPTIONS = ['Current Customer', 'Past Customer', 'Weather Station Only', 'Agronomist'];

const initialForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  customer_type: '',
  notes: '',
  operations: [] as string[],
  is_main_contact: 'No',
};

export default function ContactsClient({ initialContacts, operations }: ContactsClientProps) {
  const [contacts, setContacts] = useState(initialContacts);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ProcessedContact | null>(null);
  const [form, setForm] = useState(initialForm);
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

  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          c.phone.toLowerCase().includes(query) ||
          c.operationNames.some((op) => op.toLowerCase().includes(query))
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter((c) => c.customerType === filterType);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal = '';
      let bVal = '';

      switch (sortColumn) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'email': aVal = a.email.toLowerCase(); bVal = b.email.toLowerCase(); break;
        case 'phone': aVal = a.phone.toLowerCase(); bVal = b.phone.toLowerCase(); break;
        case 'operation': aVal = a.operationNames.join(',').toLowerCase(); bVal = b.operationNames.join(',').toLowerCase(); break;
        case 'customerType': aVal = a.customerType.toLowerCase(); bVal = b.customerType.toLowerCase(); break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [contacts, searchQuery, filterType, sortColumn, sortDirection]);

  const handleAddContact = async () => {
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: form.name };
      if (form.email) payload.email = form.email;
      if (form.phone) payload.phone = form.phone;
      if (form.address) payload.address = form.address;
      if (form.customer_type) payload.customer_type = form.customer_type;
      if (form.notes) payload.notes = form.notes;
      if (form.operations.length > 0) payload.operations = form.operations.map((id) => parseInt(id));
      payload.is_main_contact = form.is_main_contact;

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Reload to get the updated data with operation names
        window.location.reload();
      } else {
        alert('Failed to create contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to create contact');
    } finally {
      setSaving(false);
    }
  };

  const handleEditContact = async () => {
    if (!selectedContact) return;
    if (!form.name.trim()) {
      alert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: form.name };
      payload.email = form.email || null;
      payload.phone = form.phone || null;
      payload.address = form.address || null;
      payload.customer_type = form.customer_type || null;
      payload.notes = form.notes || null;
      payload.operations = form.operations.map((id) => parseInt(id));
      payload.is_main_contact = form.is_main_contact;

      const response = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Reload to get the updated data with operation names
        window.location.reload();
      } else {
        alert('Failed to update contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to update contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: ProcessedContact) => {
    if (!confirm(`Delete contact "${contact.name}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      if (response.ok) {
        setContacts(contacts.filter((c) => c.id !== contact.id));
      } else {
        alert('Failed to delete contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete contact');
    }
  };

  const openEditModal = (contact: ProcessedContact) => {
    setSelectedContact(contact);
    setForm({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      customer_type: contact.customerType,
      notes: contact.notes,
      operations: contact.operationIds.map((id) => id.toString()),
      is_main_contact: contact.isMainContact ? 'Yes' : 'No',
    });
    setShowEditModal(true);
  };

  const getTypeBadge = (type: string) => {
    const colorMap: Record<string, string> = {
      'Current Customer': 'installed',
      'Past Customer': 'needs-probe',
      'Weather Station Only': 'pending',
      'Agronomist': 'in-stock',
    };
    const badgeClass = colorMap[type] || 'needs-probe';
    return type ? (
      <span className={`status-badge ${badgeClass}`}>
        <span className="status-dot"></span>
        {type}
      </span>
    ) : (
      <span style={{ color: 'var(--text-muted)' }}>—</span>
    );
  };

  return (
    <>
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">All Contacts ({filteredContacts.length})</h3>
          <div className="table-actions">
            <div className="search-box" style={{ width: '200px' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              {CUSTOMER_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Contact
            </button>
          </div>
        </div>

        {/* Desktop Table */}
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
              <th>Role</th>
              <th className="sortable" onClick={() => handleSort('phone')}>
                Phone
                {sortColumn === 'phone' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('customerType')}>
                Type
                {sortColumn === 'customerType' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredContacts.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No contacts found.
                </td>
              </tr>
            ) : (
              filteredContacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="operation-name">{contact.name}</td>
                  <td style={{ fontSize: '13px' }}>
                    {contact.operationNames.length > 0 ? contact.operationNames.join(', ') : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {contact.isMainContact && (
                        <span style={{ fontSize: '10px', background: 'var(--accent-green-dim)', color: 'var(--accent-green)', padding: '2px 6px', borderRadius: '4px' }}>Main</span>
                      )}
                      {contact.isInvoiceContact && (
                        <span style={{ fontSize: '10px', background: 'var(--accent-blue-dim, rgba(59, 130, 246, 0.2))', color: 'var(--accent-blue, #3b82f6)', padding: '2px 6px', borderRadius: '4px' }}>Invoice</span>
                      )}
                      {!contact.isMainContact && !contact.isInvoiceContact && (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: '13px' }}>{contact.phone || '—'}</td>
                  <td>{getTypeBadge(contact.customerType)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="action-btn" title="Edit" onClick={() => openEditModal(contact)}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button className="action-btn" title="Delete" onClick={() => handleDelete(contact)}>
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

        {/* Mobile Cards */}
        <div className="mobile-cards">
          {filteredContacts.length === 0 ? (
            <div className="empty-state">No contacts found.</div>
          ) : (
            filteredContacts.map((contact) => (
              <div key={contact.id} className="mobile-card">
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{contact.name}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {contact.isMainContact && (
                      <span style={{ fontSize: '10px', background: 'var(--accent-green-dim)', color: 'var(--accent-green)', padding: '2px 6px', borderRadius: '4px' }}>Main</span>
                    )}
                    {contact.isInvoiceContact && (
                      <span style={{ fontSize: '10px', background: 'var(--accent-blue-dim, rgba(59, 130, 246, 0.2))', color: 'var(--accent-blue, #3b82f6)', padding: '2px 6px', borderRadius: '4px' }}>Invoice</span>
                    )}
                  </div>
                </div>
                <div className="mobile-card-body">
                  {contact.operationNames.length > 0 && (
                    <div className="mobile-card-row"><span>Operation:</span> {contact.operationNames.join(', ')}</div>
                  )}
                  {contact.phone && <div className="mobile-card-row"><span>Phone:</span> {contact.phone}</div>}
                  {contact.email && <div className="mobile-card-row"><span>Email:</span> {contact.email}</div>}
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary" onClick={() => openEditModal(contact)}>Edit</button>
                  <button className="btn btn-secondary" onClick={() => handleDelete(contact)}>Delete</button>
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
              <h3>Add Contact</h3>
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
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contact name" />
                </div>
                <div className="form-group">
                  <label>Operation</label>
                  <select
                    value={form.operations[0] || ''}
                    onChange={(e) => setForm({ ...form, operations: e.target.value ? [e.target.value] : [] })}
                  >
                    <option value="">Select operation...</option>
                    {operations.map((op) => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Main Contact?</label>
                  <select value={form.is_main_contact} onChange={(e) => setForm({ ...form, is_main_contact: e.target.value })}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 555-5555" />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Enter address..." rows={2} />
                </div>
                <div className="form-group">
                  <label>Customer Type</label>
                  <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                    <option value="">Select type...</option>
                    {CUSTOMER_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Enter notes..." rows={3} />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddContact} disabled={saving}>
                {saving ? 'Creating...' : 'Create Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedContact && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Contact</h3>
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
                  <select
                    value={form.operations[0] || ''}
                    onChange={(e) => setForm({ ...form, operations: e.target.value ? [e.target.value] : [] })}
                  >
                    <option value="">Select operation...</option>
                    {operations.map((op) => (
                      <option key={op.id} value={op.id}>{op.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Main Contact?</label>
                  <select value={form.is_main_contact} onChange={(e) => setForm({ ...form, is_main_contact: e.target.value })}>
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
                </div>
                <div className="form-group">
                  <label>Customer Type</label>
                  <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                    <option value="">Select type...</option>
                    {CUSTOMER_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditContact} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
