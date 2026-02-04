'use client';

import { useState } from 'react';

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
}

interface BillingClientProps {
  billingEntities: ProcessedBillingEntity[];
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

export default function BillingClient({ billingEntities: initialEntities }: BillingClientProps) {
  const [billingEntities, setBillingEntities] = useState(initialEntities);
  const [expandedEntities, setExpandedEntities] = useState<Set<number>>(new Set(initialEntities.map(be => be.id)));
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [notesValue, setNotesValue] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Calculate bulk discount for an invoice
  const calculateBulkDiscount = (lines: InvoiceLine[]): { discount: number; eligibleCount: number } => {
    // Count fields with "Bulk" in the service type
    const bulkLines = lines.filter(line =>
      line.serviceType.toLowerCase().includes('bulk')
    );

    if (bulkLines.length >= BULK_DISCOUNT_MIN_FIELDS) {
      return {
        discount: bulkLines.length * BULK_DISCOUNT_PER_FIELD,
        eligibleCount: bulkLines.length,
      };
    }
    return { discount: 0, eligibleCount: 0 };
  };

  const handleUpdateInvoiceDate = async (invoiceId: number, field: 'sent_at' | 'paid_at', value: string) => {
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
        setBillingEntities(billingEntities.map((be) => ({
          ...be,
          invoices: be.invoices.map((inv) => {
            if (inv.id === invoiceId) {
              const updated = { ...inv, [field === 'sent_at' ? 'sentAt' : 'paidAt']: value || undefined };
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

    billingEntities.forEach((be) => {
      be.invoices.forEach((inv) => {
        const { discount } = calculateBulkDiscount(inv.lines);
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
    a.download = `billing-2026-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate totals
  const totalSubtotal = billingEntities.reduce((sum, be) =>
    sum + be.invoices.reduce((invSum, inv) =>
      invSum + inv.lines.reduce((lineSum, line) => lineSum + line.rate, 0), 0), 0);

  const totalDiscount = billingEntities.reduce((sum, be) =>
    sum + be.invoices.reduce((invSum, inv) =>
      invSum + calculateBulkDiscount(inv.lines).discount, 0), 0);

  const totalAfterDiscount = totalSubtotal - totalDiscount;

  const totalPaid = billingEntities.reduce((sum, be) =>
    sum + be.invoices
      .filter(inv => inv.status.toLowerCase() === 'paid')
      .reduce((invSum, inv) => {
        const subtotal = inv.lines.reduce((s, l) => s + l.rate, 0);
        const { discount } = calculateBulkDiscount(inv.lines);
        return invSum + subtotal - discount;
      }, 0), 0);

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Billing</h2>
          <span className="season-badge">2026 Season</span>
        </div>
        <div className="header-right">
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
            <div className="stat-value blue">{billingEntities.length}</div>
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

        {billingEntities.length === 0 ? (
          <div className="table-container">
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No billing entities with 2026 field seasons found.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {billingEntities.map((be) => {
              const isExpanded = expandedEntities.has(be.id);
              const invoice = be.invoices[0]; // Usually one invoice per entity per season
              const lines = invoice?.lines || [];
              const subtotal = lines.reduce((sum, line) => sum + line.rate, 0);
              const { discount, eligibleCount } = calculateBulkDiscount(lines);
              const total = subtotal - discount;

              return (
                <div key={be.id} className="table-container" style={{ overflow: 'hidden' }}>
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
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', fontWeight: 600 }}>
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
                                <td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '14px' }}>
                                  {formatCurrency(line.rate)}
                                </td>
                              </tr>
                            ))}
                            {/* Subtotal row */}
                            <tr style={{ background: 'var(--bg-tertiary)' }}>
                              <td colSpan={2} style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 500, fontSize: '13px' }}>
                                Subtotal
                              </td>
                              <td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '14px' }}>
                                {formatCurrency(subtotal)}
                              </td>
                            </tr>
                            {/* Discount row (if applicable) */}
                            {discount > 0 && (
                              <tr style={{ background: 'var(--bg-tertiary)' }}>
                                <td colSpan={2} style={{ padding: '10px 20px', textAlign: 'right', fontSize: '13px', color: 'var(--accent-green)' }}>
                                  Bulk Discount ({eligibleCount} fields × ${BULK_DISCOUNT_PER_FIELD})
                                </td>
                                <td style={{ padding: '10px 20px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '14px', color: 'var(--accent-green)' }}>
                                  -{formatCurrency(discount)}
                                </td>
                              </tr>
                            )}
                            {/* Total row */}
                            <tr style={{ background: 'var(--bg-secondary)' }}>
                              <td colSpan={2} style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, fontSize: '14px' }}>
                                Total
                              </td>
                              <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', fontWeight: 600 }}>
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
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
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
