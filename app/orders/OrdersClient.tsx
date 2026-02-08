'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ProcessedOrder, ProcessedOrderItem, CatalogProduct, BillingEntityOption } from './page';

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

const STATUS_COLORS: Record<string, string> = {
  Quote: '#6366f1',
  Ordered: '#f59e0b',
  Shipped: '#3b82f6',
  Received: '#10b981',
  Fulfilled: '#059669',
};

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
  const [orders, setOrders] = useState(initialOrders);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedOrder, setSelectedOrder] = useState<ProcessedOrder | null>(null);
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

  // Status badge
  const statusBadge = (status: string) => (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      background: `${STATUS_COLORS[status] || '#6b7280'}20`,
      color: STATUS_COLORS[status] || '#6b7280',
    }}>
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
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: 'var(--bg-tertiary, #1e293b)',
          color: 'var(--text-primary, #f1f5f9)',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 9999,
          fontSize: '14px',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Orders & Quotes
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Create quotes, track orders, and manage fulfillment
          </p>
        </div>
        <button
          onClick={() => { resetCreateForm(); setShowCreateModal(true); }}
          style={{
            padding: '10px 20px',
            background: 'var(--accent-green, #22c55e)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New Quote
        </button>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['all', ...statusOptions].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              background: filterStatus === status ? 'var(--accent-green, #22c55e)' : 'transparent',
              color: filterStatus === status ? '#fff' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
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
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: '14px',
          marginBottom: '16px',
        }}
      />

      {/* List view */}
      {viewMode === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredOrders.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No orders found. Create a new quote to get started.
            </div>
          )}
          {filteredOrders.map(order => (
            <div
              key={order.id}
              onClick={() => { setSelectedOrder(order); setViewMode('detail'); }}
              style={{
                padding: '16px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-green, #22c55e)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>
                    {order.billingEntityName || 'No Customer'}
                  </span>
                  {statusBadge(order.status)}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {formatDate(order.orderDate)} &middot; {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>
                  {formatCurrency(order.total)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail view */}
      {viewMode === 'detail' && selectedOrder && (
        <div>
          <button
            onClick={() => { setViewMode('list'); setSelectedOrder(null); }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-green, #22c55e)',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            &larr; Back to orders
          </button>

          <div style={{
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
          }}>
            {/* Order header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {selectedOrder.billingEntityName || 'No Customer'}
                </h2>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {formatDate(selectedOrder.orderDate)} &middot; {statusBadge(selectedOrder.status)}
                </div>
                {selectedOrder.notes && (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    {selectedOrder.notes}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedOrder.status === 'Quote' && (
                  <button
                    onClick={() => copyQuote(selectedOrder)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Copy Quote
                  </button>
                )}
                {getNextStatus(selectedOrder.status) && (
                  <button
                    onClick={() => updateStatus(selectedOrder, getNextStatus(selectedOrder.status)!)}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: STATUS_COLORS[getNextStatus(selectedOrder.status)!] || '#6366f1',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    Mark as {getNextStatus(selectedOrder.status)}
                  </button>
                )}
                {selectedOrder.status === 'Received' && (
                  <button
                    onClick={() => fulfillOrder(selectedOrder)}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#059669',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    Fulfill Order
                  </button>
                )}
                <button
                  onClick={() => deleteOrder(selectedOrder)}
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #ef4444',
                    background: 'transparent',
                    color: '#ef4444',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Line items table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Product</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Unit Price</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', textTransform: 'uppercase' }}>Total</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{item.productName}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.quantity}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(item.unitPrice)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(item.quantity * item.unitPrice)}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {(selectedOrder.status === 'Quote' || selectedOrder.status === 'Ordered') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px', padding: '2px' }}
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
                    <td colSpan={3} style={{ padding: '12px', textAlign: 'right', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>Total:</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{formatCurrency(selectedOrder.total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Add item button */}
            {(selectedOrder.status === 'Quote' || selectedOrder.status === 'Ordered') && (
              <div style={{ marginTop: '16px' }}>
                {!showAddItem ? (
                  <button
                    onClick={() => setShowAddItem(true)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px dashed var(--border)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    + Add Item
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 2, minWidth: '200px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Product</label>
                      <select
                        value={addItemProduct || ''}
                        onChange={e => {
                          const id = parseInt(e.target.value);
                          setAddItemProduct(id);
                          const product = catalog.find(p => p.id === id);
                          if (product) setAddItemPrice(product.rate);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Select product...</option>
                        {catalog.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.rate)})</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ width: '80px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={addItemQty}
                        onChange={e => setAddItemQty(parseInt(e.target.value) || 1)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                        }}
                      />
                    </div>
                    <div style={{ width: '100px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={addItemPrice}
                        onChange={e => setAddItemPrice(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                        }}
                      />
                    </div>
                    <button
                      onClick={handleAddItemToOrder}
                      disabled={saving || !addItemProduct}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'var(--accent-green, #22c55e)',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving || !addItemProduct ? 0.6 : 1,
                      }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddItem(false)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
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
          <div className="detail-panel" style={{ maxWidth: '600px', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>New Quote</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px' }}
              >
                &times;
              </button>
            </div>

            {/* Customer */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Customer</label>
              <select
                value={newBillingEntity || ''}
                onChange={e => setNewBillingEntity(parseInt(e.target.value) || null)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                }}
              >
                <option value="">Select customer...</option>
                {billingEntities.map(be => (
                  <option key={be.id} value={be.id}>{be.name}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Date</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                }}
              />
            </div>

            {/* Line items */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Items</label>
              {newItems.map((item, idx) => (
                <div key={idx} style={{ marginBottom: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <select
                      value={item.productId || ''}
                      onChange={e => updateNewItem(idx, 'productId', parseInt(e.target.value) || null)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-secondary, #fff)',
                        color: 'var(--text-primary)',
                        fontSize: '16px',
                      }}
                    >
                      <option value="">Select product...</option>
                      {catalog.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.rate)})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Qty</div>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateNewItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-secondary, #fff)',
                          color: 'var(--text-primary)',
                          fontSize: '16px',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Price</div>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={e => updateNewItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-secondary, #fff)',
                          color: 'var(--text-primary)',
                          fontSize: '16px',
                        }}
                      />
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '70px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>&nbsp;</div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', padding: '10px 0' }}>
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </div>
                    </div>
                    {newItems.length > 1 && (
                      <button
                        onClick={() => removeNewItem(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px', padding: '4px', marginTop: '14px' }}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={addNewItemRow}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: '14px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                + Add Line
              </button>
            </div>

            {/* Total */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '12px 0',
              borderTop: '1px solid var(--border)',
              marginBottom: '16px',
            }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Total: {formatCurrency(newItemsTotal)}
              </span>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>Notes</label>
              <textarea
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateQuote}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent-green, #22c55e)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Creating...' : 'Create Quote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
