'use client';

import { useState } from 'react';
import OperationsClient from '@/app/operations/OperationsClient';
import ContactsClient from '@/app/contacts/ContactsClient';
import BillingEntitiesClient from '@/app/billing-entities/BillingEntitiesClient';
import CRMOverview from './CRMOverview';
import type { ProcessedOperation, ContactOption as OpContactOption } from '@/app/operations/OperationsClient';
import type { ProcessedContact, OperationOption, BillingEntityOption } from '@/app/contacts/page';
import type { ProcessedBillingEntity, ContactOption as BEContactOption } from '@/app/billing-entities/page';

type CRMTab = 'overview' | 'operations' | 'contacts' | 'billing';

const TABS: { key: CRMTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
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
  const [activeTab, setActiveTab] = useState<CRMTab>('overview');

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
        {activeTab === 'overview' && (
          <CRMOverview
            operations={operationsData.operations}
            contacts={contactsData.contacts}
            billingEntities={billingEntitiesData.billingEntities}
          />
        )}

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
