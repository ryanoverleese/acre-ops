'use client';

import { useState } from 'react';
import OperationsClient from '@/app/operations/OperationsClient';
import ContactsClient from '@/app/contacts/ContactsClient';
import BillingEntitiesClient from '@/app/billing-entities/BillingEntitiesClient';
import type { ProcessedOperation, ContactOption as OpContactOption } from '@/app/operations/OperationsClient';
import type { ProcessedContact, OperationOption, BillingEntityOption } from '@/app/contacts/page';
import type { ProcessedBillingEntity, ContactOption as BEContactOption } from '@/app/billing-entities/page';

type CRMTab = 'operations' | 'contacts' | 'billing';

const TABS: { key: CRMTab; label: string }[] = [
  { key: 'operations', label: 'Operations' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'billing', label: 'Billing Entities' },
];

interface CRMClientProps {
  operationsData: {
    operations: ProcessedOperation[];
    allContacts: OpContactOption[];
  };
  contactsData: {
    contacts: ProcessedContact[];
    operations: OperationOption[];
    billingEntities: BillingEntityOption[];
    customerTypeOptions: string[];
  };
  billingEntitiesData: {
    billingEntities: ProcessedBillingEntity[];
    operations: OperationOption[];
    contacts: BEContactOption[];
  };
}

export default function CRMClient({ operationsData, contactsData, billingEntitiesData }: CRMClientProps) {
  const [activeTab, setActiveTab] = useState<CRMTab>('operations');

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>CRM</h2>
        </div>
        <div className="crm-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`crm-tab${activeTab === tab.key ? ' active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="content">
        {activeTab === 'operations' && (
          <OperationsClient
            operations={operationsData.operations}
            allContacts={operationsData.allContacts}
            embedded
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsClient
            initialContacts={contactsData.contacts}
            operations={contactsData.operations}
            billingEntities={contactsData.billingEntities}
            customerTypeOptions={contactsData.customerTypeOptions}
          />
        )}

        {activeTab === 'billing' && (
          <BillingEntitiesClient
            initialEntities={billingEntitiesData.billingEntities}
            operations={billingEntitiesData.operations}
            contacts={billingEntitiesData.contacts}
          />
        )}
      </div>
    </>
  );
}
