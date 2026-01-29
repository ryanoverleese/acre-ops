import { getOperations, getContacts, getBillingEntities, getFields } from '@/lib/baserow';
import OperationsClient, { ProcessedOperation, ContactOption, LinkedContact } from './OperationsClient';

async function getOperationsData(): Promise<{
  operations: ProcessedOperation[];
  allContacts: ContactOption[];
}> {
  try {
    const [operations, contacts, billingEntities, fields] = await Promise.all([
      getOperations(),
      getContacts(),
      getBillingEntities(),
      getFields(),
    ]);

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

    // Build linked contacts directly from contacts table (contacts have operations link)
    const linkedContactsMap = new Map<number, LinkedContact[]>();
    contacts.forEach((contact) => {
      // A contact can be linked to multiple operations
      contact.operations?.forEach((opLink) => {
        const existing = linkedContactsMap.get(opLink.id) || [];
        existing.push({
          contactId: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          isMainContact: contact.is_main_contact?.value === 'Yes',
        });
        linkedContactsMap.set(opLink.id, existing);
      });
    });

    const allContacts: ContactOption[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));

    const processedOperations: ProcessedOperation[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
      linkedContacts: linkedContactsMap.get(op.id) || [],
      billingEntities: operationBillingMap.get(op.id) || [],
      fieldCount: operationFieldCount.get(op.id) || 0,
      notes: op.notes,
    }));

    return { operations: processedOperations, allContacts };
  } catch (error) {
    console.error('Error fetching operations data:', error);
    return { operations: [], allContacts: [] };
  }
}

export default async function OperationsPage() {
  const { operations, allContacts } = await getOperationsData();
  return <OperationsClient operations={operations} allContacts={allContacts} />;
}
