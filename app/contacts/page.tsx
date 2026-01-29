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
  customerType: string;
  notes: string;
  operationIds: number[];
  operationNames: string[];
  isMainContact: boolean;
  isInvoiceContact: boolean;
}

export interface OperationOption {
  id: number;
  name: string;
}

export interface BillingEntityOption {
  id: number;
  name: string;
  operationId: number | null;
}

async function getContactsData(): Promise<{ contacts: ProcessedContact[]; operations: OperationOption[]; billingEntities: BillingEntityOption[] }> {
  try {
    const [contacts, operations, billingEntities] = await Promise.all([
      getContacts(),
      getOperations(),
      getBillingEntities(),
    ]);

    const operationMap = new Map(operations.map((op) => [op.id, op.name]));

    // Build a set of contact IDs that are invoice contacts
    const invoiceContactIds = new Set<number>();
    billingEntities.forEach((be) => {
      const contactLink = be.invoice_contact?.[0];
      if (contactLink) {
        invoiceContactIds.add(contactLink.id);
      }
    });

    const processedContacts: ProcessedContact[] = contacts.map((contact) => {
      const opIds = contact.operations?.map((op) => op.id) || [];
      const opNames = opIds.map((id) => operationMap.get(id) || 'Unknown');

      return {
        id: contact.id,
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        address: contact.address || '',
        addressLat: contact.address_lat ?? null,
        addressLng: contact.address_lng ?? null,
        customerType: contact.customer_type?.value || '',
        notes: contact.notes || '',
        operationIds: opIds,
        operationNames: opNames,
        isMainContact: contact.is_main_contact?.value === 'Yes',
        isInvoiceContact: invoiceContactIds.has(contact.id),
      };
    });

    const operationOptions: OperationOption[] = operations.map((op) => ({
      id: op.id,
      name: op.name,
    }));

    const billingEntityOptions: BillingEntityOption[] = billingEntities.map((be) => ({
      id: be.id,
      name: be.name || '',
      operationId: be.operation?.[0]?.id || null,
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
