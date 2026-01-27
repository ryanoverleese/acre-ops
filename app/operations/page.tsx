import { getOperations, getContacts, getBillingEntities, getFields } from '@/lib/baserow';

interface ProcessedOperation {
  id: number;
  name: string;
  contacts: { id: number; name: string; email?: string; phone?: string }[];
  billingEntities: { id: number; name: string }[];
  fieldCount: number;
  notes?: string;
}

async function getOperationsData(): Promise<ProcessedOperation[]> {
  try {
    const [operations, contacts, billingEntities, fields] = await Promise.all([
      getOperations(),
      getContacts(),
      getBillingEntities(),
      getFields(),
    ]);

    // Create contact lookup
    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    // Map billing entities to operations
    const operationBillingMap = new Map<number, { id: number; name: string }[]>();
    billingEntities.forEach((be) => {
      const opLink = be.operation?.[0];
      if (opLink) {
        const existing = operationBillingMap.get(opLink.id) || [];
        existing.push({ id: be.id, name: be.name });
        operationBillingMap.set(opLink.id, existing);
      }
    });

    // Count fields per billing entity -> operation
    const operationFieldCount = new Map<number, number>();
    fields.forEach((field) => {
      const beLink = field.billing_entity?.[0];
      if (beLink) {
        const be = billingEntities.find((b) => b.id === beLink.id);
        const opLink = be?.operation?.[0];
        if (opLink) {
          operationFieldCount.set(opLink.id, (operationFieldCount.get(opLink.id) || 0) + 1);
        }
      }
    });

    // Get contacts for each billing entity's invoice_contact
    const operationContactsMap = new Map<number, { id: number; name: string; email?: string; phone?: string }[]>();
    billingEntities.forEach((be) => {
      const opLink = be.operation?.[0];
      const contactLink = be.invoice_contact?.[0];
      if (opLink && contactLink) {
        const contact = contactMap.get(contactLink.id);
        if (contact) {
          const existing = operationContactsMap.get(opLink.id) || [];
          if (!existing.find((c) => c.id === contact.id)) {
            existing.push({
              id: contact.id,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
            });
          }
          operationContactsMap.set(opLink.id, existing);
        }
      }
    });

    return operations.map((op) => ({
      id: op.id,
      name: op.name,
      contacts: operationContactsMap.get(op.id) || [],
      billingEntities: operationBillingMap.get(op.id) || [],
      fieldCount: operationFieldCount.get(op.id) || 0,
      notes: op.notes,
    }));
  } catch (error) {
    console.error('Error fetching operations data:', error);
    return [];
  }
}

export default async function OperationsPage() {
  const operations = await getOperationsData();

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Operations</h2>
          <span className="season-badge">2025 Season</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search operations..." />
          </div>
          <button className="btn btn-primary">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Operation
          </button>
        </div>
      </header>

      <div className="content">
        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">All Operations ({operations.length})</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Operation Name</th>
                <th>Contacts</th>
                <th>Billing Entities</th>
                <th>Fields</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {operations.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No operations found.
                  </td>
                </tr>
              ) : (
                operations.map((op) => (
                  <tr key={op.id}>
                    <td className="operation-name">{op.name}</td>
                    <td>
                      {op.contacts.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {op.contacts.map((c) => (
                            <div key={c.id} style={{ fontSize: '13px' }}>
                              <span>{c.name}</span>
                              {c.phone && (
                                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{c.phone}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {op.billingEntities.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {op.billingEntities.map((be) => (
                            <span key={be.id} className="status-badge in-stock">{be.name}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="field-count">{op.fieldCount}</td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {op.notes || '—'}
                    </td>
                    <td>
                      <button className="action-btn">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
