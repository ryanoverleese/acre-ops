import { getBillingEntities, getInvoices, getOperations, getContacts, getInvoiceLines, getFieldSeasons, getFields } from '@/lib/baserow';
import BillingClient, { ProcessedBillingEntity } from './BillingClient';

const CURRENT_SEASON = 2026;

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
        const existingOps = beToOperations.get(beId) || [];
        contactOpNames.forEach((name) => {
          if (!existingOps.includes(name)) existingOps.push(name);
        });
        beToOperations.set(beId, existingOps);

        const existingContacts = beToContacts.get(beId) || [];
        if (!existingContacts.some((c) => c.name === contact.name)) {
          existingContacts.push({ name: contact.name, email: contact.email });
        }
        beToContacts.set(beId, existingContacts);
      });
    });

    // Build map of field ID to field details (including billing entity)
    const fieldMap = new Map(fields.map((f) => [f.id, { name: f.name, billingEntityId: f.billing_entity?.[0]?.id }]));

    // Build map of field season to details (field name, service type, billing entity)
    const fieldSeasonMap = new Map<number, { fieldName: string; serviceType: string; billingEntityId?: number }>();

    // Also track which billing entities have 2026 field seasons
    const beWith2026Fields = new Set<number>();

    fieldSeasons.forEach((fs) => {
      const fieldId = fs.field?.[0]?.id;
      const fieldInfo = fieldId ? fieldMap.get(fieldId) : null;
      const fieldName = fieldInfo?.name || fs.field?.[0]?.value || 'Unknown';
      const serviceType = fs.service_type?.value || '';
      const billingEntityId = fieldInfo?.billingEntityId;

      fieldSeasonMap.set(fs.id, { fieldName, serviceType, billingEntityId });

      // Track billing entities with 2026 fields
      if (fs.season === CURRENT_SEASON && billingEntityId) {
        beWith2026Fields.add(billingEntityId);
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

    // Group invoices by billing entity (only 2026 invoices)
    const invoicesByBE = new Map<number, typeof invoices>();
    invoices.forEach((inv) => {
      if (inv.season !== CURRENT_SEASON) return;
      const beLink = inv.billing_entity?.[0];
      if (beLink) {
        const existing = invoicesByBE.get(beLink.id) || [];
        existing.push(inv);
        invoicesByBE.set(beLink.id, existing);
      }
    });

    // Only process billing entities that have 2026 field seasons
    return billingEntities
      .filter((be) => beWith2026Fields.has(be.id))
      .map((be) => {
        const opNames = beToOperations.get(be.id) || [];
        const linkedContacts = beToContacts.get(be.id) || [];
        const beInvoices = invoicesByBE.get(be.id) || [];

        const processedInvoices = beInvoices.map((inv) => {
          const lines = linesByInvoice.get(inv.id) || [];
          const processedLines = lines.map((line) => {
            const fieldSeasonId = line.field_season?.[0]?.id;
            const fsInfo = fieldSeasonId ? fieldSeasonMap.get(fieldSeasonId) : null;
            return {
              id: line.id,
              fieldName: fsInfo?.fieldName || 'Unknown',
              serviceType: line.service_type || fsInfo?.serviceType || '',
              rate: line.rate || 0,
            };
          });

          return {
            id: inv.id,
            season: inv.season || CURRENT_SEASON,
            amount: inv.amount || 0,
            status: inv.status?.value || 'Draft',
            sentAt: inv.sent_at,
            paidAt: inv.paid_at,
            notes: inv.notes || '',
            lines: processedLines,
          };
        });

        // If no invoice exists yet, we still show the entity but with empty invoice
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
