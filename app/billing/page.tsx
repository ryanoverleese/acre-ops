import { getBillingEntities, getInvoices, getOperations, getContacts } from '@/lib/baserow';

interface ProcessedBillingEntity {
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

async function getBillingData(): Promise<ProcessedBillingEntity[]> {
  try {
    const [billingEntities, invoices, operations, contacts] = await Promise.all([
      getBillingEntities(),
      getInvoices(),
      getOperations(),
      getContacts(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    // Group invoices by billing entity
    const invoicesByBE = new Map<number, typeof invoices>();
    invoices.forEach((inv) => {
      const beLink = inv.billing_entity?.[0];
      if (beLink) {
        const existing = invoicesByBE.get(beLink.id) || [];
        existing.push(inv);
        invoicesByBE.set(beLink.id, existing);
      }
    });

    return billingEntities.map((be) => {
      const opLink = be.operation?.[0];
      const contactLink = be.invoice_contact?.[0];
      const contact = contactLink ? contactMap.get(contactLink.id) : null;
      const beInvoices = invoicesByBE.get(be.id) || [];

      const processedInvoices = beInvoices.map((inv) => ({
        id: inv.id,
        season: inv.season || 2025,
        amount: inv.amount || 0,
        status: inv.status?.value || 'Draft',
        sentAt: inv.sent_at,
        paidAt: inv.paid_at,
      }));

      const totalBilled = processedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const totalPaid = processedInvoices
        .filter((inv) => inv.status.toLowerCase() === 'paid')
        .reduce((sum, inv) => sum + inv.amount, 0);

      return {
        id: be.id,
        name: be.name,
        operation: opLink ? operationMap.get(opLink.id) || opLink.value : 'Unknown',
        invoiceContact: contact?.name || contactLink?.value || '—',
        invoiceContactEmail: contact?.email,
        invoices: processedInvoices,
        totalBilled,
        totalPaid,
      };
    });
  } catch (error) {
    console.error('Error fetching billing data:', error);
    return [];
  }
}

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

export default async function BillingPage() {
  const billingEntities = await getBillingData();

  const totalBilled = billingEntities.reduce((sum, be) => sum + be.totalBilled, 0);
  const totalPaid = billingEntities.reduce((sum, be) => sum + be.totalPaid, 0);
  const totalOutstanding = totalBilled - totalPaid;

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Billing</h2>
          <span className="season-badge">2025 Season</span>
        </div>
        <div className="header-right">
          <button className="btn btn-secondary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button className="btn btn-primary">
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
                <th>Billing Entity</th>
                <th>Operation</th>
                <th>Invoice Contact</th>
                <th>Invoices</th>
                <th>Total Billed</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {billingEntities.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No billing entities found.
                  </td>
                </tr>
              ) : (
                billingEntities.map((be) => {
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
                        <button className="action-btn">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
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
    </>
  );
}
