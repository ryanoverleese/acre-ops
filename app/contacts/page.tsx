import { getContacts } from '@/lib/baserow';
import ContactsClient from './ContactsClient';

export interface ProcessedContact {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  customerType: string;
  notes: string;
}

async function getContactsData(): Promise<ProcessedContact[]> {
  try {
    const contacts = await getContacts();

    return contacts.map((contact) => ({
      id: contact.id,
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      address: contact.address || '',
      customerType: contact.customer_type?.value || '',
      notes: contact.notes || '',
    }));
  } catch (error) {
    console.error('Error fetching contacts data:', error);
    return [];
  }
}

export default async function ContactsPage() {
  const contacts = await getContactsData();

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Contacts</h2>
        </div>
      </header>

      <div className="content">
        <ContactsClient initialContacts={contacts} />
      </div>
    </>
  );
}
