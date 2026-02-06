'use client';

import { useState, useMemo } from 'react';
import type { ProcessedInventoryItem, EquipmentCount } from './page';

interface InventoryClientProps {
  initialItems: ProcessedInventoryItem[];
  categoryOptions: string[];
  antennaNeeds: EquipmentCount[];
  batteryNeeds: EquipmentCount[];
  equipmentSeason: string;
}

const initialForm = {
  itemName: '',
  category: '',
  quantity: '',
};

export default function InventoryClient({ initialItems, categoryOptions, antennaNeeds, batteryNeeds, equipmentSeason }: InventoryClientProps) {
  const [items, setItems] = useState<ProcessedInventoryItem[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ProcessedInventoryItem | null>(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('itemName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredItems = useMemo(() => {
    let filtered = items;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.itemName.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
      );
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter((item) => item.category === filterCategory);
    }

    filtered = [...filtered].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortColumn) {
        case 'itemName': aVal = a.itemName.toLowerCase(); bVal = b.itemName.toLowerCase(); break;
        case 'category': aVal = a.category.toLowerCase(); bVal = b.category.toLowerCase(); break;
        case 'quantity': aVal = a.quantity; bVal = b.quantity; break;
        default: aVal = a.itemName.toLowerCase(); bVal = b.itemName.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [items, searchQuery, filterCategory, sortColumn, sortDirection]);

  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

  const handleAdd = async () => {
    if (!form.itemName.trim()) {
      alert('Item name is required');
      return;
    }
    setSaving(true);

    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: form.itemName,
          category: form.category || null,
          quantity: parseInt(form.quantity) || 0,
        }),
      });

      if (response.ok) {
        setShowAddModal(false);
        setForm(initialForm);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create item');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create item');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedItem) return;
    if (!form.itemName.trim()) {
      alert('Item name is required');
      return;
    }
    setSaving(true);

    try {
      const response = await fetch(`/api/inventory/${selectedItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: form.itemName,
          category: form.category || null,
          quantity: parseInt(form.quantity) || 0,
        }),
      });

      if (response.ok) {
        // Update local state
        setItems(items.map((item) =>
          item.id === selectedItem.id
            ? {
                ...item,
                itemName: form.itemName,
                category: form.category || 'Uncategorized',
                quantity: parseInt(form.quantity) || 0,
              }
            : item
        ));
        setShowEditModal(false);
        setSelectedItem(null);
        setForm(initialForm);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update item');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ProcessedInventoryItem) => {
    if (!confirm(`Delete "${item.itemName}"?`)) return;

    try {
      const response = await fetch(`/api/inventory/${item.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setItems(items.filter((i) => i.id !== item.id));
      } else {
        alert('Failed to delete item');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete item');
    }
  };

  const openEditModal = (item: ProcessedInventoryItem) => {
    setSelectedItem(item);
    setForm({
      itemName: item.itemName,
      category: item.category,
      quantity: item.quantity.toString(),
    });
    setShowEditModal(true);
  };

  const getCategoryBadge = (category: string) => {
    const colorMap: Record<string, string> = {
      'Antennas': 'in-stock',
      'Batteries': 'pending',
      'Flags': 'installed',
      'Tools': 'repair',
      'Probes': 'in-stock',
      'Sensors': 'pending',
    };
    return (
      <span className={`status-badge ${colorMap[category] || 'needs-probe'}`}>
        <span className="status-dot"></span>
        {category}
      </span>
    );
  };

  // Combine dynamic categories with any predefined ones
  const allCategories = useMemo(() => {
    const combined = new Set([...categoryOptions]);
    return Array.from(combined).sort();
  }, [categoryOptions]);

  return (
    <>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Items</div>
          <div className="stat-value blue">{items.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Quantity</div>
          <div className="stat-value green">{totalQuantity}</div>
        </div>
      </div>

      {/* Equipment Needs for Current Season */}
      {(antennaNeeds.length > 0 || batteryNeeds.length > 0) && (
        <div className="table-container" style={{ marginBottom: '24px' }}>
          <div className="table-header">
            <h3 className="table-title">Equipment Needed - {equipmentSeason} Season</h3>
          </div>
          <div style={{ padding: '16px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {antennaNeeds.length > 0 && (
              <div style={{ flex: '1', minWidth: '250px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Antennas</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {antennaNeeds.map((item) => (
                    <div key={item.type} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{item.type}</span>
                      <strong style={{ fontSize: '14px', color: 'var(--accent-blue)' }}>{item.count}</strong>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderTop: '1px solid var(--border)',
                    marginTop: '4px',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{antennaNeeds.reduce((sum, i) => sum + i.count, 0)}</strong>
                  </div>
                </div>
              </div>
            )}
            {batteryNeeds.length > 0 && (
              <div style={{ flex: '1', minWidth: '250px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Batteries</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {batteryNeeds.map((item) => (
                    <div key={item.type} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius)',
                    }}>
                      <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{item.type}</span>
                      <strong style={{ fontSize: '14px', color: 'var(--accent-green)' }}>{item.count}</strong>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderTop: '1px solid var(--border)',
                    marginTop: '4px',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{batteryNeeds.reduce((sum, i) => sum + i.count, 0)}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Inventory Items ({filteredItems.length})</h3>
          <div className="table-actions">
            <div className="search-box" style={{ width: '200px' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>
          </div>
        </div>

        <table className="desktop-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('itemName')}>
                Item Name
                {sortColumn === 'itemName' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('category')}>
                Category
                {sortColumn === 'category' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th className="sortable" onClick={() => handleSort('quantity')}>
                Quantity
                {sortColumn === 'quantity' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No items found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="operation-name">{item.itemName}</td>
                  <td>{getCategoryBadge(item.category)}</td>
                  <td>{item.quantity}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="action-btn" title="Edit" onClick={() => openEditModal(item)}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button className="action-btn" title="Delete" onClick={() => handleDelete(item)}>
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
          {filteredItems.length === 0 ? (
            <div className="empty-state">No items found.</div>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id} className="mobile-card" onClick={() => openEditModal(item)}>
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{item.itemName}</span>
                  {getCategoryBadge(item.category)}
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span>Quantity:</span>
                    <strong>{item.quantity}</strong>
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
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                  >
                    Delete
                  </button>
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

      {/* Add Modal */}
      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add Inventory Item</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Item Name *</label>
                  <input type="text" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="Item name" />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="">Select category...</option>
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Create Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedItem && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Inventory Item</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Item Name *</label>
                  <input type="text" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="">Select category...</option>
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
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
