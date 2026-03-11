'use client';

import { useState, useMemo, Fragment } from 'react';

export interface InvoiceLine {
  id: number;
  invoiceLineId: number;
  fieldName: string;
  serviceType: string;
  rate: number;
  quantity: number;
}

export interface ProcessedInvoice {
  id: number;
  season: number;
  amount: number;
  status: string;
  sentAt?: string;
  depositAt?: string;
  paidAt?: string;
  notes: string;
  checkNumber?: number;
  actualBilledAmount?: number;
  lines: InvoiceLine[];
}

export interface ProcessedBillingEntity {
  id: number;
  name: string;
  operation: string;
  invoiceContact: string;
  invoiceContactEmail?: string;
  invoices: ProcessedInvoice[];
  totalBilled: number;
  totalPaid: number;
  season?: number;
  operationBulkFieldCount?: number;
}

export interface OnOrderLine {
  billingEntityId: number;
  billingEntityName: string;
  brand: string;
  serviceType: string;
  quantity: number;
  rate: number;
}

interface BillingClientProps {
  billingEntities: ProcessedBillingEntity[];
  availableSeasons: number[];
  onOrderLines: OnOrderLine[];
}

const BULK_DISCOUNT_PER_FIELD = 25;
const BULK_DISCOUNT_MIN_FIELDS = 10;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function BillingClient({ billingEntities: initialEntities, availableSeasons, onOrderLines }: BillingClientProps) {
  const [billingEntities, setBillingEntities] = useState(initialEntities);
  const [currentSeason, setCurrentSeason] = useState<number>(availableSeasons[0] || new Date().getFullYear());
  const [expandedEntities, setExpandedEntities] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState('operation');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [savingQty, setSavingQty] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Helper to get on-order total for a billing entity
  const getOnOrderTotal = (beId: number) =>
    onOrderLines.filter((ol) => ol.billingEntityId === beId).reduce((sum, ol) => sum + ol.rate * ol.quantity, 0);

  // Helper to calculate total for an entity (for sorting)
  const getEntityTotal = (be: ProcessedBillingEntity) => {
    const invoice = be.invoices[0];
    if (!invoice) return getOnOrderTotal(be.id);
    const subtotal = invoice.lines.reduce((sum, line) => sum + (line.rate * line.quantity), 0);
    const entityBulkCount = invoice.lines.filter(line =>
      line.serviceType.toLowerCase().includes('bulk')
    ).length;
    const discount = (be.operationBulkFieldCount || 0) >= BULK_DISCOUNT_MIN_FIELDS && entityBulkCount > 0
      ? entityBulkCount * BULK_DISCOUNT_PER_FIELD
      : 0;
    return subtotal - discount + getOnOrderTotal(be.id);
  };

  // Filter and sort entities by selected season
  const filteredEntities = useMemo(() => {
    let filtered = billingEntities.filter(be => be.season === currentSeason);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (be) =>
          be.name.toLowerCase().includes(query) ||
          be.operation.toLowerCase().includes(query)
      );
    }

    // Sort based on sortBy and sortDirection
    filtered = [...filtered].sort((a, b) => {
      const aInv = a.invoices[0];
      const bInv = b.invoices[0];
      let aVal: string | number = '';
      let bVal: string | number = '';

      if (sortBy === 'entity') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortBy === 'operation') {
        aVal = a.operation.toLowerCase();
        bVal = b.operation.toLowerCase();
      } else if (sortBy === 'sentDate') {
        aVal = aInv?.sentAt || '';
        bVal = bInv?.sentAt || '';
      } else if (sortBy === 'depositDate') {
        aVal = aInv?.depositAt || '';
        bVal = bInv?.depositAt || '';
      } else if (sortBy === 'paidDate') {
        aVal = aInv?.paidAt || '';
        bVal = bInv?.paidAt || '';
      } else if (sortBy === 'checkNumber') {
        aVal = aInv?.checkNumber || 0;
        bVal = bInv?.checkNumber || 0;
      } else if (sortBy === 'actualBilled') {
        aVal = aInv?.actualBilledAmount || 0;
        bVal = bInv?.actualBilledAmount || 0;
      } else if (sortBy === 'notes') {
        aVal = (aInv?.notes || '').toLowerCase();
        bVal = (bInv?.notes || '').toLowerCase();
      } else {
        aVal = getEntityTotal(a);
        bVal = getEntityTotal(b);
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [billingEntities, currentSeason, searchQuery, sortBy, sortDirection]);

  const toggleExpand = (beId: number) => {
    setExpandedEntities(prev => {
      const next = new Set(prev);
      if (next.has(beId)) {
        next.delete(beId);
      } else {
        next.add(beId);
      }
      return next;
    });
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDirection('asc');
    }
  };

  const sortIndicator = (col: string) => sortBy === col ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';

  // Calculate bulk discount for an entity based on operation-level bulk field count
  const calculateBulkDiscount = (lines: InvoiceLine[], operationBulkFieldCount: number): { discount: number; eligibleCount: number } => {
    const entityBulkCount = lines.filter(line =>
      line.serviceType.toLowerCase().includes('bulk')
    ).length;

    if (operationBulkFieldCount >= BULK_DISCOUNT_MIN_FIELDS && entityBulkCount > 0) {
      return {
        discount: entityBulkCount * BULK_DISCOUNT_PER_FIELD,
        eligibleCount: entityBulkCount,
      };
    }
    return { discount: 0, eligibleCount: 0 };
  };

  const handleUpdateQuantity = async (line: InvoiceLine, newQty: number, be: ProcessedBillingEntity) => {
    if (newQty === line.quantity) return;
    const trackingId = line.invoiceLineId || line.id;
    setSavingQty(prev => new Set(prev).add(trackingId));
    try {
      let invoiceLineId = line.invoiceLineId;

      if (!invoiceLineId) {
        // Auto-create invoice line via enrollment
        const enrollRes = await fetch('/api/billing/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            billing_entity_id: be.id,
            season: be.season,
            field_season_id: line.id,
            service_type: line.serviceType,
            rate: line.rate,
          }),
        });
        if (!enrollRes.ok) return;
        const enrollData = await enrollRes.json();
        invoiceLineId = enrollData.invoiceLine?.id;
      }

      // Now update quantity
      const response = await fetch(`/api/invoice-lines/${invoiceLineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty }),
      });
      if (response.ok) {
        setBillingEntities(billingEntities.map((entity) => ({
          ...entity,
          invoices: entity.invoices.map((inv) => ({
            ...inv,
            lines: inv.lines.map((l) =>
              l.id === line.id ? { ...l, quantity: newQty, invoiceLineId } : l
            ),
          })),
        })));
      }
    } catch (error) {
      console.error('Error updating quantity:', error);
    } finally {
      setSavingQty(prev => { const next = new Set(prev); next.delete(trackingId); return next; });
    }
  };

  // Ensure an invoice row exists in Baserow, creating one if needed (id === 0).
  // Returns the real invoice ID, or null on failure.
  const ensureInvoice = async (invoiceId: number, billingEntityId: number, season: number): Promise<number | null> => {
    if (invoiceId !== 0) return invoiceId;

    const response = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billing_entity: billingEntityId, season }),
    });

    if (!response.ok) return null;
    const created = await response.json();
    // Update local state with the real ID
    setBillingEntities((prev) => prev.map((be) => ({
      ...be,
      invoices: be.invoices.map((inv) =>
        inv.id === 0 && be.id === billingEntityId && be.season === season
          ? { ...inv, id: created.id }
          : inv
      ),
    })));
    return created.id;
  };

  const handleUpdateInvoiceDate = async (invoiceId: number, billingEntityId: number, season: number, field: 'sent_at' | 'deposit_at' | 'paid_at', value: string) => {
    try {
      const realId = await ensureInvoice(invoiceId, billingEntityId, season);
      if (!realId) { alert('Failed to create invoice'); return; }

      const updateData: Record<string, unknown> = { [field]: value || null };
      if (field === 'sent_at' && value) updateData.status = 'Sent';
      if (field === 'paid_at' && value) updateData.status = 'Paid';

      const response = await fetch(`/api/invoices/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const fieldMap: Record<string, string> = { sent_at: 'sentAt', deposit_at: 'depositAt', paid_at: 'paidAt' };
        setBillingEntities((prev) => prev.map((be) => ({
          ...be,
          invoices: be.invoices.map((inv) => {
            if (inv.id === realId) {
              const updated = { ...inv, [fieldMap[field]]: value || undefined };
              if (field === 'sent_at' && value) updated.status = 'Sent';
              if (field === 'paid_at' && value) updated.status = 'Paid';
              return updated;
            }
            return inv;
          }),
        })));
      } else {
        alert('Failed to update date');
      }
    } catch (error) {
      console.error('Error updating date:', error);
      alert('Failed to update date');
    }
  };

  const handleUpdateNotes = async (invoiceId: number, billingEntityId: number, season: number, value: string) => {
    try {
      const realId = await ensureInvoice(invoiceId, billingEntityId, season);
      if (!realId) { alert('Failed to create invoice'); return; }

      const response = await fetch(`/api/invoices/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: value }),
      });

      if (response.ok) {
        setBillingEntities((prev) => prev.map((be) => ({
          ...be,
          invoices: be.invoices.map((inv) =>
            inv.id === realId ? { ...inv, notes: value } : inv
          ),
        })));
      } else {
        alert('Failed to save notes');
      }
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes');
    }
  };

  const handleUpdateInvoiceField = async (invoiceId: number, billingEntityId: number, season: number, field: 'check_number' | 'actual_billed_amount', value: number | null) => {
    try {
      const realId = await ensureInvoice(invoiceId, billingEntityId, season);
      if (!realId) { alert('Failed to create invoice'); return; }

      const response = await fetch(`/api/invoices/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      if (response.ok) {
        const fieldMap: Record<string, string> = { check_number: 'checkNumber', actual_billed_amount: 'actualBilledAmount' };
        setBillingEntities((prev) => prev.map((be) => ({
          ...be,
          invoices: be.invoices.map((inv) =>
            inv.id === realId ? { ...inv, [fieldMap[field]]: value ?? undefined } : inv
          ),
        })));
      } else {
        alert('Failed to update');
      }
    } catch (error) {
      console.error('Error updating invoice field:', error);
      alert('Failed to update');
    }
  };

  const handleExport = () => {
    const headers = ['Billing Entity', 'Operation', 'Field', 'Service Type', 'Qty', 'Rate', 'Discount', 'Total'];
    const rows: (string | number)[][] = [];

    filteredEntities.forEach((be) => {
      be.invoices.forEach((inv) => {
        const { discount } = calculateBulkDiscount(inv.lines, be.operationBulkFieldCount || 0);
        const subtotal = inv.lines.reduce((sum, line) => sum + (line.rate * line.quantity), 0);

        inv.lines.forEach((line, idx) => {
          rows.push([
            idx === 0 ? be.name : '',
            idx === 0 ? be.operation : '',
            line.fieldName,
            line.serviceType,
            line.quantity,
            line.rate,
            idx === 0 ? discount : '',
            idx === 0 ? subtotal - discount : '',
          ]);
        });
      });
    });

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-${currentSeason}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate totals for filtered entities
  const totalOnOrder = filteredEntities.reduce((sum, be) => sum + getOnOrderTotal(be.id), 0);
  const totalSubtotal = filteredEntities.reduce((sum, be) =>
    sum + be.invoices.reduce((invSum, inv) =>
      invSum + inv.lines.reduce((lineSum, line) => lineSum + (line.rate * line.quantity), 0), 0), 0) + totalOnOrder;

  const totalDiscount = filteredEntities.reduce((sum, be) =>
    sum + be.invoices.reduce((invSum, inv) =>
      invSum + calculateBulkDiscount(inv.lines, be.operationBulkFieldCount || 0).discount, 0), 0);

  const totalAfterDiscount = totalSubtotal - totalDiscount;

  const totalPaid = filteredEntities.reduce((sum, be) =>
    sum + be.invoices
      .filter(inv => inv.status.toLowerCase() === 'paid')
      .reduce((invSum, inv) => {
        const subtotal = inv.lines.reduce((s, l) => s + (l.rate * l.quantity), 0);
        const { discount } = calculateBulkDiscount(inv.lines, be.operationBulkFieldCount || 0);
        return invSum + subtotal - discount;
      }, 0), 0);

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Billing</h2>
          <select
            className="season-badge-select"
            value={currentSeason}
            onChange={(e) => setCurrentSeason(parseInt(e.target.value, 10))}
          >
            {availableSeasons.map((s) => (
              <option key={s} value={s}>{s} Season</option>
            ))}
          </select>
        </div>
        <div className="header-right">
          <div className="billing-search">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <span className="header-divider" />
          <button className="btn-toolbar" onClick={handleExport} title="Export CSV">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid mb-6">
          <div className="stat-card">
            <div className="stat-label">Active Entities</div>
            <div className="stat-value blue">{filteredEntities.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Subtotal</div>
            <div className="stat-value">{formatCurrency(totalSubtotal)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Bulk Discounts</div>
            <div className="stat-value amber">-{formatCurrency(totalDiscount)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total / Paid</div>
            <div className="stat-value green">{formatCurrency(totalAfterDiscount)} / {formatCurrency(totalPaid)}</div>
          </div>
        </div>

        {filteredEntities.length === 0 ? (
          <div className="table-container">
            <div className="entity-empty">
              No billing entities with {currentSeason} field seasons found.
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table className="billing-table condensed-table">
              <thead>
                <tr>
                  <th style={{ width: '24px' }}></th>
                  <th className="sortable-th" onClick={() => handleSort('entity')}>Entity{sortIndicator('entity')}</th>
                  <th className="sortable-th" onClick={() => handleSort('operation')}>Operation{sortIndicator('operation')}</th>
                  <th className="sortable-th" onClick={() => handleSort('sentDate')}>Sent Date{sortIndicator('sentDate')}</th>
                  <th className="sortable-th" onClick={() => handleSort('depositDate')}>Deposit Date{sortIndicator('depositDate')}</th>
                  <th className="sortable-th" onClick={() => handleSort('paidDate')}>Paid Date{sortIndicator('paidDate')}</th>
                  <th className="sortable-th" onClick={() => handleSort('checkNumber')}>Check #{sortIndicator('checkNumber')}</th>
                  <th className="sortable-th align-right" onClick={() => handleSort('calculated')}>Calculated{sortIndicator('calculated')}</th>
                  <th className="sortable-th align-right" onClick={() => handleSort('actualBilled')}>Actual Billed{sortIndicator('actualBilled')}</th>
                  <th className="sortable-th" onClick={() => handleSort('notes')} style={{ minWidth: '250px' }}>Notes{sortIndicator('notes')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntities.map((be) => {
                  const invoice = be.invoices[0];
                  const isExpanded = expandedEntities.has(be.id);
                  const lines = invoice?.lines || [];
                  const onOrderTotal = getOnOrderTotal(be.id);
                  const subtotal = lines.reduce((sum, line) => sum + (line.rate * line.quantity), 0) + onOrderTotal;
                  const { discount, eligibleCount } = calculateBulkDiscount(lines, be.operationBulkFieldCount || 0);
                  const total = subtotal - discount;

                  return (
                    <Fragment key={`${be.id}-${be.season}`}>
                      <tr className={isExpanded ? 'expanded-row' : ''}>
                        <td
                          className="expand-chevron"
                          onClick={() => toggleExpand(be.id)}
                          style={{ cursor: 'pointer', textAlign: 'center', userSelect: 'none' }}
                        >
                          •
                        </td>
                        <td>{be.name}</td>
                        <td>{be.operation}</td>
                        <td>
                          <input
                            type="date"
                            className="inline-input date-input"
                            defaultValue={invoice?.sentAt?.split('T')[0] || ''}
                            onBlur={(e) => {
                              const prev = invoice?.sentAt?.split('T')[0] || '';
                              if (e.target.value !== prev) {
                                handleUpdateInvoiceDate(invoice?.id || 0, be.id, be.season || currentSeason, 'sent_at', e.target.value);
                              }
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="inline-input date-input"
                            defaultValue={invoice?.depositAt?.split('T')[0] || ''}
                            onBlur={(e) => {
                              const prev = invoice?.depositAt?.split('T')[0] || '';
                              if (e.target.value !== prev) {
                                handleUpdateInvoiceDate(invoice?.id || 0, be.id, be.season || currentSeason, 'deposit_at', e.target.value);
                              }
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="inline-input date-input"
                            defaultValue={invoice?.paidAt?.split('T')[0] || ''}
                            onBlur={(e) => {
                              const prev = invoice?.paidAt?.split('T')[0] || '';
                              if (e.target.value !== prev) {
                                handleUpdateInvoiceDate(invoice?.id || 0, be.id, be.season || currentSeason, 'paid_at', e.target.value);
                              }
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="inline-input"
                            defaultValue={invoice?.checkNumber ?? ''}
                            onBlur={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : null;
                              if (val !== (invoice?.checkNumber ?? null)) {
                                handleUpdateInvoiceField(invoice?.id || 0, be.id, be.season || currentSeason, 'check_number', val);
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ width: '80px' }}
                          />
                        </td>
                        <td className="align-right text-secondary">{formatCurrency(total)}</td>
                        <td className="align-right">
                          <input
                            type="text"
                            className="inline-input"
                            defaultValue={invoice?.actualBilledAmount != null ? formatCurrency(invoice.actualBilledAmount) : ''}
                            onFocus={(e) => {
                              const raw = invoice?.actualBilledAmount;
                              e.target.value = raw != null ? String(raw) : '';
                            }}
                            onBlur={(e) => {
                              const raw = e.target.value.replace(/[^0-9.\-]/g, '');
                              const val = raw ? parseFloat(raw) : null;
                              if (val !== (invoice?.actualBilledAmount ?? null)) {
                                handleUpdateInvoiceField(invoice?.id || 0, be.id, be.season || currentSeason, 'actual_billed_amount', val);
                              }
                              e.target.value = val != null ? formatCurrency(val) : '';
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ width: '100px', textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="inline-input"
                            title={invoice?.notes || ''}
                            defaultValue={invoice?.notes || ''}
                            onBlur={(e) => {
                              if (e.target.value !== (invoice?.notes || '')) {
                                handleUpdateNotes(invoice?.id || 0, be.id, be.season || currentSeason, e.target.value);
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ width: '100%', minWidth: '150px' }}
                          />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="detail-row">
                          <td colSpan={10} style={{ padding: 0 }}>
                            <div className="detail-row-content">
                              <table className="line-items-table">
                                <thead>
                                  <tr>
                                    <th>Field</th>
                                    <th>Service Type</th>
                                    <th className="align-right">Qty</th>
                                    <th className="align-right">Rate</th>
                                    <th className="align-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lines.map((line) => (
                                    <tr key={line.id}>
                                      <td>{line.fieldName}</td>
                                      <td className="text-secondary">{line.serviceType || '—'}</td>
                                      <td className="align-right">
                                        <input
                                          type="number"
                                          min={1}
                                          defaultValue={line.quantity}
                                          onBlur={(e) => handleUpdateQuantity(line, parseInt(e.target.value, 10) || 1, be)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                          disabled={savingQty.has(line.invoiceLineId || line.id)}
                                          style={{ width: '48px', textAlign: 'right', padding: '2px 4px' }}
                                          className="inline-input"
                                        />
                                      </td>
                                      <td className="align-right">{formatCurrency(line.rate)}</td>
                                      <td className="align-right">{formatCurrency(line.rate * line.quantity)}</td>
                                    </tr>
                                  ))}
                                  {onOrderLines
                                    .filter((ol) => ol.billingEntityId === be.id)
                                    .map((ol) => (
                                      <tr key={`on-order-${ol.brand}`} style={{ opacity: 0.55, fontStyle: 'italic' }}>
                                        <td>On Order</td>
                                        <td className="text-secondary">{ol.serviceType}</td>
                                        <td className="align-right">{ol.quantity}</td>
                                        <td className="align-right">{formatCurrency(ol.rate)}</td>
                                        <td className="align-right">{formatCurrency(ol.rate * ol.quantity)}</td>
                                      </tr>
                                    ))}
                                  <tr className="subtotal-row">
                                    <td colSpan={4} className="align-right">Subtotal</td>
                                    <td className="align-right">{formatCurrency(subtotal)}</td>
                                  </tr>
                                  {discount > 0 && (
                                    <tr className="discount-row">
                                      <td colSpan={4} className="align-right discount-text">
                                        Bulk Discount ({eligibleCount} fields × ${BULK_DISCOUNT_PER_FIELD})
                                      </td>
                                      <td className="align-right discount-text">-{formatCurrency(discount)}</td>
                                    </tr>
                                  )}
                                  <tr className="total-row">
                                    <td colSpan={4} className="align-right">Total</td>
                                    <td className="align-right">{formatCurrency(total)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
