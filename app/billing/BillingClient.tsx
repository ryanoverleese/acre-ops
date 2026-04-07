'use client';

import { useState, useMemo, Fragment, useRef, useCallback, useEffect, type ReactNode } from 'react';

const BILLING_COLUMNS = [
  { key: 'invoiceNumber', label: 'Invoice #', defaultOn: true },
  { key: 'sentDate',      label: 'Sent Date',    defaultOn: true },
  { key: 'depositDate',   label: 'Deposit Date', defaultOn: true },
  { key: 'paidDate',      label: 'Paid Date',    defaultOn: true },
  { key: 'checkNumber',   label: 'Check #',      defaultOn: true },
  { key: 'calculated',    label: 'Calculated',   defaultOn: true },
  { key: 'actualBilled',  label: 'Actual Billed',defaultOn: true },
  { key: 'matchedInQb',   label: 'In QB',        defaultOn: true },
  { key: 'notes',         label: 'Notes',        defaultOn: true },
] as const;
type BillingColKey = typeof BILLING_COLUMNS[number]['key'];

function DateCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRef = useRef(value);   // latest local value (no stale closure)
  const savedRef = useRef(value);   // last value actually sent to API
  const onSaveRef = useRef(onSave); // latest onSave (no stale closure)
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  // Sync when parent value changes
  useEffect(() => {
    setLocal(value);
    localRef.current = value;
    savedRef.current = value;
  }, [value]);

  const flush = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (localRef.current !== savedRef.current) {
      savedRef.current = localRef.current;
      onSaveRef.current(localRef.current);
    }
  };

  // Flush on unmount (catches Next.js navigation away mid-edit)
  useEffect(() => () => { flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush when tab is backgrounded / user switches away
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      <input
        type="date"
        className={`inline-input${local ? '' : ' date-empty'}`}
        value={local}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          localRef.current = v;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            savedRef.current = v;
            onSaveRef.current(v);
            timerRef.current = null;
          }, 600);
        }}
        onBlur={flush}
      />
      {local && (
        <button
          type="button"
          onClick={() => {
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
            localRef.current = '';
            savedRef.current = '';
            setLocal('');
            onSaveRef.current('');
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
          title="Clear date"
        >×</button>
      )}
    </span>
  );
}

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
  invoiceNumber?: number;
  matchedInQb?: boolean;
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
  const [hiddenCols, setHiddenCols] = useState<Set<BillingColKey>>(() => {
    try {
      const stored = localStorage.getItem('billing-hidden-cols');
      return stored ? new Set(JSON.parse(stored) as BillingColKey[]) : new Set();
    } catch { return new Set(); }
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const [summaryView, setSummaryView] = useState<'overview' | 'discounts' | 'collections'>('overview');
  const colPickerRef = useRef<HTMLDivElement>(null);
  const col = (key: BillingColKey) => !hiddenCols.has(key);
  const toggleCol = (key: BillingColKey) => setHiddenCols(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { localStorage.setItem('billing-hidden-cols', JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const debounceSave = useCallback((key: string, fn: () => void, delay = 800) => {
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.current.set(key, setTimeout(() => {
      fn();
      debounceTimers.current.delete(key);
    }, delay));
  }, []);

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

  const handleUpdateInvoiceField = async (invoiceId: number, billingEntityId: number, season: number, field: 'check_number' | 'actual_billed_amount' | 'invoice_number', value: number | null) => {
    try {
      const realId = await ensureInvoice(invoiceId, billingEntityId, season);
      if (!realId) { alert('Failed to create invoice'); return; }

      const response = await fetch(`/api/invoices/${realId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      if (response.ok) {
        const fieldMap: Record<string, string> = { check_number: 'checkNumber', actual_billed_amount: 'actualBilledAmount', invoice_number: 'invoiceNumber' };
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

  // Close column picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false);
      }
    };
    if (showColPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColPicker]);

  const handleToggleQb = async (invoiceId: number, billingEntityId: number, season: number, current: boolean) => {
    const realId = await ensureInvoice(invoiceId, billingEntityId, season);
    if (!realId) return;
    const next = !current;
    await fetch(`/api/invoices/${realId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matched_in_qb: next }),
    });
    setBillingEntities(prev => prev.map(be => ({
      ...be,
      invoices: be.invoices.map(inv => inv.id === realId ? { ...inv, matchedInQb: next } : inv),
    })));
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

  const totalSentAmount = filteredEntities.reduce((sum, be) =>
    sum + be.invoices
      .filter(inv => inv.sentAt)
      .reduce((invSum, inv) => {
        if (inv.actualBilledAmount != null) return invSum + inv.actualBilledAmount;
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
          <div ref={colPickerRef} className="fields-col-picker">
            <button className="btn btn-secondary" onClick={() => setShowColPicker(v => !v)} title="Show/hide columns">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Columns
            </button>
            {showColPicker && (
              <div className="fields-col-dropdown">
                <div className="fields-col-header">
                  <span className="fields-col-label">Show Columns</span>
                </div>
                {BILLING_COLUMNS.map(c => (
                  <label key={c.key} className="fields-col-item">
                    <input type="checkbox" checked={col(c.key)} onChange={() => toggleCol(c.key)} className="fields-col-checkbox" />
                    {c.label}
                  </label>
                ))}
                <div className="fields-col-footer">
                  <button className="btn btn-secondary fields-col-reset" onClick={() => {
                    setHiddenCols(new Set());
                    try { localStorage.removeItem('billing-hidden-cols'); } catch { /* ignore */ }
                  }}>Reset</button>
                </div>
              </div>
            )}
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
        <div className="billing-summary-bar mb-6">
          <select
            className="billing-summary-select"
            value={summaryView}
            onChange={(e) => setSummaryView(e.target.value as typeof summaryView)}
          >
            <option value="overview">Overview</option>
            <option value="discounts">Discounts</option>
            <option value="collections">Collections</option>
          </select>
          <div className="billing-summary-stats">
            {summaryView === 'overview' && (<>
              <div className="billing-stat"><span className="billing-stat-label">Entities</span><span className="billing-stat-value blue">{filteredEntities.length}</span></div>
              <div className="billing-stat-divider" />
              <div className="billing-stat"><span className="billing-stat-label">Total</span><span className="billing-stat-value">{formatCurrency(totalAfterDiscount)}</span></div>
              <div className="billing-stat-divider" />
              <div className="billing-stat"><span className="billing-stat-label">Paid</span><span className="billing-stat-value green">{formatCurrency(totalPaid)}</span></div>
              <div className="billing-stat-divider" />
              <div className="billing-stat"><span className="billing-stat-label">Outstanding</span><span className="billing-stat-value amber">{formatCurrency(totalAfterDiscount - totalPaid)}</span></div>
            </>)}
            {summaryView === 'discounts' && (<>
              <div className="billing-stat"><span className="billing-stat-label">Subtotal</span><span className="billing-stat-value">{formatCurrency(totalSubtotal)}</span></div>
              <div className="billing-stat-divider" />
              <div className="billing-stat"><span className="billing-stat-label">Bulk Discounts</span><span className="billing-stat-value amber">-{formatCurrency(totalDiscount)}</span></div>
              <div className="billing-stat-divider" />
              <div className="billing-stat"><span className="billing-stat-label">After Discount</span><span className="billing-stat-value green">{formatCurrency(totalAfterDiscount)}</span></div>
            </>)}
            {summaryView === 'collections' && (<>
              <div className="billing-stat"><span className="billing-stat-label">Sent</span><span className="billing-stat-value">{formatCurrency(totalSentAmount)}</span></div>
              <div className="billing-stat-divider" />
              <div className="billing-stat"><span className="billing-stat-label">Paid</span><span className="billing-stat-value green">{formatCurrency(totalPaid)}</span></div>
              <div className="billing-stat-divider" />
              <div className="billing-stat"><span className="billing-stat-label">Unpaid</span><span className="billing-stat-value amber">{formatCurrency(totalSentAmount - totalPaid)}</span></div>
            </>)}
          </div>
        </div>

        {filteredEntities.length === 0 ? (
          <div className="table-container">
            <div className="entity-empty">
              No billing entities with {currentSeason} field seasons found.
            </div>
          </div>
        ) : (
          <div className="table-container billing-table-container">
            <table className="billing-table condensed-table">
              <thead>
                <tr>
                  <th style={{ width: '24px' }}></th>
                  <th className="sortable-th" onClick={() => handleSort('entity')}>Entity{sortIndicator('entity')}</th>
                  <th className="sortable-th" onClick={() => handleSort('operation')}>Operation{sortIndicator('operation')}</th>
                  {col('invoiceNumber') && <th>Invoice #</th>}
                  {col('sentDate') && <th className="sortable-th" onClick={() => handleSort('sentDate')}>Sent Date{sortIndicator('sentDate')}</th>}
                  {col('depositDate') && <th className="sortable-th" onClick={() => handleSort('depositDate')}>Deposit Date{sortIndicator('depositDate')}</th>}
                  {col('paidDate') && <th className="sortable-th" onClick={() => handleSort('paidDate')}>Paid Date{sortIndicator('paidDate')}</th>}
                  {col('checkNumber') && <th className="sortable-th" onClick={() => handleSort('checkNumber')}>Check #{sortIndicator('checkNumber')}</th>}
                  {col('calculated') && <th className="sortable-th align-right" onClick={() => handleSort('calculated')}>Calculated{sortIndicator('calculated')}</th>}
                  {col('actualBilled') && <th className="sortable-th align-right" onClick={() => handleSort('actualBilled')}>Actual Billed{sortIndicator('actualBilled')}</th>}
                  {col('matchedInQb') && <th style={{ textAlign: 'center' }}>In QB</th>}
                  {col('notes') && <th className="sortable-th" onClick={() => handleSort('notes')} style={{ minWidth: '200px' }}>Notes{sortIndicator('notes')}</th>}
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
                        {col('invoiceNumber') && <td>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="inline-input"
                            defaultValue={invoice?.invoiceNumber ?? ''}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : null;
                              debounceSave(`inv-${be.id}-invoice_number`, () => {
                                if (val !== (invoice?.invoiceNumber ?? null))
                                  handleUpdateInvoiceField(invoice?.id || 0, be.id, be.season || currentSeason, 'invoice_number', val);
                              });
                            }}
                            onBlur={(e) => {
                              const key = `inv-${be.id}-invoice_number`;
                              const existing = debounceTimers.current.get(key);
                              if (existing) { clearTimeout(existing); debounceTimers.current.delete(key); }
                              const val = e.target.value ? parseInt(e.target.value, 10) : null;
                              if (val !== (invoice?.invoiceNumber ?? null))
                                handleUpdateInvoiceField(invoice?.id || 0, be.id, be.season || currentSeason, 'invoice_number', val);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ width: '80px' }}
                          />
                        </td>}
                        {col('sentDate') && <td>
                          <DateCell
                            value={invoice?.sentAt?.split('T')[0] || ''}
                            onSave={(v) => handleUpdateInvoiceDate(invoice?.id || 0, be.id, be.season || currentSeason, 'sent_at', v)}
                          />
                        </td>}
                        {col('depositDate') && <td>
                          <DateCell
                            value={invoice?.depositAt?.split('T')[0] || ''}
                            onSave={(v) => handleUpdateInvoiceDate(invoice?.id || 0, be.id, be.season || currentSeason, 'deposit_at', v)}
                          />
                        </td>}
                        {col('paidDate') && <td>
                          <DateCell
                            value={invoice?.paidAt?.split('T')[0] || ''}
                            onSave={(v) => handleUpdateInvoiceDate(invoice?.id || 0, be.id, be.season || currentSeason, 'paid_at', v)}
                          />
                        </td>}
                        {col('checkNumber') && <td>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="inline-input"
                            defaultValue={invoice?.checkNumber ?? ''}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : null;
                              debounceSave(`inv-${be.id}-check_number`, () => {
                                if (val !== (invoice?.checkNumber ?? null))
                                  handleUpdateInvoiceField(invoice?.id || 0, be.id, be.season || currentSeason, 'check_number', val);
                              });
                            }}
                            onBlur={(e) => {
                              const key = `inv-${be.id}-check_number`;
                              const existing = debounceTimers.current.get(key);
                              if (existing) { clearTimeout(existing); debounceTimers.current.delete(key); }
                              const val = e.target.value ? parseInt(e.target.value, 10) : null;
                              if (val !== (invoice?.checkNumber ?? null))
                                handleUpdateInvoiceField(invoice?.id || 0, be.id, be.season || currentSeason, 'check_number', val);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ width: '80px' }}
                          />
                        </td>}
                        {col('calculated') && <td className="align-right text-secondary">{formatCurrency(total)}</td>}
                        {col('actualBilled') && <td className="align-right">
                          <input
                            type="text"
                            className="inline-input"
                            defaultValue={invoice?.actualBilledAmount != null ? formatCurrency(invoice.actualBilledAmount) : ''}
                            onFocus={(e) => {
                              const raw = invoice?.actualBilledAmount;
                              e.target.value = raw != null ? String(raw) : '';
                            }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9.\-]/g, '');
                              const val = raw ? parseFloat(raw) : null;
                              debounceSave(`inv-${be.id}-actual_billed_amount`, () => {
                                if (val !== (invoice?.actualBilledAmount ?? null))
                                  handleUpdateInvoiceField(invoice?.id || 0, be.id, be.season || currentSeason, 'actual_billed_amount', val);
                              });
                            }}
                            onBlur={(e) => {
                              const key = `inv-${be.id}-actual_billed_amount`;
                              const existing = debounceTimers.current.get(key);
                              if (existing) { clearTimeout(existing); debounceTimers.current.delete(key); }
                              const raw = e.target.value.replace(/[^0-9.\-]/g, '');
                              const val = raw ? parseFloat(raw) : null;
                              if (val !== (invoice?.actualBilledAmount ?? null))
                                handleUpdateInvoiceField(invoice?.id || 0, be.id, be.season || currentSeason, 'actual_billed_amount', val);
                              e.target.value = val != null ? formatCurrency(val) : '';
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ width: '100px', textAlign: 'right' }}
                          />
                        </td>}
                        {col('matchedInQb') && <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={invoice?.matchedInQb ?? false}
                            onChange={() => handleToggleQb(invoice?.id || 0, be.id, be.season || currentSeason, invoice?.matchedInQb ?? false)}
                            style={{ cursor: 'pointer', width: 16, height: 16 }}
                          />
                        </td>}
                        {col('notes') && <td>
                          <input
                            type="text"
                            className="inline-input"
                            title={invoice?.notes || ''}
                            defaultValue={invoice?.notes || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              debounceSave(`inv-${be.id}-notes`, () => {
                                if (val !== (invoice?.notes || ''))
                                  handleUpdateNotes(invoice?.id || 0, be.id, be.season || currentSeason, val);
                              });
                            }}
                            onBlur={(e) => {
                              const key = `inv-${be.id}-notes`;
                              const existing = debounceTimers.current.get(key);
                              if (existing) { clearTimeout(existing); debounceTimers.current.delete(key); }
                              if (e.target.value !== (invoice?.notes || ''))
                                handleUpdateNotes(invoice?.id || 0, be.id, be.season || currentSeason, e.target.value);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            style={{ width: '100%', minWidth: '150px' }}
                          />
                        </td>}
                      </tr>
                      {isExpanded && (
                        <tr className="detail-row">
                          <td colSpan={3 + BILLING_COLUMNS.filter(c => col(c.key)).length} style={{ padding: 0 }}>
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
