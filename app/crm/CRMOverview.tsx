'use client';

import { useState, useMemo } from 'react';
import type { ProcessedOperation } from '@/app/operations/OperationsClient';
import type { ProcessedContact } from '@/app/contacts/page';
import type { ProcessedBillingEntity } from '@/app/billing-entities/page';

interface Props {
  operations: ProcessedOperation[];
  contacts: ProcessedContact[];
  billingEntities: ProcessedBillingEntity[];
}

type SelType = 'op' | 'be' | 'contact';

export default function CRMOverview({ operations, contacts, billingEntities }: Props) {
  const [selected, setSelected] = useState<{ type: SelType; id: number } | null>(null);
  const [opSearch, setOpSearch] = useState('');
  const [beSearch, setBeSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');

  // Build bidirectional relationship maps
  const maps = useMemo(() => {
    const opToBEs = new Map<number, Set<number>>();
    const opToContacts = new Map<number, Set<number>>();
    const beToOps = new Map<number, Set<number>>();

    operations.forEach((op) => {
      opToBEs.set(op.id, new Set(op.billingEntities.map((be) => be.id)));
      opToContacts.set(op.id, new Set(op.linkedContacts.map((c) => c.contactId)));

      op.billingEntities.forEach((be) => {
        if (!beToOps.has(be.id)) beToOps.set(be.id, new Set());
        beToOps.get(be.id)!.add(op.id);
      });
    });

    // BE → contacts from billingEntities data
    const beToContacts = new Map<number, Set<number>>();
    billingEntities.forEach((be) => {
      beToContacts.set(be.id, new Set(be.contactIds));
    });

    return { opToBEs, opToContacts, beToOps, beToContacts };
  }, [operations, billingEntities]);

  // Compute which IDs are related to the current selection
  const related = useMemo(() => {
    if (!selected) return null;

    if (selected.type === 'op') {
      return {
        ops: new Set([selected.id]),
        bes: maps.opToBEs.get(selected.id) ?? new Set<number>(),
        contacts: maps.opToContacts.get(selected.id) ?? new Set<number>(),
      };
    }
    if (selected.type === 'be') {
      return {
        ops: maps.beToOps.get(selected.id) ?? new Set<number>(),
        bes: new Set([selected.id]),
        contacts: maps.beToContacts.get(selected.id) ?? new Set<number>(),
      };
    }
    // contact
    const contact = contacts.find((c) => c.id === selected.id);
    return {
      ops: new Set(contact?.operationIds ?? []),
      bes: new Set(contact?.billingEntityIds ?? []),
      contacts: new Set([selected.id]),
    };
  }, [selected, maps, contacts]);

  const toggle = (type: SelType, id: number) => {
    setSelected((prev) => (prev?.type === type && prev.id === id ? null : { type, id }));
  };

  const cardClass = (type: SelType, id: number) => {
    if (!related) return 'crm-ov-card';
    const relSet = type === 'op' ? related.ops : type === 'be' ? related.bes : related.contacts;
    const isSelected = selected?.type === type && selected.id === id;
    if (isSelected) return 'crm-ov-card selected';
    if (relSet.has(id)) return 'crm-ov-card related';
    return 'crm-ov-card dimmed';
  };

  const q = (s: string) => s.toLowerCase();
  const filteredOps = operations.filter((op) => q(op.name).includes(q(opSearch)));
  const filteredBEs = billingEntities.filter((be) => q(be.name).includes(q(beSearch)));
  const filteredContacts = contacts.filter(
    (c) => q(c.name).includes(q(contactSearch)) || q(c.email).includes(q(contactSearch))
  );

  return (
    <div className="crm-ov">
      {selected && (
        <p className="crm-ov-hint">
          Click the same item again to clear — or click any other item to switch focus
        </p>
      )}

      <div className="crm-ov-columns">

        {/* Operations */}
        <div className="crm-ov-col">
          <div className="crm-ov-col-header">
            <span className="crm-ov-col-title" style={{ color: 'var(--accent-primary)' }}>Operations</span>
            <span className="crm-ov-col-count">{operations.length}</span>
          </div>
          <input
            className="crm-ov-search"
            placeholder="Search…"
            value={opSearch}
            onChange={(e) => setOpSearch(e.target.value)}
          />
          <div className="crm-ov-list">
            {filteredOps.map((op) => (
              <div key={op.id} className={cardClass('op', op.id)} onClick={() => toggle('op', op.id)}>
                <div className="crm-ov-card-name">{op.name}</div>
                <div className="crm-ov-card-meta">
                  {op.billingEntities.length > 0 && (
                    <span>{op.billingEntities.length} billing</span>
                  )}
                  {op.linkedContacts.length > 0 && (
                    <span>{op.linkedContacts.length} contact{op.linkedContacts.length !== 1 ? 's' : ''}</span>
                  )}
                  {op.fieldCount > 0 && (
                    <span>{op.fieldCount} field{op.fieldCount !== 1 ? 's' : ''}</span>
                  )}
                  {op.probeCount > 0 && (
                    <span>{op.probeCount} probe{op.probeCount !== 1 ? 's' : ''}</span>
                  )}
                </div>
                {selected?.type === 'op' && selected.id === op.id && op.billingEntities.length > 0 && (
                  <div className="crm-ov-tags">
                    {op.billingEntities.map((be) => (
                      <span key={be.id} className="crm-ov-tag blue">{be.name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredOps.length === 0 && <p className="crm-ov-empty">No results</p>}
          </div>
        </div>

        {/* Billing Entities */}
        <div className="crm-ov-col">
          <div className="crm-ov-col-header">
            <span className="crm-ov-col-title" style={{ color: 'var(--accent-blue)' }}>Billing Entities</span>
            <span className="crm-ov-col-count">{billingEntities.length}</span>
          </div>
          <input
            className="crm-ov-search"
            placeholder="Search…"
            value={beSearch}
            onChange={(e) => setBeSearch(e.target.value)}
          />
          <div className="crm-ov-list">
            {filteredBEs.map((be) => (
              <div key={be.id} className={cardClass('be', be.id)} onClick={() => toggle('be', be.id)}>
                <div className="crm-ov-card-name">
                  {be.name}
                  {be.selfInstall && <span className="crm-ov-badge teal">Self-install</span>}
                </div>
                <div className="crm-ov-card-meta">
                  {be.operationNames.length > 0 && (
                    <span>{be.operationNames.length} op{be.operationNames.length !== 1 ? 's' : ''}</span>
                  )}
                  {be.contactIds.length > 0 && (
                    <span>{be.contactIds.length} contact{be.contactIds.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            ))}
            {filteredBEs.length === 0 && <p className="crm-ov-empty">No results</p>}
          </div>
        </div>

        {/* Contacts */}
        <div className="crm-ov-col">
          <div className="crm-ov-col-header">
            <span className="crm-ov-col-title" style={{ color: 'var(--accent-amber)' }}>Contacts</span>
            <span className="crm-ov-col-count">{contacts.length}</span>
          </div>
          <input
            className="crm-ov-search"
            placeholder="Search name or email…"
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
          />
          <div className="crm-ov-list">
            {filteredContacts.map((contact) => (
              <div key={contact.id} className={cardClass('contact', contact.id)} onClick={() => toggle('contact', contact.id)}>
                <div className="crm-ov-card-name">
                  {contact.name}
                  {contact.isMainContact && <span className="crm-ov-badge amber">Main</span>}
                </div>
                {(contact.email || contact.phone) && (
                  <div className="crm-ov-card-sub">
                    {contact.email && <span>{contact.email}</span>}
                    {contact.phone && <span>{contact.phone}</span>}
                  </div>
                )}
                <div className="crm-ov-card-meta">
                  {contact.operationIds.length > 0 && (
                    <span>{contact.operationIds.length} op{contact.operationIds.length !== 1 ? 's' : ''}</span>
                  )}
                  {contact.billingEntityIds.length > 0 && (
                    <span>{contact.billingEntityIds.length} billing</span>
                  )}
                  {contact.customerType.map((t) => (
                    <span key={t} className="crm-ov-tag purple">{t}</span>
                  ))}
                </div>
              </div>
            ))}
            {filteredContacts.length === 0 && <p className="crm-ov-empty">No results</p>}
          </div>
        </div>

      </div>
    </div>
  );
}
