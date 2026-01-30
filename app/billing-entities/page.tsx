import { getBillingEntities, getOperations, getContacts } from '@/lib/baserow';
import BillingEntitiesClient from './BillingEntitiesClient';

export interface ProcessedBillingEntity {
  id: number;
  name: string;
  operationId: number | null;
  operationName: string;
  invoiceContactIds: number[];
  invoiceContactNames: string[];
  address: string;
  notes: string;
}

export interface OperationOption {
  id: number;
  name: string;
}

export interface ContactOption {
  id: number;
  name: string;
  operationIds: number[];
}

async function getData() {
  try {
    const [billingEntities, operations, contacts] = await Promise.all([
      getBillingEntities(),
      getOperations(),
      getContacts(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const contactMap = new Map(contacts.map((c) => [c.id, c.name]));

    const processed: ProcessedBillingEntity[] = billingEntities.map((be) => {
      const opLink = be.operation?.[0];
      const contactLinks = be.invoice_contact || [];

      return {
        id: be.id,
        name: be.name || '',
        operationId: opLink?.id || null,
        operationName: opLink ? (operationMap.get(opLink.id) || opLink.value) : '',
        invoiceContactIds: contactLinks.map((c: { id: number }) => c.id),
        invoiceContactNames: contactLinks.map((c: { id: number; value: string }) => contactMap.get(c.id) || c.value),
        address: be.address || '',
        notes: be.notes || '',
      };
    });

    const operationOptions: OperationOption[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
    }));

    // Include operation IDs so we can filter contacts by operation
    const contactOptions: ContactOption[] = contacts.map((c) => ({
      id: c.id,
      name: c.name,
      operationIds: c.operations?.map((op) => op.id) || [],
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
