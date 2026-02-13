import { getContacts, getOperations, getBillingEntities } from '@/lib/baserow';
import ContactsClient from './ContactsClient';

export interface ProcessedContact {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  addressLat: number | null;
  addressLng: number | null;
  customerType: string[];
  notes: string;
  operationIds: number[];
  operationNames: string[];
  isMainContact: boolean;
  billingEntityIds: number[];
  billingEntityNames: string[];
}

export interface OperationOption {
  id: number;
  name: string;
}

export interface BillingEntityOption {
  id: number;
  name: string;
}

async function getContactsData(): Promise<{ contacts: ProcessedContact[]; operations: OperationOption[]; billingEntities: BillingEntityOption[] }> {
  try {
    const [contacts, operations, billingEntities] = await Promise.all([
      getContacts(),
      getOperations(),
      getBillingEntities(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));
    const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name]));

    const processedContacts: ProcessedContact[] = contacts.map((contact) => {
      const opIds = contact.operations?.map((op) => op.id) || [];
      const opNames = opIds.map((id) => operationMap.get(id) || 'Unknown');

      // Get billing entity IDs and names directly from contact's billing_entity link
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

    return { contacts: processedContacts, operations: operationOptions, billingEntities: billingEntityOptions };
  } catch (error) {
    console.error('Error fetching contacts data:', error);
    return { contacts: [], operations: [], billingEntities: [] };
  }
}

export default async function ContactsPage() {
  const { contacts, operations, billingEntities } = await getContactsData();

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Contacts</h2>
        </div>
      </header>

      <div className="content">
        <ContactsClient initialContacts={contacts} operations={operations} billingEntities={billingEntities} />
      </div>
    </>
  );
}
