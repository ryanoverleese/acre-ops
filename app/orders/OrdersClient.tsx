'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import SearchableSelect from '@/components/SearchableSelect';
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

interface EditLineItem {
  id?: number; // existing item id, undefined if new
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

  // Merge selection state
  const [mergeSelectedIds, setMergeSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeBillingEntity, setMergeBillingEntity] = useState<number | null>(null);
  const [mergeDate, setMergeDate] = useState(new Date().toISOString().split('T')[0]);
  const [mergeNotes, setMergeNotes] = useState('');

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editBillingEntity, setEditBillingEntity] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<EditLineItem[]>([]);

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

  // Compute merged line items from selected orders (combine same product, sum qty)
  const mergedItems = useMemo(() => {
    const selected = orders.filter(o => mergeSelectedIds.has(o.id));
    const map = new Map<number, { productId: number; productName: string; quantity: number; unitPrice: number; dealerFee: number }>();
    for (const order of selected) {
      for (const item of order.items) {
        if (!item.productId) continue;
        if (map.has(item.productId)) {
          map.get(item.productId)!.quantity += Number(item.quantity);
        } else {
          const catalogEntry = catalog.find(p => p.id === item.productId);
          map.set(item.productId, {
            productId: item.productId,
            productName: item.productName,
            quantity: Number(item.quantity),
            unitPrice: item.unitPrice,
            dealerFee: catalogEntry?.dealerFee ?? 0,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [orders, mergeSelectedIds, catalog]);

  const openMergeModal = useCallback(() => {
    const selected = orders.filter(o => mergeSelectedIds.has(o.id));
    // Default billing entity to the first selected order's BE
    setMergeBillingEntity(selected[0]?.billingEntityId ?? null);
    setMergeDate(new Date().toISOString().split('T')[0]);
    setMergeNotes(selected.map(o => o.billingEntityName).filter(Boolean).join(', '));
    setShowMergeModal(true);
  }, [orders, mergeSelectedIds]);

  const handleCreateMasterOrder = useCallback(async () => {
    if (mergedItems.length === 0) { showToast('No items to merge'); return; }
    setSaving(true);
    try {
      const orderResp = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_entity: mergeBillingEntity,
          order_date: mergeDate,
          status: 'Quote',
          notes: mergeNotes,
          quote_valid_days: 30,
        }),
      });
      if (!orderResp.ok) throw new Error('Failed to create master order');
      const newOrder = await orderResp.json();

      for (const item of mergedItems) {
        await fetch('/api/order-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: newOrder.id, product: item.productId, quantity: item.quantity, unit_price: item.unitPrice }),
        });
      }

      showToast('Master order created');
      setShowMergeModal(false);
      setMergeSelectedIds(new Set());
      router.refresh();
    } catch {
      showToast('Failed to create master order');
    } finally {
      setSaving(false);
    }
  }, [mergeBillingEntity, mergeDate, mergeNotes, mergedItems, router, showToast]);

  // Open edit modal pre-filled with current order data
  const openEditModal = useCallback((order: ProcessedOrder) => {
    setEditBillingEntity(order.billingEntityId);
    setEditDate(order.orderDate);
    setEditNotes(order.notes);
    setEditItems(order.items.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })));
    setShowEditModal(true);
  }, []);

  // Save edited quote
  const handleSaveEdit = useCallback(async () => {
    if (!selectedOrder) return;
    const validItems = editItems.filter(i => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one item');
      return;
    }

    setSaving(true);
    try {
      // Update the order header
      const orderResp = await fetch(`/api/orders/${selectedOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_entity: editBillingEntity,
          order_date: editDate,
          notes: editNotes,
        }),
      });
      if (!orderResp.ok) throw new Error('Failed to update order');

      // Delete all existing items, then re-create from editItems
      for (const item of selectedOrder.items) {
        await fetch(`/api/order-items/${item.id}`, { method: 'DELETE' });
      }
      for (const item of validItems) {
        await fetch('/api/order-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order: selectedOrder.id,
            product: item.productId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          }),
        });
      }

      showToast('Quote updated');
      setShowEditModal(false);
      router.refresh();
    } catch {
      showToast('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }, [selectedOrder, editBillingEntity, editDate, editNotes, editItems, router, showToast]);

  const updateEditItem = useCallback((index: number, field: keyof EditLineItem, value: unknown) => {
    setEditItems(prev => {
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

  // Duplicate order as a new Quote
  const duplicateOrder = useCallback(async (order: ProcessedOrder) => {
    setSaving(true);
    try {
      const orderResp = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_entity: order.billingEntityId,
          order_date: new Date().toISOString().split('T')[0],
          status: 'Quote',
          notes: order.notes,
          quote_valid_days: order.quoteValidDays,
        }),
      });

      if (!orderResp.ok) throw new Error('Failed to duplicate order');
      const newOrder = await orderResp.json();

      for (const item of order.items) {
        await fetch('/api/order-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order: newOrder.id,
            product: item.productId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          }),
        });
      }

      showToast('Quote duplicated');
      router.refresh();
    } catch {
      showToast('Failed to duplicate');
    } finally {
      setSaving(false);
    }
  }, [router, showToast]);

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

      {/* Merge toolbar — appears when orders are checked */}
      {mergeSelectedIds.size > 0 && (
        <div className="order-merge-toolbar">
          <span className="order-merge-count">{mergeSelectedIds.size} order{mergeSelectedIds.size !== 1 ? 's' : ''} selected</span>
          <button className="btn btn-primary" onClick={openMergeModal}>
            Merge to Master Order
          </button>
          <button className="order-merge-clear" onClick={() => setMergeSelectedIds(new Set())}>
            Clear
          </button>
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="table-container">
          {/* Desktop table view */}
          <table className="desktop-table order-list-table" style={{ userSelect: resizingColumn ? 'none' : undefined }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: columnWidths.customer }} />
              <col style={{ width: columnWidths.status }} />
              <col style={{ width: columnWidths.date }} />
              <col style={{ width: columnWidths.items }} />
              <col style={{ width: columnWidths.total }} />
            </colgroup>
            <thead>
              <tr>
                <th className="order-th" style={{ width: 36 }} />
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
                  <td colSpan={6} className="order-empty-state">
                    No orders found. Create a new quote to get started.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr
                    key={order.id}
                    className={`order-list-row${mergeSelectedIds.has(order.id) ? ' order-row-selected' : ''}`}
                    onClick={() => { setSelectedOrder(order); setViewMode('detail'); }}
                  >
                    <td className="order-td order-td-checkbox" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={mergeSelectedIds.has(order.id)}
                        onChange={e => {
                          setMergeSelectedIds(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(order.id) : next.delete(order.id);
                            return next;
                          });
                        }}
                      />
                    </td>
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
                {(selectedOrder.status === 'Quote' || selectedOrder.status === 'Ordered') && (
                  <button
                    onClick={() => openEditModal(selectedOrder)}
                    className="order-btn-outline"
                  >
                    Edit Quote
                  </button>
                )}
                <button
                  onClick={() => duplicateOrder(selectedOrder)}
                  disabled={saving}
                  className="order-btn-outline"
                >
                  Duplicate
                </button>
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
                      <SearchableSelect
                        value={addItemProduct ? String(addItemProduct) : ''}
                        onChange={(v) => {
                          const id = parseInt(v);
                          setAddItemProduct(id);
                          const product = catalog.find(p => p.id === id);
                          if (product) setAddItemPrice(product.rate);
                        }}
                        options={catalog.map(p => ({
                          value: String(p.id),
                          label: `${p.name} (${formatCurrency(p.rate)})`,
                        }))}
                        placeholder="Select product..."
                        className="order-add-item-select"
                      />
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

      {/* Merge Master Order Modal */}
      {showMergeModal && (
        <div className="detail-panel-overlay" onClick={() => setShowMergeModal(false)}>
          <div className="detail-panel" onClick={e => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Create Master Order</h3>
              <button className="close-btn" onClick={() => setShowMergeModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={mergeDate} onChange={e => setMergeDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={mergeNotes} onChange={e => setMergeNotes(e.target.value)} rows={2} />
                </div>
                <div className="form-group">
                  <label>Merged Line Items ({mergedItems.length})</label>
                  <table className="order-items-table">
                    <thead>
                      <tr className="order-items-thead-row">
                        <th className="order-items-th">Product</th>
                        <th className="order-items-th order-items-th-right">Qty</th>
                        <th className="order-items-th order-items-th-right">Dealer Fee</th>
                        <th className="order-items-th order-items-th-right">Customer Rate</th>
                        <th className="order-items-th order-items-th-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mergedItems.map(item => (
                        <tr key={item.productId} className="order-items-row">
                          <td className="order-items-td">{item.productName}</td>
                          <td className="order-items-td order-items-td-right order-items-td-secondary">{item.quantity}</td>
                          <td className="order-items-td order-items-td-right order-items-td-secondary">{formatCurrency(item.dealerFee)}</td>
                          <td className="order-items-td order-items-td-right order-items-td-secondary">{formatCurrency(item.unitPrice)}</td>
                          <td className="order-items-td order-items-td-right order-items-td-bold">{formatCurrency(item.quantity * item.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="order-items-total-label">I Pay (Dealer):</td>
                        <td className="order-items-total-value">{formatCurrency(mergedItems.reduce((s, i) => s + i.quantity * i.dealerFee, 0))}</td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="order-items-total-label">I Charge (Customer):</td>
                        <td className="order-items-total-value">{formatCurrency(mergedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}</td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="order-items-total-label" style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>My Margin:</td>
                        <td className="order-items-total-value" style={{ color: 'var(--accent-primary)' }}>{formatCurrency(mergedItems.reduce((s, i) => s + i.quantity * (i.unitPrice - i.dealerFee), 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowMergeModal(false)}>Cancel</button>
              <button
                className="order-btn-outline"
                onClick={() => {
                  const itemLines = mergedItems.map(i => `  ${i.quantity}x ${i.productName}`).join('\n');
                  const email = [
                    'Subject: Order Request - Account #10733',
                    '',
                    'Hi,',
                    '',
                    'Please process the following order for account #10733:',
                    '',
                    itemLines,
                    '',
                    'Please ship as soon as possible.',
                    '',
                    'Please charge my card on file ending in 6175.',
                    '',
                    'Thank you!',
                    '',
                    'Ryan Overleese',
                    'Acre Insights, LLC',
                    '308-830-1451',
                    'ryan@acreinsights.com',
                  ].join('\n');
                  navigator.clipboard.writeText(email);
                  showToast('Email copied to clipboard');
                }}
              >
                Copy to Email Order
              </button>
              <button className="btn btn-primary" onClick={handleCreateMasterOrder} disabled={saving}>
                {saving ? 'Creating...' : 'Create Master Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Quote Modal */}
      {showEditModal && selectedOrder && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={e => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Quote</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Customer</label>
                  <SearchableSelect
                    value={editBillingEntity ? String(editBillingEntity) : ''}
                    onChange={(v) => setEditBillingEntity(parseInt(v) || null)}
                    options={billingEntities.map(be => ({ value: String(be.id), label: be.name }))}
                    placeholder="Select customer..."
                  />
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Items</label>
                  {editItems.map((item, idx) => (
                    <div key={idx} className="order-new-item-card">
                      <SearchableSelect
                        value={item.productId ? String(item.productId) : ''}
                        onChange={(v) => updateEditItem(idx, 'productId', parseInt(v) || null)}
                        options={catalog.map(p => ({ value: String(p.id), label: `${p.name} (${formatCurrency(p.rate)})` }))}
                        placeholder="Select product..."
                        className="order-new-item-select"
                      />
                      <div className="form-row">
                        <div className="form-group">
                          <label>Qty</label>
                          <input type="number" min="1" value={item.quantity} onChange={e => updateEditItem(idx, 'quantity', parseInt(e.target.value) || 1)} />
                        </div>
                        <div className="form-group">
                          <label>Price</label>
                          <input type="number" step="0.01" value={item.unitPrice} onChange={e => updateEditItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="order-new-item-total-col">
                          <span className="order-new-item-total">{formatCurrency(item.quantity * item.unitPrice)}</span>
                          {editItems.length > 1 && (
                            <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))} className="order-new-item-remove">&times;</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setEditItems(prev => [...prev, { productId: null, productName: '', quantity: 1, unitPrice: 0 }])}
                    className="btn btn-secondary order-add-line-btn"
                  >
                    + Add Line
                  </button>
                </div>
                <div className="order-modal-total-row">
                  <span className="order-modal-total">
                    Total: {formatCurrency(editItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}
                  </span>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
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
                  <SearchableSelect
                    value={newBillingEntity ? String(newBillingEntity) : ''}
                    onChange={(v) => setNewBillingEntity(parseInt(v) || null)}
                    options={billingEntities.map(be => ({
                      value: String(be.id),
                      label: be.name,
                    }))}
                    placeholder="Select customer..."
                  />
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
                      <SearchableSelect
                        value={item.productId ? String(item.productId) : ''}
                        onChange={(v) => updateNewItem(idx, 'productId', parseInt(v) || null)}
                        options={catalog.map(p => ({
                          value: String(p.id),
                          label: `${p.name} (${formatCurrency(p.rate)})`,
                        }))}
                        placeholder="Select product..."
                        className="order-new-item-select"
                      />
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
