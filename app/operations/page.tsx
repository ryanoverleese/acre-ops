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

    // Build a map of billing entity ID to name
    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name]));

    // Build linked contacts and billing entities for each operation through contacts
    const linkedContactsMap = new Map<number, LinkedContact[]>();
    const operationBillingMap = new Map<number, Set<number>>(); // operation ID -> set of billing entity IDs

    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      // Link contacts to operations
      contactOpIds.forEach((opId) => {
        const existing = linkedContactsMap.get(opId) || [];
        existing.push({
          contactId: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          isMainContact: contact.is_main_contact?.value === 'Yes',
        });
        linkedContactsMap.set(opId, existing);

        // Link billing entities to operations through this contact
        contactBeIds.forEach((beId) => {
          const existingBEs = operationBillingMap.get(opId) || new Set();
          existingBEs.add(beId);
          operationBillingMap.set(opId, existingBEs);
        });
      });
    });

    // Count fields per operation (field -> billing_entity -> contact -> operation)
    // First, build a map of billing entity ID to operation IDs
    const beToOperations = new Map<number, Set<number>>();
    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      contactBeIds.forEach((beId) => {
        const existingOps = beToOperations.get(beId) || new Set();
        contactOpIds.forEach((opId) => existingOps.add(opId));
        beToOperations.set(beId, existingOps);
      });
    });

    const operationFieldCount = new Map<number, number>();
    fields.forEach((field) => {
      const beLink = field.billing_entity?.[0];
      if (beLink) {
        const opIds = beToOperations.get(beLink.id);
        if (opIds) {
          opIds.forEach((opId) => {
            operationFieldCount.set(opId, (operationFieldCount.get(opId) || 0) + 1);
          });
        }
      }
    });

    const allContacts: ContactOption[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));

    const processedOperations: ProcessedOperation[] = operations.map((op) => {
      const beIds = operationBillingMap.get(op.id) || new Set();
      const billingEntitiesForOp = Array.from(beIds).map((beId) => ({
        id: beId,
        name: billingEntityMap.get(beId) || 'Unknown',
      }));

      return {
        id: op.id,
        name: op.name,
        linkedContacts: linkedContactsMap.get(op.id) || [],
        billingEntities: billingEntitiesForOp,
        fieldCount: operationFieldCount.get(op.id) || 0,
        notes: op.notes,
      };
    });

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
