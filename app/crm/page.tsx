import { getOperations, getContacts, getBillingEntities, getFields, getProbes } from '@/lib/baserow';
import CRMClient from './CRMClient';

// Re-export types needed by client components
import type { ProcessedOperation, ContactOption as OpContactOption, LinkedContact } from '@/app/operations/OperationsClient';
import type { ProcessedContact, OperationOption, BillingEntityOption } from '@/app/contacts/page';
import type { ProcessedBillingEntity, ContactOption as BEContactOption } from '@/app/billing-entities/page';

export type { ProcessedOperation, OpContactOption, LinkedContact };
export type { ProcessedContact, OperationOption, BillingEntityOption };
export type { ProcessedBillingEntity, BEContactOption };

async function getCRMData() {
  try {
    const [operations, contacts, billingEntities, fields, probes] = await Promise.all([
      getOperations(),
      getContacts(),
      getBillingEntities(),
      getFields(),
      getProbes(),
    ]);

    // === OPERATIONS DATA ===
    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name]));
    const linkedContactsMap = new Map<number, LinkedContact[]>();
    const operationBillingMap = new Map<number, Set<number>>();

    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

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

        contactBeIds.forEach((beId) => {
          const existingBEs = operationBillingMap.get(opId) || new Set();
          existingBEs.add(beId);
          operationBillingMap.set(opId, existingBEs);
        });
      });
    });

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

    const operationProbeCount = new Map<number, number>();
    probes.forEach((probe) => {
      const beLink = probe.billing_entity?.[0];
      if (beLink) {
        const opIds = beToOperations.get(beLink.id);
        if (opIds) {
          opIds.forEach((opId) => {
            operationProbeCount.set(opId, (operationProbeCount.get(opId) || 0) + 1);
          });
        }
      }
    });

    const allContactsForOps: OpContactOption[] = contacts.map((c) => ({
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
        probeCount: operationProbeCount.get(op.id) || 0,
        notes: op.notes,
      };
    });

    // === CONTACTS DATA ===
    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    const processedContacts: ProcessedContact[] = contacts.map((contact) => {
      const opIds = contact.operations?.map((op) => op.id) || [];
      const opNames = opIds.map((id) => operationMap.get(id) || 'Unknown');
      const beIds = contact.billing_entity?.map((be) => be.id) || [];
      const beNames = beIds.map((id) => billingEntityMap.get(id) || 'Unknown');

      return {
        id: contact.id,
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        address: contact.address || '',
        addressLat: contact.address_lat ?? null,
        addressLng: contact.address_lng ?? null,
        customerType: contact.customer_type?.map((ct) => ct.value) || [],
        notes: contact.notes || '',
        operationIds: opIds,
        operationNames: opNames,
        isMainContact: contact.is_main_contact?.value === 'Yes',
        billingEntityIds: beIds,
        billingEntityNames: beNames,
      };
    });

    const operationOptions: OperationOption[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
    }));

    const billingEntityOptions: BillingEntityOption[] = billingEntities.map((be) => ({
      id: be.id,
      name: be.name || '',
    }));

    // === BILLING ENTITIES DATA ===
    const beToContacts = new Map<number, { id: number; name: string }[]>();
    contacts.forEach((contact) => {
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];
      contactBeIds.forEach((beId) => {
        const existingContacts = beToContacts.get(beId) || [];
        if (!existingContacts.some((c) => c.id === contact.id)) {
          existingContacts.push({ id: contact.id, name: contact.name });
        }
        beToContacts.set(beId, existingContacts);
      });
    });

    const processedBillingEntities: ProcessedBillingEntity[] = billingEntities.map((be) => {
      const opIds = beToOperations.get(be.id) || new Set();
      const opNames = Array.from(opIds).map((id) => operationMap.get(id) || 'Unknown');
      const linkedContacts = beToContacts.get(be.id) || [];

      return {
        id: be.id,
        name: be.name || '',
        operationNames: opNames,
        contactIds: linkedContacts.map((c) => c.id),
        contactNames: linkedContacts.map((c) => c.name),
      };
    });

    const beContactOptions: BEContactOption[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      operationIds: c.operations?.map((op) => op.id) || [],
      billingEntityIds: c.billing_entity?.map((be) => be.id) || [],
    }));

    return {
      operationsData: { operations: processedOperations, allContacts: allContactsForOps },
      contactsData: { contacts: processedContacts, operations: operationOptions, billingEntities: billingEntityOptions },
      billingEntitiesData: { billingEntities: processedBillingEntities, operations: operationOptions, contacts: beContactOptions },
    };
  } catch (error) {
    console.error('Error fetching CRM data:', error);
    return {
      operationsData: { operations: [], allContacts: [] },
      contactsData: { contacts: [], operations: [], billingEntities: [] },
      billingEntitiesData: { billingEntities: [], operations: [], contacts: [] },
    };
  }
}

export default async function CRMPage() {
  const { operationsData, contactsData, billingEntitiesData } = await getCRMData();

  return (
    <CRMClient
      operationsData={operationsData}
      contactsData={contactsData}
      billingEntitiesData={billingEntitiesData}
    />
  );
}
