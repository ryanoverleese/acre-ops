'use client';

import { useState, useMemo } from 'react';
import type { ProcessedBillingEntity, OperationOption, ContactOption } from './page';

interface Props {
  initialEntities: ProcessedBillingEntity[];
  operations: OperationOption[];
  contacts: ContactOption[];
}

export default function BillingEntitiesClient({ initialEntities, operations, contacts }: Props) {
  const [entities, setEntities] = useState(initialEntities);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<ProcessedBillingEntity | null>(null);
  const [formName, setFormName] = useState('');
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

  const filteredEntities = useMemo(() => {
    let filtered = entities;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.operationNames.some((name) => name.toLowerCase().includes(query)) ||
          e.contactNames.some((name) => name.toLowerCase().includes(query))
      );
    }

    filtered = [...filtered].sort((a, b) => {
      let aVal = '';
      let bVal = '';

      switch (sortColumn) {
        case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
        case 'operation': aVal = a.operationNames.join(',').toLowerCase(); bVal = b.operationNames.join(',').toLowerCase(); break;
        case 'contact': aVal = a.contactNames.join(',').toLowerCase(); bVal = b.contactNames.join(',').toLowerCase(); break;
        default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [entities, searchQuery, sortColumn, sortDirection]);

  const handleAdd = async () => {
    if (!formName.trim()) {
      alert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/billing-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName }),
      });

      if (response.ok) {
        const newEntity = await response.json();
        setEntities([
          ...entities,
          {
            id: newEntity.id,
            name: newEntity.name || '',
            operationNames: [],
            contactIds: [],
            contactNames: [],
          },
        ]);
        setShowAddModal(false);
        setFormName('');
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
    if (!formName.trim()) {
      alert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/billing-entities/${selectedEntity.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName }),
      });

      if (response.ok) {
        setEntities(
          entities.map((e) =>
            e.id === selectedEntity.id
              ? { ...e, name: formName }
              : e
          )
        );
        setShowEditModal(false);
        setSelectedEntity(null);
        setFormName('');
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
    setFormName('');
    setShowAddModal(true);
  };

  const openEditModal = (entity: ProcessedBillingEntity) => {
    setSelectedEntity(entity);
    setFormName(entity.name);
    setShowEditModal(true);
  };

  return (
    <>
      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">All Billing Entities ({filteredEntities.length})</h3>
          <div className="table-actions">
            <div className="search-box be-search-narrow">
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
                Operations
                {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('contact')}>
                Contacts
                {sortColumn === 'contact' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredEntities.length === 0 ? (
              <tr>
                <td colSpan={4} className="be-empty-cell">
                  No billing entities found.
                </td>
              </tr>
            ) : (
              filteredEntities.map((entity) => (
                <tr key={entity.id}>
                  <td className="operation-name">{entity.name}</td>
                  <td className="be-detail-cell">
                    {entity.operationNames.length > 0 ? entity.operationNames.join(', ') : '—'}
                  </td>
                  <td className="be-detail-cell">
                    {entity.contactNames.length > 0 ? entity.contactNames.join(', ') : '—'}
                  </td>
                  <td>
                    <div className="be-actions">
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
                  {entity.operationNames.length > 0 && (
                    <div className="mobile-card-row"><span>Operations:</span> {entity.operationNames.join(', ')}</div>
                  )}
                  {entity.contactNames.length > 0 && (
                    <div className="mobile-card-row"><span>Contacts:</span> {entity.contactNames.join(', ')}</div>
                  )}
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

      <p className="be-hint">
        Operations and contacts are linked through the Contacts page. To associate a billing entity with an operation, edit the contact and set both their operation and billing entity.
      </p>

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
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Billing entity name"
                  />
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
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
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
