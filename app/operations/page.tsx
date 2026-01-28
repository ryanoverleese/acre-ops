import { getOperations, getContacts, getBillingEntities, getFields } from '@/lib/baserow';
import OperationsClient, { ProcessedOperation } from './OperationsClient';

async function getOperationsData(): Promise<ProcessedOperation[]> {
  try {
    const [operations, contacts, billingEntities, fields] = await Promise.all([
      getOperations(),
      getContacts(),
      getBillingEntities(),
      getFields(),
    ]);

    const contactMap = new Map(contacts.map((c) => [c.id, c]));

    const operationBillingMap = new Map<number, { id: number; name: string }[]>();
    billingEntities.forEach((be) => {
      const opLink = be.operation?.[0];
      if (opLink) {
        const existing = operationBillingMap.get(opLink.id) || [];
        existing.push({ id: be.id, name: be.name });
        operationBillingMap.set(opLink.id, existing);
      }
    });

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
  return <OperationsClient operations={operations} />;
}
