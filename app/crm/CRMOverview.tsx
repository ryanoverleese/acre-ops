'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
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

  const opListRef = useRef<HTMLDivElement>(null);
  const beListRef = useRef<HTMLDivElement>(null);
  const contactListRef = useRef<HTMLDivElement>(null);
  // Y position of the clicked card on screen, so we can align floated items to it
  const targetYRef = useRef<number | null>(null);

  const maps = useMemo(() => {
    const opToBEs = new Map<number, Set<number>>();
    const opToContacts = new Map<number, Set<number>>();
    const beToOps = new Map<number, Set<number>>();
    const beToContacts = new Map<number, Set<number>>();

    operations.forEach((op) => {
      opToBEs.set(op.id, new Set(op.billingEntities.map((be) => be.id)));
      opToContacts.set(op.id, new Set(op.linkedContacts.map((c) => c.contactId)));
      op.billingEntities.forEach((be) => {
        if (!beToOps.has(be.id)) beToOps.set(be.id, new Set());
        beToOps.get(be.id)!.add(op.id);
      });
    });
    billingEntities.forEach((be) => {
      beToContacts.set(be.id, new Set(be.contactIds));
    });

    return { opToBEs, opToContacts, beToOps, beToContacts };
  }, [operations, billingEntities]);

  const related = useMemo(() => {
    if (!selected) return null;
    if (selected.type === 'op') return {
      ops: new Set([selected.id]),
      bes: maps.opToBEs.get(selected.id) ?? new Set<number>(),
      contacts: maps.opToContacts.get(selected.id) ?? new Set<number>(),
    };
    if (selected.type === 'be') return {
      ops: maps.beToOps.get(selected.id) ?? new Set<number>(),
      bes: new Set([selected.id]),
      contacts: maps.beToContacts.get(selected.id) ?? new Set<number>(),
    };
    const contact = contacts.find((c) => c.id === selected.id);
    return {
      ops: new Set(contact?.operationIds ?? []),
      bes: new Set(contact?.billingEntityIds ?? []),
      contacts: new Set([selected.id]),
    };
  }, [selected, maps, contacts]);

  // After re-render (items have floated to top of each list), scroll each OTHER column
  // so its first floated item appears at the same Y position as the card that was clicked.
  useEffect(() => {
    const targetY = targetYRef.current;
    if (!related || targetY === null) return;

    [opListRef, beListRef, contactListRef].forEach((listRef) => {
      const list = listRef.current;
      if (!list) return;
      // The first child of the list is the first item after float-to-top.
      // If it has the 'related' class it's a floated item; scroll to position it at targetY.
      const firstCard = list.querySelector<HTMLElement>('.crm-ov-card.related');
      if (!firstCard) return; // skip the clicked column (its card has 'selected' not 'related')
      const containerRect = list.getBoundingClientRect();
      // offsetTop of card within the scroll container
      const cardOffset = firstCard.offsetTop;
      // We want: containerRect.top + cardOffset - newScrollTop = targetY
      const newScrollTop = containerRect.top + cardOffset - targetY;
      list.scrollTop = Math.max(0, newScrollTop);
    });
  }, [related]);

  const toggle = (type: SelType, id: number, e: React.MouseEvent<HTMLElement>) => {
    const isDeselecting = selected?.type === type && selected.id === id;
    targetYRef.current = isDeselecting ? null : e.currentTarget.getBoundingClientRect().top;
    setSelected(isDeselecting ? null : { type, id });
  };

  const cardClass = (type: SelType, id: number) => {
    if (!related) return 'crm-ov-card';
    const set = type === 'op' ? related.ops : type === 'be' ? related.bes : related.contacts;
    if (selected?.type === type && selected.id === id) return 'crm-ov-card selected';
    if (set.has(id)) return 'crm-ov-card related';
    return 'crm-ov-card dimmed';
  };

  // Sort related items to the top; return [sortedItems, indexOfLastRelatedItem]
  function floatRelated<T>(items: T[], isRelated: (item: T) => boolean): T[] {
    if (!related) return items;
    return [...items.filter(isRelated), ...items.filter((i) => !isRelated(i))];
  }

  const q = (s: string) => s.toLowerCase();

  const sortedOps = floatRelated(
    operations.filter((op) => q(op.name).includes(q(opSearch))).sort((a, b) => a.name.localeCompare(b.name)),
    (op) => !!related?.ops.has(op.id)
  );
  const sortedBEs = floatRelated(
    billingEntities.filter((be) => q(be.name).includes(q(beSearch))).sort((a, b) => a.name.localeCompare(b.name)),
    (be) => !!related?.bes.has(be.id)
  );
  const sortedContacts = floatRelated(
    contacts
      .filter((c) => q(c.name).includes(q(contactSearch)) || q(c.email).includes(q(contactSearch)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    (c) => !!related?.contacts.has(c.id)
  );

  return (
    <div className="crm-ov">
      {selected ? (
        <p className="crm-ov-hint">Click same item to clear — click another to switch</p>
      ) : (
        <p className="crm-ov-hint crm-ov-hint-idle">Click any item to surface its connections</p>
      )}

      <div className="crm-ov-columns">

        {/* Operations */}
        <div className="crm-ov-col">
          <div className="crm-ov-col-header">
            <span className="crm-ov-col-title" style={{ color: 'var(--accent-primary)' }}>Operations</span>
            <span className="crm-ov-col-count">{operations.length}</span>
          </div>
          <input className="crm-ov-search" placeholder="Search…" value={opSearch} onChange={(e) => setOpSearch(e.target.value)} />
          <div className="crm-ov-list" ref={opListRef}>
            {sortedOps.map((op) => (
              <div key={op.id} className={cardClass('op', op.id)} onClick={(e) => toggle('op', op.id, e)}>
                <div className="crm-ov-card-name">{op.name}</div>
                <div className="crm-ov-card-meta">
                  {op.billingEntities.length > 0 && <span>{op.billingEntities.length} billing</span>}
                  {op.linkedContacts.length > 0 && <span>{op.linkedContacts.length} contact{op.linkedContacts.length !== 1 ? 's' : ''}</span>}
                  {op.fieldCount > 0 && <span>{op.fieldCount} field{op.fieldCount !== 1 ? 's' : ''}</span>}
                </div>
              </div>
            ))}
            {sortedOps.length === 0 && <p className="crm-ov-empty">No results</p>}
          </div>
        </div>

        {/* Billing Entities */}
        <div className="crm-ov-col">
          <div className="crm-ov-col-header">
            <span className="crm-ov-col-title" style={{ color: 'var(--accent-blue)' }}>Billing Entities</span>
            <span className="crm-ov-col-count">{billingEntities.length}</span>
          </div>
          <input className="crm-ov-search" placeholder="Search…" value={beSearch} onChange={(e) => setBeSearch(e.target.value)} />
          <div className="crm-ov-list" ref={beListRef}>
            {sortedBEs.map((be) => (
              <div key={be.id} className={cardClass('be', be.id)} onClick={(e) => toggle('be', be.id, e)}>
                <div className="crm-ov-card-name">
                  {be.name}
                  {be.selfInstall && <span className="crm-ov-badge teal">Self-install</span>}
                </div>
                <div className="crm-ov-card-meta">
                  {be.operationNames.length > 0 && <span>{be.operationNames.length} op{be.operationNames.length !== 1 ? 's' : ''}</span>}
                  {be.contactIds.length > 0 && <span>{be.contactIds.length} contact{be.contactIds.length !== 1 ? 's' : ''}</span>}
                </div>
              </div>
            ))}
            {sortedBEs.length === 0 && <p className="crm-ov-empty">No results</p>}
          </div>
        </div>

        {/* Contacts */}
        <div className="crm-ov-col">
          <div className="crm-ov-col-header">
            <span className="crm-ov-col-title" style={{ color: 'var(--accent-amber)' }}>Contacts</span>
            <span className="crm-ov-col-count">{contacts.length}</span>
          </div>
          <input className="crm-ov-search" placeholder="Search name or email…" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
          <div className="crm-ov-list" ref={contactListRef}>
            {sortedContacts.map((contact) => (
              <div key={contact.id} className={cardClass('contact', contact.id)} onClick={(e) => toggle('contact', contact.id, e)}>
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
                  {contact.operationIds.length > 0 && <span>{contact.operationIds.length} op{contact.operationIds.length !== 1 ? 's' : ''}</span>}
                  {contact.billingEntityIds.length > 0 && <span>{contact.billingEntityIds.length} billing</span>}
                  {contact.customerType.map((t) => (
                    <span key={t} className="crm-ov-tag purple">{t}</span>
                  ))}
                </div>
              </div>
            ))}
            {sortedContacts.length === 0 && <p className="crm-ov-empty">No results</p>}
          </div>
        </div>

      </div>
    </div>
  );
}
