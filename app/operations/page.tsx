import { getOperations, getContacts, getBillingEntities, getFields, getProbes } from '@/lib/baserow';
import { buildOperationMap, buildBillingEntityMap, buildBillingToOperationMaps, buildOperationToBillingEntityMap } from '@/lib/data-mappings';
import OperationsClient, { ProcessedOperation, ContactOption, LinkedContact } from './OperationsClient';

async function getOperationsData(): Promise<{
  operations: ProcessedOperation[];
  allContacts: ContactOption[];
}> {
  try {
    const [operations, contacts, billingEntities, fields, probes] = await Promise.all([
      getOperations(),
      getContacts(),
      getBillingEntities(),
      getFields(),
      getProbes(),
    ]);

    const operationMap = buildOperationMap(operations);
    const billingEntityMap = buildBillingEntityMap(billingEntities);
    const operationToBillingEntityIds = buildOperationToBillingEntityMap(contacts);
    const { billingToOperationIds } = buildBillingToOperationMaps(contacts, operationMap);

    // Build linked contacts for each operation
    const linkedContactsMap = new Map<number, LinkedContact[]>();
    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
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
      });
    });

    // Count fields per operation (field -> billing_entity -> operation)
    const operationFieldCount = new Map<number, number>();
    fields.forEach((field) => {
      const beLink = field.billing_entity?.[0];
      if (beLink) {
        const opIds = billingToOperationIds.get(beLink.id);
        if (opIds) {
          opIds.forEach((opId) => {
            operationFieldCount.set(opId, (operationFieldCount.get(opId) || 0) + 1);
          });
        }
      }
    });

    // Count probes per operation (probe -> billing_entity -> operation)
    const operationProbeCount = new Map<number, number>();
    probes.forEach((probe) => {
      const beLink = probe.billing_entity?.[0];
      if (beLink) {
        const opIds = billingToOperationIds.get(beLink.id);
        if (opIds) {
          opIds.forEach((opId) => {
            operationProbeCount.set(opId, (operationProbeCount.get(opId) || 0) + 1);
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
      const beIds = operationToBillingEntityIds.get(op.id) || [];
      const billingEntitiesForOp = beIds.map((beId) => ({
        id: beId,
        name: billingEntityMap.get(beId) || 'Unknown',
      }));

      return {
        id: op.id,
        name: op.name,
        linkedContacts: linkedContactsMap.get(op.id) || [],
        billingEntities: billingEntitiesForOp,
        fieldCount: operationFieldCount.get(op.id) || 0,
        probeCount: operationProbeCount.get(op.id) || 0,
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
