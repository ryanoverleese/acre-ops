import { getBillingEntities, getInvoices, getOperations, getContacts } from '@/lib/baserow';
import BillingClient, { ProcessedBillingEntity } from './BillingClient';

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

export default async function BillingPage() {
  const billingEntities = await getBillingData();
  return <BillingClient billingEntities={billingEntities} />;
}
