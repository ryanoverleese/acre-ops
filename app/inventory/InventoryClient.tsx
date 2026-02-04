'use client';

import { useState, useMemo } from 'react';

interface InventoryItem {
  id: number;
  itemName: string;
  category: string;
  quantity: number;
  rackLocation: string;
  reorderThreshold: number;
  notes: string;
}

const CATEGORY_OPTIONS = ['Antennas', 'Batteries', 'Flags', 'Tools', 'Other'];

const initialForm = {
  itemName: '',
  category: '',
  quantity: '',
  rackLocation: '',
  reorderThreshold: '',
  notes: '',
};

// Sample data - replace with API calls when Baserow table is created
const sampleItems: InventoryItem[] = [
  { id: 1, itemName: 'Tall Antenna', category: 'Antennas', quantity: 15, rackLocation: 'A1-01', reorderThreshold: 5, notes: '' },
  { id: 2, itemName: 'Short Antenna', category: 'Antennas', quantity: 22, rackLocation: 'A1-02', reorderThreshold: 5, notes: '' },
  { id: 3, itemName: 'AA Batteries (Pack of 4)', category: 'Batteries', quantity: 48, rackLocation: 'B2-01', reorderThreshold: 20, notes: '' },
  { id: 4, itemName: 'Field Flags (Orange)', category: 'Flags', quantity: 200, rackLocation: 'C1-01', reorderThreshold: 50, notes: '' },
];

export default function InventoryClient() {
  const [items, setItems] = useState<InventoryItem[]>(sampleItems);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
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
          item.rackLocation.toLowerCase().includes(query)
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
        case 'rackLocation': aVal = a.rackLocation.toLowerCase(); bVal = b.rackLocation.toLowerCase(); break;
        default: aVal = a.itemName.toLowerCase(); bVal = b.itemName.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [items, searchQuery, filterCategory, sortColumn, sortDirection]);

  const lowStockItems = items.filter((item) => item.quantity <= item.reorderThreshold);

  const handleAdd = () => {
    if (!form.itemName.trim()) {
      alert('Item name is required');
      return;
    }
    setSaving(true);

    const newItem: InventoryItem = {
      id: Date.now(),
      itemName: form.itemName,
      category: form.category || 'Other',
      quantity: parseInt(form.quantity) || 0,
      rackLocation: form.rackLocation,
      reorderThreshold: parseInt(form.reorderThreshold) || 0,
      notes: form.notes,
    };

    setItems([...items, newItem]);
    setShowAddModal(false);
    setForm(initialForm);
    setSaving(false);
  };

  const handleEdit = () => {
    if (!selectedItem) return;
    if (!form.itemName.trim()) {
      alert('Item name is required');
      return;
    }
    setSaving(true);

    setItems(
      items.map((item) =>
        item.id === selectedItem.id
          ? {
              ...item,
              itemName: form.itemName,
              category: form.category || 'Other',
              quantity: parseInt(form.quantity) || 0,
              rackLocation: form.rackLocation,
              reorderThreshold: parseInt(form.reorderThreshold) || 0,
              notes: form.notes,
            }
          : item
      )
    );

    setShowEditModal(false);
    setSelectedItem(null);
    setForm(initialForm);
    setSaving(false);
  };

  const handleDelete = (item: InventoryItem) => {
    if (!confirm(`Delete "${item.itemName}"?`)) return;
    setItems(items.filter((i) => i.id !== item.id));
  };

  const openEditModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setForm({
      itemName: item.itemName,
      category: item.category,
      quantity: item.quantity.toString(),
      rackLocation: item.rackLocation,
      reorderThreshold: item.reorderThreshold.toString(),
      notes: item.notes,
    });
    setShowEditModal(true);
  };

  const getCategoryBadge = (category: string) => {
    const colorMap: Record<string, string> = {
      'Antennas': 'in-stock',
      'Batteries': 'pending',
      'Flags': 'installed',
      'Tools': 'repair',
      'Other': 'needs-probe',
    };
    return (
      <span className={`status-badge ${colorMap[category] || 'needs-probe'}`}>
        <span className="status-dot"></span>
        {category}
      </span>
    );
  };

  return (
    <>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">Total Items</div>
          <div className="stat-value blue">{items.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Quantity</div>
          <div className="stat-value green">{items.reduce((sum, i) => sum + i.quantity, 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Low Stock Alerts</div>
          <div className="stat-value red">{lowStockItems.length}</div>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div style={{ background: 'var(--accent-red-dim)', border: '1px solid var(--accent-red)', borderRadius: 'var(--radius)', padding: '16px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--accent-red)' }}>Low Stock Items</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {lowStockItems.map((item) => (
              <span key={item.id} style={{ background: 'var(--bg-card)', padding: '4px 12px', borderRadius: '4px', fontSize: '13px' }}>
                {item.itemName}: {item.quantity} left
              </span>
            ))}
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
              {CATEGORY_OPTIONS.map((cat) => (
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
              <th className="sortable" onClick={() => handleSort('rackLocation')}>
                Rack Location
                {sortColumn === 'rackLocation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
              <th>Reorder At</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  No items found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} style={item.quantity <= item.reorderThreshold ? { background: 'var(--accent-red-dim)' } : undefined}>
                  <td className="operation-name">{item.itemName}</td>
                  <td>{getCategoryBadge(item.category)}</td>
                  <td style={{ color: item.quantity <= item.reorderThreshold ? 'var(--accent-red)' : undefined }}>
                    {item.quantity}
                  </td>
                  <td style={{ fontSize: '13px' }}>
                    {item.rackLocation || '—'}
                  </td>
                  <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    {item.reorderThreshold}
                  </td>
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
              <div key={item.id} className="mobile-card" style={item.quantity <= item.reorderThreshold ? { borderColor: 'var(--accent-red)' } : undefined}>
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{item.itemName}</span>
                  {getCategoryBadge(item.category)}
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span>Qty:</span>
                    <strong style={{ color: item.quantity <= item.reorderThreshold ? 'var(--accent-red)' : undefined }}>{item.quantity}</strong>
                  </div>
                  {item.rackLocation && <div className="mobile-card-row"><span>Location:</span> {item.rackLocation}</div>}
                </div>
                <div className="mobile-card-actions">
                  <button className="btn btn-secondary" onClick={() => openEditModal(item)}>Edit</button>
                  <button className="btn btn-secondary" onClick={() => handleDelete(item)}>Delete</button>
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
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Quantity</label>
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Reorder Threshold</label>
                    <input type="number" value={form.reorderThreshold} onChange={(e) => setForm({ ...form, reorderThreshold: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Rack Location</label>
                  <input type="text" value={form.rackLocation} onChange={(e) => setForm({ ...form, rackLocation: e.target.value })} placeholder="e.g. A1-01" />
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
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Quantity</label>
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Reorder Threshold</label>
                    <input type="number" value={form.reorderThreshold} onChange={(e) => setForm({ ...form, reorderThreshold: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Rack Location</label>
                  <input type="text" value={form.rackLocation} onChange={(e) => setForm({ ...form, rackLocation: e.target.value })} />
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
