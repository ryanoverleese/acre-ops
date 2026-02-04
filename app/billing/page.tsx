import { getBillingEntities, getInvoices, getOperations, getContacts, getInvoiceLines, getFieldSeasons, getFields } from '@/lib/baserow';
import BillingClient, { ProcessedBillingEntity } from './BillingClient';

async function getBillingData(): Promise<ProcessedBillingEntity[]> {
  try {
    const [billingEntities, invoices, operations, contacts, invoiceLines, fieldSeasons, fields] = await Promise.all([
      getBillingEntities(),
      getInvoices(),
      getOperations(),
      getContacts(),
      getInvoiceLines(),
      getFieldSeasons(),
      getFields(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    // Build maps from contacts: billing entity -> operations and billing entity -> contacts
    const beToOperations = new Map<number, string[]>();
    const beToContacts = new Map<number, { name: string; email?: string }[]>();

    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactOpNames = contactOpIds.map((id) => operationMap.get(id) || 'Unknown');
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      contactBeIds.forEach((beId) => {
        // Add operation names for this billing entity
        const existingOps = beToOperations.get(beId) || [];
        contactOpNames.forEach((name) => {
          if (!existingOps.includes(name)) existingOps.push(name);
        });
        beToOperations.set(beId, existingOps);

        // Add contact for this billing entity
        const existingContacts = beToContacts.get(beId) || [];
        if (!existingContacts.some((c) => c.name === contact.name)) {
          existingContacts.push({ name: contact.name, email: contact.email });
        }
        beToContacts.set(beId, existingContacts);
      });
    });

    // Build map of field ID to field name
    const fieldNameMap = new Map(fields.map((f) => [f.id, f.name]));

    // Build map of field season ID to field name
    const fieldSeasonToFieldName = new Map<number, string>();
    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      if (fieldId) {
        const fieldName = fieldNameMap.get(fieldId) || fs.field?.[0]?.value || 'Unknown';
        fieldSeasonToFieldName.set(fs.id, fieldName);
      }
    });

    // Group invoice lines by invoice ID
    const linesByInvoice = new Map<number, typeof invoiceLines>();
    invoiceLines.forEach((line) => {
      const invoiceId = line.invoice?.[0]?.id;
      if (invoiceId) {
        const existing = linesByInvoice.get(invoiceId) || [];
        existing.push(line);
        linesByInvoice.set(invoiceId, existing);
      }
    });

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
      const opNames = beToOperations.get(be.id) || [];
      const linkedContacts = beToContacts.get(be.id) || [];
      const beInvoices = invoicesByBE.get(be.id) || [];

      const processedInvoices = beInvoices.map((inv) => {
        const lines = linesByInvoice.get(inv.id) || [];
        const processedLines = lines.map((line) => {
          const fieldSeasonId = line.field_season?.[0]?.id;
          const fieldName = fieldSeasonId ? fieldSeasonToFieldName.get(fieldSeasonId) || 'Unknown' : 'Unknown';
          return {
            id: line.id,
            fieldName,
            serviceType: line.service_type || '',
            rate: line.rate || 0,
          };
        });

        return {
          id: inv.id,
          season: inv.season || 2025,
          amount: inv.amount || 0,
          status: inv.status?.value || 'Draft',
          sentAt: inv.sent_at,
          paidAt: inv.paid_at,
          lines: processedLines,
        };
      });

      const totalBilled = processedInvoices.reduce((sum, inv) => sum + inv.amount, 0);
      const totalPaid = processedInvoices
        .filter((inv) => inv.status.toLowerCase() === 'paid')
        .reduce((sum, inv) => sum + inv.amount, 0);

      return {
        id: be.id,
        name: be.name,
        operation: opNames.length > 0 ? opNames.join(', ') : '—',
        invoiceContact: linkedContacts.length > 0 ? linkedContacts.map((c) => c.name).join(', ') : '—',
        invoiceContactEmail: linkedContacts[0]?.email,
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

export default async function BillingPage() {
  const billingEntities = await getBillingData();
  return <BillingClient billingEntities={billingEntities} />;
}
