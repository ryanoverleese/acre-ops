import { getBillingEntities, getOperations, getContacts } from '@/lib/baserow';
import BillingEntitiesClient from './BillingEntitiesClient';

export interface ProcessedBillingEntity {
  id: number;
  name: string;
  selfInstall: boolean;
  operationNames: string[];
  contactIds: number[];
  contactNames: string[];
}

export interface OperationOption {
  id: number;
  name: string;
}

export interface ContactOption {
  id: number;
  name: string;
  operationIds: number[];
  billingEntityIds: number[];
}

async function getData() {
  try {
    const [billingEntities, operations, contacts] = await Promise.all([
      getBillingEntities(),
      getOperations(),
      getContacts(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    // Build maps from contacts: billing entity -> operations and billing entity -> contacts
    const beToOperations = new Map<number, Set<number>>();
    const beToContacts = new Map<number, { id: number; name: string }[]>();

    contacts.forEach((contact) => {
      const contactOpIds = contact.operations?.map((op) => op.id) || [];
      const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

      contactBeIds.forEach((beId) => {
        // Map billing entity to operations through this contact
        const existingOps = beToOperations.get(beId) || new Set();
        contactOpIds.forEach((opId) => existingOps.add(opId));
        beToOperations.set(beId, existingOps);

        // Map billing entity to contacts
        const existingContacts = beToContacts.get(beId) || [];
        if (!existingContacts.some((c) => c.id === contact.id)) {
          existingContacts.push({ id: contact.id, name: contact.name });
        }
        beToContacts.set(beId, existingContacts);
      });
    });

    const processed: ProcessedBillingEntity[] = billingEntities.map((be) => {
      const opIds = beToOperations.get(be.id) || new Set();
      const opNames = Array.from(opIds).map((id) => operationMap.get(id) || 'Unknown');
      const linkedContacts = beToContacts.get(be.id) || [];

      return {
        id: be.id,
        name: be.name || '',
        selfInstall: be.self_install === true,
        operationNames: opNames,
        contactIds: linkedContacts.map((c) => c.id),
        contactNames: linkedContacts.map((c) => c.name),
      };
    });

    const operationOptions: OperationOption[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
    }));

    // Include operation IDs and billing entity IDs so we can manage links
    const contactOptions: ContactOption[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      operationIds: c.operations?.map((op) => op.id) || [],
      billingEntityIds: c.billing_entity?.map((be) => be.id) || [],
    }));

    return { billingEntities: processed, operations: operationOptions, contacts: contactOptions };
  } catch (error) {
    console.error('Error fetching data:', error);
    return { billingEntities: [], operations: [], contacts: [] };
  }
}

export default async function BillingEntitiesPage() {
  const { billingEntities, operations, contacts } = await getData();

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Billing Entities</h2>
        </div>
      </header>

      <div className="content">
        <BillingEntitiesClient
          initialEntities={billingEntities}
          operations={operations}
          contacts={contacts}
        />
      </div>
    </>
  );
}
