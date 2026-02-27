'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import type { ProcessedOrder, ProcessedOrderItem, CatalogProduct, BillingEntityOption } from './page';

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  customer: 200,
  status: 120,
  date: 120,
  items: 100,
  total: 120,
};
const COLUMN_WIDTHS_STORAGE_KEY = 'orders-column-widths';

interface OrdersClientProps {
  orders: ProcessedOrder[];
  billingEntities: BillingEntityOption[];
  catalog: CatalogProduct[];
  statusOptions: string[];
}

type ViewMode = 'list' | 'detail';

interface NewLineItem {
  productId: number | null;
  productName: string;
  quantity: number;
  unitPrice: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OrdersClient({ orders: initialOrders, billingEntities, catalog, statusOptions }: OrdersClientProps) {
  const router = useRouter();
  const { columnWidths, resizingColumn, handleResizeStart, handleResetColumnWidth } = useResizableColumns({
    defaultWidths: DEFAULT_COLUMN_WIDTHS,
    storageKey: COLUMN_WIDTHS_STORAGE_KEY,
  });
  const [orders, setOrders] = useState(initialOrders);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedOrder, setSelectedOrder] = useState<ProcessedOrder | null>(null);

  // Sync orders state when server re-renders with fresh data (e.g., after router.refresh())
  useEffect(() => {
    setOrders(initialOrders);
    // Also update selectedOrder if it exists, to reflect fresh item data
    if (selectedOrder) {
      const updated = initialOrders.find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    }
  }, [initialOrders]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Create modal state
  const [newBillingEntity, setNewBillingEntity] = useState<number | null>(null);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newNotes, setNewNotes] = useState('');
  const [newItems, setNewItems] = useState<NewLineItem[]>([
    { productId: null, productName: '', quantity: 1, unitPrice: 0 },
  ]);

