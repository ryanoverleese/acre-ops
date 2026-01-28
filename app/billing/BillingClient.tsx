'use client';

import { useState } from 'react';

export interface ProcessedBillingEntity {
  id: number;
  name: string;
  operation: string;
  invoiceContact: string;
  invoiceContactEmail?: string;
  invoices: {
    id: number;
    season: number;
    amount: number;
    status: string;
    sentAt?: string;
    paidAt?: string;
  }[];
  totalBilled: number;
  totalPaid: number;
}

interface BillingClientProps {
  billingEntities: ProcessedBillingEntity[];
}

const INVOICE_STATUS_OPTIONS = ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'];

const initialForm = {
  billing_entity: '',
  season: new Date().getFullYear().toString(),
  amount: '',
  status: 'Draft',
  notes: '',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function BillingClient({ billingEntities: initialEntities }: BillingClientProps) {
  const [billingEntities, setBillingEntities] = useState(initialEntities);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInvoicesModal, setShowInvoicesModal] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<ProcessedBillingEntity | null>(null);
  const [addForm, setAddForm] = useState(initialForm);
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

  const sortedEntities = [...billingEntities].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (sortColumn) {
      case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
      case 'operation': aVal = a.operation.toLowerCase(); bVal = b.operation.toLowerCase(); break;
      case 'totalBilled': aVal = a.totalBilled; bVal = b.totalBilled; break;
      default: aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalBilled = billingEntities.reduce((sum, be) => sum + be.totalBilled, 0);
  const totalPaid = billingEntities.reduce((sum, be) => sum + be.totalPaid, 0);
  const totalOutstanding = totalBilled - totalPaid;

  const handleAddInvoice = async () => {
    if (!addForm.billing_entity) {
      alert('Billing entity is required');
      return;
    }
    if (!addForm.amount) {
      alert('Amount is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        billing_entity: parseInt(addForm.billing_entity, 10),
        season: parseInt(addForm.season, 10),
        amount: parseFloat(addForm.amount),
        status: addForm.status,
      };
      if (addForm.notes) payload.notes = addForm.notes;

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm(initialForm);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create invoice');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (invoiceId: number) => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Paid',
          paid_at: new Date().toISOString().split('T')[0],
        }),
      });
      if (response.ok) {
        window.location.reload();
      } else {
        alert('Failed to mark as paid');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to mark as paid');
    }
  };

  const handleDeleteInvoice = async (invoiceId: number) => {
    if (!confirm('Delete this invoice?')) return;
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        window.location.reload();
      } else {
        alert('Failed to delete invoice');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to delete invoice');
    }
  };

  const handleExport = () => {
    // Generate CSV
    const headers = ['Billing Entity', 'Operation', 'Contact', 'Total Billed', 'Total Paid', 'Outstanding'];
    const rows = billingEntities.map((be) => [
      be.name,
      be.operation,
      be.invoiceContact,
      be.totalBilled,
      be.totalPaid,
      be.totalBilled - be.totalPaid,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openInvoicesModal = (entity: ProcessedBillingEntity) => {
    setSelectedEntity(entity);
    setShowInvoicesModal(true);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Billing</h2>
          <span className="season-badge">2025 Season</span>
        </div>
        <div className="header-right">
          <button className="btn btn-secondary" onClick={handleExport}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Invoice
          </button>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">Billing Entities</div>
            <div className="stat-value blue">{billingEntities.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Billed</div>
            <div className="stat-value">{formatCurrency(totalBilled)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Paid</div>
            <div className="stat-value green">{formatCurrency(totalPaid)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Outstanding</div>
            <div className="stat-value amber">{formatCurrency(totalOutstanding)}</div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">Billing Entities</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('name')}>
                  Billing Entity
                  {sortColumn === 'name' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('operation')}>
                  Operation
                  {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th>Invoice Contact</th>
                <th>Invoices</th>
                <th className="sortable" onClick={() => handleSort('totalBilled')}>
                  Total Billed
                  {sortColumn === 'totalBilled' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedEntities.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No billing entities found.
                  </td>
                </tr>
              ) : (
                sortedEntities.map((be) => {
                  const paidCount = be.invoices.filter((i) => i.status.toLowerCase() === 'paid').length;
                  const pendingCount = be.invoices.filter((i) => i.status.toLowerCase() !== 'paid').length;

                  return (
                    <tr key={be.id}>
                      <td className="operation-name">{be.name}</td>
                      <td style={{ fontSize: '13px' }}>{be.operation}</td>
                      <td>
                        <div>
                          <div style={{ fontSize: '14px' }}>{be.invoiceContact}</div>
                          {be.invoiceContactEmail && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {be.invoiceContactEmail}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>
                            {be.invoices.length}
                          </span>
                          {paidCount > 0 && (
                            <span className="status-badge installed" style={{ padding: '2px 6px', fontSize: '11px' }}>
                              {paidCount} paid
                            </span>
                          )}
                          {pendingCount > 0 && (
                            <span className="status-badge pending" style={{ padding: '2px 6px', fontSize: '11px' }}>
                              {pendingCount} pending
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '14px' }}>
                        {formatCurrency(be.totalBilled)}
                      </td>
                      <td>
                        {be.totalBilled === 0 ? (
                          <span className="status-badge needs-probe">
                            <span className="status-dot"></span>
                            No invoices
                          </span>
                        ) : be.totalPaid >= be.totalBilled ? (
                          <span className="status-badge installed">
                            <span className="status-dot"></span>
                            Paid
                          </span>
                        ) : be.totalPaid > 0 ? (
                          <span className="status-badge pending">
                            <span className="status-dot"></span>
                            Partial
                          </span>
                        ) : (
                          <span className="status-badge repair">
                            <span className="status-dot"></span>
                            Unpaid
                          </span>
                        )}
                      </td>
                      <td>
                        <button className="action-btn" title="View Invoices" onClick={() => openInvoicesModal(be)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>New Invoice</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Billing Entity *</label>
                  <select
                    value={addForm.billing_entity}
                    onChange={(e) => setAddForm({ ...addForm, billing_entity: e.target.value })}
                  >
                    <option value="">Select billing entity...</option>
                    {billingEntities.map((be) => (
                      <option key={be.id} value={be.id}>
                        {be.name} ({be.operation})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Season</label>
                    <select
                      value={addForm.season}
                      onChange={(e) => setAddForm({ ...addForm, season: e.target.value })}
                    >
                      <option value="2024">2024</option>
                      <option value="2025">2025</option>
                      <option value="2026">2026</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Amount *</label>
                    <input
                      type="number"
                      value={addForm.amount}
                      onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={addForm.status}
                    onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                  >
                    {INVOICE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={addForm.notes}
                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                    placeholder="Enter notes..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddInvoice} disabled={saving}>
                {saving ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvoicesModal && selectedEntity && (
        <div className="detail-panel-overlay" onClick={() => setShowInvoicesModal(false)}>
          <div className="detail-panel" style={{ width: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Invoices - {selectedEntity.name}</h3>
              <button className="close-btn" onClick={() => setShowInvoicesModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              {selectedEntity.invoices.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  No invoices for this billing entity.
                </p>
              ) : (
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Sent</th>
                      <th>Paid</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEntity.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.season}</td>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {formatCurrency(inv.amount)}
                        </td>
                        <td>
                          <span className={`status-badge ${inv.status.toLowerCase() === 'paid' ? 'installed' : 'pending'}`}>
                            <span className="status-dot"></span>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '13px' }}>{formatDate(inv.sentAt)}</td>
                        <td style={{ fontSize: '13px' }}>{formatDate(inv.paidAt)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {inv.status.toLowerCase() !== 'paid' && (
                              <button
                                className="action-btn"
                                title="Mark Paid"
                                onClick={() => handleMarkPaid(inv.id)}
                              >
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                            )}
                            <button
                              className="action-btn"
                              title="Delete"
                              onClick={() => handleDeleteInvoice(inv.id)}
                            >
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowInvoicesModal(false)}>Close</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowInvoicesModal(false);
                  setAddForm({ ...initialForm, billing_entity: selectedEntity.id.toString() });
                  setShowAddModal(true);
                }}
              >
                Add Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
