'use client';

import { useState, useMemo } from 'react';

export interface InvoiceLine {
  id: number;
  fieldName: string;
  serviceType: string;
  rate: number;
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
  operationBulkFieldCount?: number; // Total bulk fields across all entities in this operation
}

interface BillingClientProps {
  billingEntities: ProcessedBillingEntity[];
  availableSeasons: number[];
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

export default function BillingClient({ billingEntities: initialEntities, availableSeasons }: BillingClientProps) {
  const [billingEntities, setBillingEntities] = useState(initialEntities);
  const [currentSeason, setCurrentSeason] = useState<number>(availableSeasons[0] || new Date().getFullYear());
  const [expandedEntities, setExpandedEntities] = useState<Set<number>>(new Set());
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter entities by selected season
  const filteredEntities = useMemo(() => {
    const filtered = billingEntities.filter(be => be.season === currentSeason);
    // Auto-expand all entities for current season
    setExpandedEntities(new Set(filtered.map(be => be.id)));
    return filtered;
  }, [billingEntities, currentSeason]);

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

  const collapseAll = () => setExpandedEntities(new Set());
  const expandAll = () => setExpandedEntities(new Set(filteredEntities.map(be => be.id)));

  // Calculate bulk discount for an entity based on operation-level bulk field count
  const calculateBulkDiscount = (lines: InvoiceLine[], operationBulkFieldCount: number): { discount: number; eligibleCount: number } => {
    // Count bulk fields for THIS entity
    const entityBulkCount = lines.filter(line =>
      line.serviceType.toLowerCase().includes('bulk')
    ).length;

    // Discount applies if OPERATION has 10+ bulk fields total
    if (operationBulkFieldCount >= BULK_DISCOUNT_MIN_FIELDS && entityBulkCount > 0) {
      return {
        discount: entityBulkCount * BULK_DISCOUNT_PER_FIELD,
        eligibleCount: entityBulkCount,
      };
    }
    return { discount: 0, eligibleCount: 0 };
  };

  const handleUpdateInvoiceDate = async (invoiceId: number, field: 'sent_at' | 'deposit_at' | 'paid_at', value: string) => {
    try {
      const updateData: Record<string, unknown> = { [field]: value || null };
      if (field === 'sent_at' && value) updateData.status = 'Sent';
      if (field === 'paid_at' && value) updateData.status = 'Paid';

      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const fieldMap: Record<string, string> = { sent_at: 'sentAt', deposit_at: 'depositAt', paid_at: 'paidAt' };
        setBillingEntities(billingEntities.map((be) => ({
          ...be,
          invoices: be.invoices.map((inv) => {
            if (inv.id === invoiceId) {
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

  const handleSaveNotes = async (invoiceId: number) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesValue }),
      });

      if (response.ok) {
        setBillingEntities(billingEntities.map((be) => ({
          ...be,
          invoices: be.invoices.map((inv) =>
            inv.id === invoiceId ? { ...inv, notes: notesValue } : inv
          ),
        })));
        setEditingNotes(null);
      } else {
        alert('Failed to save notes');
      }
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const headers = ['Billing Entity', 'Operation', 'Field', 'Service Type', 'Rate', 'Discount', 'Total'];
    const rows: (string | number)[][] = [];

    filteredEntities.forEach((be) => {
      be.invoices.forEach((inv) => {
        const { discount } = calculateBulkDiscount(inv.lines, be.operationBulkFieldCount || 0);
        const subtotal = inv.lines.reduce((sum, line) => sum + line.rate, 0);

        inv.lines.forEach((line, idx) => {
          rows.push([
            idx === 0 ? be.name : '',
            idx === 0 ? be.operation : '',
            line.fieldName,
            line.serviceType,
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
  const totalSubtotal = filteredEntities.reduce((sum, be) =>
    sum + be.invoices.reduce((invSum, inv) =>
      invSum + inv.lines.reduce((lineSum, line) => lineSum + line.rate, 0), 0), 0);

  const totalDiscount = filteredEntities.reduce((sum, be) =>
    sum + be.invoices.reduce((invSum, inv) =>
      invSum + calculateBulkDiscount(inv.lines, be.operationBulkFieldCount || 0).discount, 0), 0);

  const totalAfterDiscount = totalSubtotal - totalDiscount;

  const totalPaid = filteredEntities.reduce((sum, be) =>
    sum + be.invoices
      .filter(inv => inv.status.toLowerCase() === 'paid')
      .reduce((invSum, inv) => {
        const subtotal = inv.lines.reduce((s, l) => s + l.rate, 0);
        const { discount } = calculateBulkDiscount(inv.lines, be.operationBulkFieldCount || 0);
        return invSum + subtotal - discount;
      }, 0), 0);

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Billing</h2>
          <select
            value={currentSeason}
            onChange={(e) => setCurrentSeason(parseInt(e.target.value, 10))}
            style={{
              background: 'var(--accent-green-dim)',
              color: 'var(--accent-green)',
              border: 'none',
              padding: '4px 12px',
              borderRadius: '16px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {availableSeasons.map((s) => (
              <option key={s} value={s}>{s} Season</option>
            ))}
          </select>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={collapseAll} title="Collapse all entities">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            Collapse All
          </button>
          <button className="btn btn-secondary" onClick={expandAll} title="Expand all entities">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Expand All
          </button>
          <button className="btn btn-secondary" onClick={handleExport}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
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
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No billing entities with {currentSeason} field seasons found.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredEntities.map((be) => {
              const isExpanded = expandedEntities.has(be.id);
              const invoice = be.invoices[0]; // Usually one invoice per entity per season
              const lines = invoice?.lines || [];
              const subtotal = lines.reduce((sum, line) => sum + line.rate, 0);
              const { discount, eligibleCount } = calculateBulkDiscount(lines, be.operationBulkFieldCount || 0);
              const total = subtotal - discount;

              return (
                <div key={`${be.id}-${be.season}`} className="table-container" style={{ overflow: 'hidden' }}>
                  {/* Entity Header */}
                  <div
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: 'var(--bg-secondary)',
                    }}
                    onClick={() => toggleExpand(be.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <svg
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        style={{
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '15px' }}>{be.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{be.operation}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 600 }}>
                          {formatCurrency(total)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {lines.length} {lines.length === 1 ? 'field' : 'fields'}
                          {discount > 0 && ` • -${formatCurrency(discount)} bulk`}
                        </div>
                      </div>
                      {invoice && (
                        <span className={`status-badge ${invoice.status.toLowerCase() === 'paid' ? 'installed' : invoice.status.toLowerCase() === 'sent' ? 'pending' : 'needs-probe'}`}>
                          <span className="status-dot"></span>
                          {invoice.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {/* Line Items */}
                      {lines.length > 0 ? (
                        <table style={{ width: '100%' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-tertiary)' }}>
                              <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500, fontSize: '13px' }}>Field</th>
                              <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 500, fontSize: '13px' }}>Service Type</th>
                              <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500, fontSize: '13px' }}>Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((line) => (
                              <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '10px 20px', fontSize: '14px' }}>{line.fieldName}</td>
                                <td style={{ padding: '10px 20px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                                  {line.serviceType || '—'}
                                </td>
                                <td style={{ padding: '10px 20px', textAlign: 'right', fontSize: '14px' }}>
                                  {formatCurrency(line.rate)}
                                </td>
                              </tr>
                            ))}
                            {/* Subtotal row */}
                            <tr style={{ background: 'var(--bg-tertiary)' }}>
                              <td colSpan={2} style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500, fontSize: '13px' }}>
                                Subtotal
                              </td>
                              <td style={{ padding: '10px 20px', textAlign: 'right', fontSize: '14px' }}>
                                {formatCurrency(subtotal)}
                              </td>
                            </tr>
                            {/* Discount row (if applicable) */}
                            {discount > 0 && (
                              <tr style={{ background: 'var(--bg-tertiary)' }}>
                                <td colSpan={2} style={{ padding: '10px 20px', textAlign: 'right', fontSize: '13px', color: 'var(--accent-green)' }}>
                                  Bulk Discount ({eligibleCount} fields × ${BULK_DISCOUNT_PER_FIELD})
                                </td>
                                <td style={{ padding: '10px 20px', textAlign: 'right', fontSize: '14px', color: 'var(--accent-green)' }}>
                                  -{formatCurrency(discount)}
                                </td>
                              </tr>
                            )}
                            {/* Total row */}
                            <tr style={{ background: 'var(--bg-secondary)' }}>
                              <td colSpan={2} style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, fontSize: '14px' }}>
                                Total
                              </td>
                              <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: '16px', fontWeight: 600 }}>
                                {formatCurrency(total)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No line items yet. Enroll fields to add billing items.
                        </div>
                      )}

                      {/* Footer: Notes + Dates */}
                      {invoice && (
                        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                          {/* Notes */}
                          <div style={{ flex: '1 1 300px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                              Notes
                            </label>
                            {editingNotes === invoice.id ? (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <textarea
                                  value={notesValue}
                                  onChange={(e) => setNotesValue(e.target.value)}
                                  style={{
                                    flex: 1,
                                    padding: '8px',
                                    fontSize: '13px',
                                    border: '1px solid var(--border)',
                                    borderRadius: '4px',
                                    background: 'var(--bg-secondary)',
                                    resize: 'vertical',
                                    minHeight: '60px',
                                  }}
                                  placeholder="Add notes..."
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <button
                                    className="btn btn-primary"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                    onClick={() => handleSaveNotes(invoice.id)}
                                    disabled={saving}
                                  >
                                    {saving ? '...' : 'Save'}
                                  </button>
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                    onClick={() => setEditingNotes(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingNotes(invoice.id);
                                  setNotesValue(invoice.notes || '');
                                }}
                                style={{
                                  padding: '8px',
                                  fontSize: '13px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: 'var(--bg-secondary)',
                                  minHeight: '40px',
                                  cursor: 'pointer',
                                  color: invoice.notes ? 'var(--text-primary)' : 'var(--text-muted)',
                                }}
                              >
                                {invoice.notes || 'Click to add notes...'}
                              </div>
                            )}
                          </div>

                          {/* Dates */}
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <div>
                              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                                Sent Date
                              </label>
                              <input
                                type="date"
                                value={invoice.sentAt?.split('T')[0] || ''}
                                onChange={(e) => handleUpdateInvoiceDate(invoice.id, 'sent_at', e.target.value)}
                                style={{
                                  padding: '8px',
                                  fontSize: '13px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: 'var(--bg-secondary)',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                                Deposit Date
                              </label>
                              <input
                                type="date"
                                value={invoice.depositAt?.split('T')[0] || ''}
                                onChange={(e) => handleUpdateInvoiceDate(invoice.id, 'deposit_at', e.target.value)}
                                style={{
                                  padding: '8px',
                                  fontSize: '13px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: 'var(--bg-secondary)',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                                Paid Date
                              </label>
                              <input
                                type="date"
                                value={invoice.paidAt?.split('T')[0] || ''}
                                onChange={(e) => handleUpdateInvoiceDate(invoice.id, 'paid_at', e.target.value)}
                                style={{
                                  padding: '8px',
                                  fontSize: '13px',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: 'var(--bg-secondary)',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