  // Add item to order state
  const [showAddItem, setShowAddItem] = useState(false);
  const [addItemProduct, setAddItemProduct] = useState<number | null>(null);
  const [addItemQty, setAddItemQty] = useState(1);
  const [addItemPrice, setAddItemPrice] = useState(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (filterStatus !== 'all') {
      result = result.filter(o => o.status === filterStatus);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(o =>
        o.billingEntityName.toLowerCase().includes(term) ||
        o.notes.toLowerCase().includes(term) ||
        o.items.some(i => i.productName.toLowerCase().includes(term))
      );
    }
    return result.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''));
  }, [orders, filterStatus, searchTerm]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
    }
    return counts;
  }, [orders]);

  // Copy quote to clipboard
  const copyQuote = useCallback((order: ProcessedOrder) => {
    const lines: string[] = [];
    lines.push('Acre Insights - Quote');
    lines.push(order.billingEntityName);
    lines.push(formatDate(order.orderDate));
    lines.push('');

    for (const item of order.items) {
      const name = item.productName || 'Item';
      const price = formatCurrency(item.unitPrice * item.quantity);
      lines.push(`${item.quantity}x ${name}    ${price}`);
    }

    lines.push('');
    lines.push(`                    Total: ${formatCurrency(order.total)}`);
    lines.push('');
    lines.push(`Valid for ${order.quoteValidDays} days.`);

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Quote copied to clipboard');
  }, [showToast]);

  // Create a new quote
  const handleCreateQuote = useCallback(async () => {
    if (!newBillingEntity) {
      showToast('Please select a customer');
      return;
    }
    const validItems = newItems.filter(i => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one item');
      return;
    }

    setSaving(true);
    try {
      // 1. Create the order
      const orderResp = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_entity: newBillingEntity,
          order_date: newDate,
          status: 'Quote',
          notes: newNotes,
          quote_valid_days: 30,
        }),
      });

      if (!orderResp.ok) {
        const err = await orderResp.json();
        throw new Error(err.details || err.error || 'Failed to create order');
      }

      const newOrder = await orderResp.json();

      // 2. Create line items
      for (const item of validItems) {
        const itemResp = await fetch('/api/order-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order: newOrder.id,
            product: item.productId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          }),
        });
        if (!itemResp.ok) {
          const err = await itemResp.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Failed to create order item:', err);
          throw new Error(`Failed to create line item: ${err.details || err.error}`);
        }
      }

      showToast('Quote created');
      setShowCreateModal(false);
      resetCreateForm();
      router.refresh();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [newBillingEntity, newDate, newNotes, newItems, router, showToast]);

  const resetCreateForm = useCallback(() => {
    setNewBillingEntity(null);
    setNewDate(new Date().toISOString().split('T')[0]);
    setNewNotes('');
    setNewItems([{ productId: null, productName: '', quantity: 1, unitPrice: 0 }]);
  }, []);

  // Update order status
  const updateStatus = useCallback(async (order: ProcessedOrder, newStatus: string) => {
    setSaving(true);
    try {
      const resp = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!resp.ok) throw new Error('Failed to update status');

      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: newStatus } : o
      ));
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
      showToast(`Status updated to ${newStatus}`);
    } catch {
      showToast('Failed to update status');
    } finally {
      setSaving(false);
    }
  }, [selectedOrder, showToast]);

  // Fulfill order — update probe assignments from "On Order" to "Ready to Enter Serial"
  const fulfillOrder = useCallback(async (order: ProcessedOrder) => {
    if (!confirm(`Fulfill this order? This will update "On Order" probe assignments to "Ready to Enter Serial".`)) return;

    setSaving(true);
    try {
      // Count probes in this order
      const probeItems = order.items.filter(i => {
        const name = (i.productName || '').toLowerCase();
        return name.includes('probe') || name.includes('cropx');
      });
      const probeCount = probeItems.reduce((sum, i) => sum + i.quantity, 0);

      const resp = await fetch('/api/orders/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          billingEntityId: order.billingEntityId,
          probeCount: probeCount || undefined,
        }),
      });

      if (!resp.ok) throw new Error('Failed to fulfill order');

      const result = await resp.json();
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: 'Fulfilled' } : o
      ));
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(prev => prev ? { ...prev, status: 'Fulfilled' } : null);
      }
      showToast(`Fulfilled! ${result.updatedAssignments} probe assignments updated.`);
      router.refresh();
    } catch {
      showToast('Failed to fulfill order');
    } finally {
      setSaving(false);
    }
  }, [selectedOrder, router, showToast]);

  // Delete order
  const deleteOrder = useCallback(async (order: ProcessedOrder) => {
    if (!confirm(`Delete this ${order.status.toLowerCase()}? This cannot be undone.`)) return;

    setSaving(true);
    try {
      // Delete items first
      for (const item of order.items) {
        await fetch(`/api/order-items/${item.id}`, { method: 'DELETE' });
      }
      // Delete order
      const resp = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete');

      setOrders(prev => prev.filter(o => o.id !== order.id));
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(null);
        setViewMode('list');
      }
      showToast('Deleted');
      router.refresh();
    } catch {
      showToast('Failed to delete');
    } finally {
      setSaving(false);
    }
  }, [selectedOrder, router, showToast]);

  // Add item to existing order
  const handleAddItemToOrder = useCallback(async () => {
    if (!selectedOrder || !addItemProduct) return;

    setSaving(true);
    try {
      const resp = await fetch('/api/order-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: selectedOrder.id,
          product: addItemProduct,
          quantity: addItemQty,
          unit_price: addItemPrice,
        }),
      });

      if (!resp.ok) throw new Error('Failed to add item');

      showToast('Item added');
      setShowAddItem(false);
      setAddItemProduct(null);
      setAddItemQty(1);
      setAddItemPrice(0);
      router.refresh();
    } catch {
      showToast('Failed to add item');
    } finally {
      setSaving(false);
    }
  }, [selectedOrder, addItemProduct, addItemQty, addItemPrice, router, showToast]);

  // Delete item from order
  const handleDeleteItem = useCallback(async (itemId: number) => {
    if (!confirm('Remove this item?')) return;
    setSaving(true);
    try {
      await fetch(`/api/order-items/${itemId}`, { method: 'DELETE' });
      showToast('Item removed');
      router.refresh();
    } catch {
      showToast('Failed to remove item');
    } finally {
      setSaving(false);
    }
  }, [router, showToast]);

  // Next line item in create form
  const addNewItemRow = useCallback(() => {
    setNewItems(prev => [...prev, { productId: null, productName: '', quantity: 1, unitPrice: 0 }]);
  }, []);

  const updateNewItem = useCallback((index: number, field: keyof NewLineItem, value: unknown) => {
    setNewItems(prev => {
      const updated = [...prev];
      if (field === 'productId') {
        const product = catalog.find(p => p.id === value);
        updated[index] = {
          ...updated[index],
          productId: value as number,
          productName: product?.name || '',
          unitPrice: product?.rate || 0,
        };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  }, [catalog]);

  const removeNewItem = useCallback((index: number) => {
    setNewItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  // New items total
  const newItemsTotal = useMemo(() =>
    newItems.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0),
    [newItems]
  );

  // Dealer margin total (total - sum of dealer fees)
  const newItemsMarginTotal = useMemo(() =>
    newItems.reduce((sum, i) => {
      const product = catalog.find(p => p.id === i.productId);
      const dealerFee = product?.dealerFee || 0;
      return sum + (i.quantity * (i.unitPrice - dealerFee));
    }, 0),
    [newItems, catalog]
  );

  // Status badge
  const statusBadge = (status: string) => (
    <span className={`status-badge order-status-${status.toLowerCase()}`}>
      {status}
    </span>
  );

  // Get next status in the progression
  const getNextStatus = (current: string): string | null => {
    const flow = ['Quote', 'Ordered', 'Shipped', 'Received'];
    const idx = flow.indexOf(current);
    return idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Orders & Quotes</h2>
        </div>
        <button
          onClick={() => { resetCreateForm(); setShowCreateModal(true); }}
          className="btn btn-primary"
        >
          + New Quote
        </button>
      </header>
      <div className="content">
        {/* Toast */}
        {toast && (
          <div className="order-toast">
            {toast}
          </div>
        )}

        {/* Status filter tabs */}
      <div className="order-filter-tabs">
        {['all', ...statusOptions].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`order-filter-tab ${filterStatus === status ? 'active' : ''}`}
          >
            {status === 'all' ? 'All' : status} ({statusCounts[status] || 0})
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search orders..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="order-search"
      />

      {/* List view */}
      {viewMode === 'list' && (
        <div className="table-container">
          {/* Desktop table view */}
          <table className="desktop-table order-list-table" style={{ userSelect: resizingColumn ? 'none' : undefined }}>
            <colgroup>
              <col style={{ width: columnWidths.customer }} />
              <col style={{ width: columnWidths.status }} />
              <col style={{ width: columnWidths.date }} />
              <col style={{ width: columnWidths.items }} />
              <col style={{ width: columnWidths.total }} />
            </colgroup>
            <thead>
              <tr>
                <th className="order-th th-resizable">
                  <span className="th-content">Customer</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('customer', e)}
                    onDoubleClick={() => handleResetColumnWidth('customer')}
                    className={`resize-handle${resizingColumn === 'customer' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="order-th th-resizable">
                  <span className="th-content">Status</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('status', e)}
                    onDoubleClick={() => handleResetColumnWidth('status')}
                    className={`resize-handle${resizingColumn === 'status' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="order-th th-resizable">
                  <span className="th-content">Date</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('date', e)}
                    onDoubleClick={() => handleResetColumnWidth('date')}
                    className={`resize-handle${resizingColumn === 'date' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="order-th th-resizable">
                  <span className="th-content">Items</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('items', e)}
                    onDoubleClick={() => handleResetColumnWidth('items')}
                    className={`resize-handle${resizingColumn === 'items' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
                <th className="order-th order-th-right th-resizable">
                  <span className="th-content">Total</span>
                  <div
                    onMouseDown={(e) => handleResizeStart('total', e)}
                    onDoubleClick={() => handleResetColumnWidth('total')}
                    className={`resize-handle${resizingColumn === 'total' ? ' active' : ''}`}
                    title="Drag to resize, double-click to reset"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="order-empty-state">
                    No orders found. Create a new quote to get started.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr
                    key={order.id}
                    className="order-list-row"
                    onClick={() => { setSelectedOrder(order); setViewMode('detail'); }}
                  >
                    <td className="order-td">
                      <span className="order-customer-name">
                        {order.billingEntityName || 'No Customer'}
                      </span>
                    </td>
                    <td className="order-td">
                      {statusBadge(order.status)}
                    </td>
                    <td className="order-td order-td-muted">
                      {formatDate(order.orderDate)}
                    </td>
                    <td className="order-td order-td-muted">
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </td>
                    <td className="order-td order-td-right order-td-total">
                      {formatCurrency(order.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Mobile card view */}
          <div className="mobile-cards">
            {filteredOrders.length === 0 ? (
              <div className="order-empty-state">
                No orders found. Create a new quote to get started.
              </div>
            ) : (
              filteredOrders.map(order => (
                <div
                  key={order.id}
                  className="mobile-card"
                  onClick={() => { setSelectedOrder(order); setViewMode('detail'); }}
                >
                  <div className="mobile-card-header">
                    <span className="mobile-card-title">
                      {order.billingEntityName || 'No Customer'}
                    </span>
                    {statusBadge(order.status)}
                  </div>
                  <div className="mobile-card-body">
                    <div className="mobile-card-row">
                      <span>Total:</span> {formatCurrency(order.total)}
                    </div>
                    <div className="mobile-card-row">
                      <span>Items:</span> {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </div>
                    <div className="mobile-card-row">
                      <span>Date:</span> {formatDate(order.orderDate)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Detail view */}
      {viewMode === 'detail' && selectedOrder && (
        <div>
          <button
            onClick={() => { setViewMode('list'); setSelectedOrder(null); }}
            className="order-back-btn"
          >
            &larr; Back to orders
          </button>

          <div className="order-detail-card">
            {/* Order header */}
            <div className="order-detail-header">
              <div>
                <h2 className="order-detail-title">
                  {selectedOrder.billingEntityName || 'No Customer'}
                </h2>
                <div className="order-detail-meta">
                  {formatDate(selectedOrder.orderDate)} &middot; {statusBadge(selectedOrder.status)}
                </div>
                {selectedOrder.notes && (
                  <div className="order-detail-notes">
                    {selectedOrder.notes}
                  </div>
                )}
              </div>
              <div className="order-detail-actions">
                {selectedOrder.status === 'Quote' && (
                  <button
                    onClick={() => copyQuote(selectedOrder)}
                    className="order-btn-outline"
                  >
                    Copy Quote
                  </button>
                )}
                {getNextStatus(selectedOrder.status) && (
                  <button
                    onClick={() => updateStatus(selectedOrder, getNextStatus(selectedOrder.status)!)}
                    disabled={saving}
                    className={`order-btn-status order-btn-status-${getNextStatus(selectedOrder.status)!.toLowerCase()} ${saving ? 'disabled' : ''}`}
                  >
                    Mark as {getNextStatus(selectedOrder.status)}
                  </button>
                )}
                {selectedOrder.status === 'Received' && (
                  <button
                    onClick={() => fulfillOrder(selectedOrder)}
                    disabled={saving}
                    className={`order-btn-fulfill ${saving ? 'disabled' : ''}`}
                  >
                    Fulfill Order
                  </button>
                )}
                <button
                  onClick={() => deleteOrder(selectedOrder)}
                  disabled={saving}
                  className={`order-btn-delete ${saving ? 'disabled' : ''}`}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Line items table */}
            <div className="order-items-wrap">
              <table className="order-items-table">
                <thead>
                  <tr className="order-items-thead-row">
                    <th className="order-items-th">Product</th>
                    <th className="order-items-th order-items-th-right">Qty</th>
                    <th className="order-items-th order-items-th-right">Unit Price</th>
                    <th className="order-items-th order-items-th-right">Total</th>
                    <th className="order-items-th-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map(item => (
                    <tr key={item.id} className="order-items-row">
                      <td className="order-items-td">{item.productName}</td>
                      <td className="order-items-td order-items-td-right order-items-td-secondary">{item.quantity}</td>
                      <td className="order-items-td order-items-td-right order-items-td-secondary">{formatCurrency(item.unitPrice)}</td>
                      <td className="order-items-td order-items-td-right order-items-td-bold">{formatCurrency(item.quantity * item.unitPrice)}</td>
                      <td className="order-items-td order-items-td-center">
                        {(selectedOrder.status === 'Quote' || selectedOrder.status === 'Ordered') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                            className="order-item-remove-btn"
                            title="Remove item"
                          >
                            &times;
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="order-items-total-label">Total:</td>
                    <td className="order-items-total-value">{formatCurrency(selectedOrder.total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Add item button */}
            {(selectedOrder.status === 'Quote' || selectedOrder.status === 'Ordered') && (
              <div className="order-add-item-section">
                {!showAddItem ? (
                  <button
                    onClick={() => setShowAddItem(true)}
                    className="order-add-item-btn"
                  >
                    + Add Item
                  </button>
                ) : (
                  <div className="order-add-item-form">
                    <div className="order-add-item-field order-add-item-field-product">
                      <label className="order-add-item-label">Product</label>
                      <select
                        value={addItemProduct || ''}
                        onChange={e => {
                          const id = parseInt(e.target.value);
                          setAddItemProduct(id);
                          const product = catalog.find(p => p.id === id);
                          if (product) setAddItemPrice(product.rate);
                        }}
                        className="order-add-item-select"
                      >
                        <option value="">Select product...</option>
                        {catalog.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.rate)})</option>
                        ))}
                      </select>
                    </div>
                    <div className="order-add-item-field order-add-item-field-qty">
                      <label className="order-add-item-label">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={addItemQty}
                        onChange={e => setAddItemQty(parseInt(e.target.value) || 1)}
                        className="order-add-item-input"
                      />
                    </div>
                    <div className="order-add-item-field order-add-item-field-price">
                      <label className="order-add-item-label">Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={addItemPrice}
                        onChange={e => setAddItemPrice(parseFloat(e.target.value) || 0)}
                        className="order-add-item-input"
                      />
                    </div>
                    <button
                      onClick={handleAddItemToOrder}
                      disabled={saving || !addItemProduct}
                      className={`btn btn-primary order-add-item-submit ${saving || !addItemProduct ? 'disabled' : ''}`}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddItem(false)}
                      className="order-add-item-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Quote Modal */}
      {showCreateModal && (
        <div className="detail-panel-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="detail-panel" onClick={e => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>New Quote</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Customer</label>
                  <select
                    value={newBillingEntity || ''}
                    onChange={e => setNewBillingEntity(parseInt(e.target.value) || null)}
                  >
                    <option value="">Select customer...</option>
                    {billingEntities.map(be => (
                      <option key={be.id} value={be.id}>{be.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Items</label>
                  {newItems.map((item, idx) => (
                    <div key={idx} className="order-new-item-card">
                      <select
                        value={item.productId || ''}
                        onChange={e => updateNewItem(idx, 'productId', parseInt(e.target.value) || null)}
                        className="order-new-item-select"
                      >
                        <option value="">Select product...</option>
                        {catalog.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.rate)})</option>
                        ))}
                      </select>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Qty</label>
                          <input type="number" min="1" value={item.quantity} onChange={e => updateNewItem(idx, 'quantity', parseInt(e.target.value) || 1)} />
                        </div>
                        <div className="form-group">
                          <label>Price</label>
                          <input type="number" step="0.01" value={item.unitPrice} onChange={e => updateNewItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="order-new-item-total-col">
                          <span className="order-new-item-total">
                            {formatCurrency(item.quantity * item.unitPrice)}
                          </span>
                          {newItems.length > 1 && (
                            <button onClick={() => removeNewItem(idx)} className="order-new-item-remove">&times;</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addNewItemRow}
                    className="btn btn-secondary order-add-line-btn"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="order-modal-total-row">
                  <span className="order-modal-total">
                    Total: {formatCurrency(newItemsTotal)}
                  </span>
                  <span className="order-modal-margin">
                    Margin: {formatCurrency(newItemsMarginTotal)}
                  </span>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateQuote} disabled={saving}>
                {saving ? 'Creating...' : 'Create Quote'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
