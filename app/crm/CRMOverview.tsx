'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ProcessedOperation } from '@/app/operations/OperationsClient';
import type { ProcessedContact } from '@/app/contacts/page';
import type { ProcessedBillingEntity } from '@/app/billing-entities/page';

interface Props {
  operations: ProcessedOperation[];
  contacts: ProcessedContact[];
  billingEntities: ProcessedBillingEntity[];
}

type SelType = 'op' | 'be' | 'contact';

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export default function CRMOverview({ operations, contacts, billingEntities }: Props) {
  const [selected, setSelected] = useState<{ type: SelType; id: number } | null>(null);
  const [opSearch, setOpSearch] = useState('');
  const [beSearch, setBeSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  // Ref for the columns wrapper (SVG is positioned inside this)
  const columnsRef = useRef<HTMLDivElement>(null);
  // Map of card key → DOM element
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Stable ref for latest computeLines so scroll/resize listeners always call fresh version
  const computeLinesRef = useRef<() => void>(() => {});

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

  // Compute SVG lines for the current selection
  const computeLines = useCallback(() => {
    if (!selected || !columnsRef.current) {
      setLines([]);
      return;
    }

    const containerRect = columnsRef.current.getBoundingClientRect();

    // Returns the right or left edge midpoint of a card, relative to columnsRef.
    // Returns null if the card is scrolled out of view.
    const getEdge = (key: string, side: 'left' | 'right'): { x: number; y: number } | null => {
      const el = cardRefs.current.get(key);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const midY = r.top + r.height / 2;
      // Skip cards outside the visible column area
      if (midY < containerRect.top || midY > containerRect.bottom) return null;
      return {
        x: (side === 'right' ? r.right : r.left) - containerRect.left,
        y: midY - containerRect.top,
      };
    };

    const newLines: Line[] = [];
    const GREEN = '#4a7a5b';
    const BLUE = '#0284c7';
    const AMBER = '#d97706';

    if (selected.type === 'op') {
      const src = getEdge(`op-${selected.id}`, 'right');
      if (!src) { setLines([]); return; }

      (maps.opToBEs.get(selected.id) ?? new Set()).forEach((beId) => {
        const tgt = getEdge(`be-${beId}`, 'left');
        if (tgt) newLines.push({ x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y, color: BLUE });
      });
      (maps.opToContacts.get(selected.id) ?? new Set()).forEach((cId) => {
        const tgt = getEdge(`contact-${cId}`, 'left');
        if (tgt) newLines.push({ x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y, color: AMBER });
      });

    } else if (selected.type === 'be') {
      const srcL = getEdge(`be-${selected.id}`, 'left');
      const srcR = getEdge(`be-${selected.id}`, 'right');

      (maps.beToOps.get(selected.id) ?? new Set()).forEach((opId) => {
        const tgt = getEdge(`op-${opId}`, 'right');
        if (srcL && tgt) newLines.push({ x1: tgt.x, y1: tgt.y, x2: srcL.x, y2: srcL.y, color: GREEN });
      });
      (maps.beToContacts.get(selected.id) ?? new Set()).forEach((cId) => {
        const tgt = getEdge(`contact-${cId}`, 'left');
        if (srcR && tgt) newLines.push({ x1: srcR.x, y1: srcR.y, x2: tgt.x, y2: tgt.y, color: AMBER });
      });

    } else {
      const src = getEdge(`contact-${selected.id}`, 'left');
      const contact = contacts.find((c) => c.id === selected.id);
      if (!src || !contact) { setLines([]); return; }

      contact.operationIds.forEach((opId) => {
        const tgt = getEdge(`op-${opId}`, 'right');
        if (tgt) newLines.push({ x1: tgt.x, y1: tgt.y, x2: src.x, y2: src.y, color: GREEN });
      });
      contact.billingEntityIds.forEach((beId) => {
        const tgt = getEdge(`be-${beId}`, 'right');
        if (tgt) newLines.push({ x1: tgt.x, y1: tgt.y, x2: src.x, y2: src.y, color: BLUE });
      });
    }

    setLines(newLines);
  }, [selected, maps, contacts]);

  // Keep the stable ref up to date
  useEffect(() => {
    computeLinesRef.current = computeLines;
  }, [computeLines]);

  // Recompute when selection changes
  useEffect(() => {
    computeLines();
  }, [computeLines]);

  // Recompute on window resize
  useEffect(() => {
    const handler = () => computeLinesRef.current();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Register / deregister a card ref by key
  const registerCard = useCallback(
    (key: string) => (el: HTMLDivElement | null) => {
      if (el) cardRefs.current.set(key, el);
      else cardRefs.current.delete(key);
    },
    []
  );

  // Which items are "related" to the selection (for dimming)
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
    const set = type === 'op' ? related.ops : type === 'be' ? related.bes : related.contacts;
    if (selected?.type === type && selected.id === id) return 'crm-ov-card selected';
    if (set.has(id)) return 'crm-ov-card related';
    return 'crm-ov-card dimmed';
  };

  const q = (s: string) => s.toLowerCase();
  const filteredOps = operations.filter((op) => q(op.name).includes(q(opSearch)));
  const filteredBEs = billingEntities.filter((be) => q(be.name).includes(q(beSearch)));
  const filteredContacts = contacts.filter(
    (c) => q(c.name).includes(q(contactSearch)) || q(c.email).includes(q(contactSearch))
  );

  // Cubic bezier path between two points (horizontal control points)
  const makePath = ({ x1, y1, x2, y2 }: Line) => {
    const cx = Math.abs(x2 - x1) * 0.45;
    return `M${x1},${y1} C${x1 + cx},${y1} ${x2 - cx},${y2} ${x2},${y2}`;
  };

  const onScroll = () => computeLinesRef.current();

  return (
    <div className="crm-ov">
      {selected ? (
        <p className="crm-ov-hint">Click same item to clear — click another to switch</p>
      ) : (
        <p className="crm-ov-hint crm-ov-hint-idle">Click any item to see its connections drawn across columns</p>
      )}

      <div className="crm-ov-columns" ref={columnsRef}>
        {/* SVG connection lines — absolutely positioned over the columns */}
        <svg className="crm-ov-svg" aria-hidden="true">
          <defs>
            {['green', 'blue', 'amber'].map((name) => {
              const color = name === 'green' ? '#4a7a5b' : name === 'blue' ? '#0284c7' : '#d97706';
              return (
                <marker key={name} id={`arrow-${name}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={color} opacity={0.7} />
                </marker>
              );
            })}
          </defs>
          {lines.map((line, i) => {
            const colorName = line.color === '#4a7a5b' ? 'green' : line.color === '#0284c7' ? 'blue' : 'amber';
            return (
              <path
                key={i}
                d={makePath(line)}
                fill="none"
                stroke={line.color}
                strokeWidth={2}
                strokeOpacity={0.55}
                markerEnd={`url(#arrow-${colorName})`}
              />
            );
          })}
        </svg>

        {/* Operations */}
        <div className="crm-ov-col">
          <div className="crm-ov-col-header">
            <span className="crm-ov-col-title" style={{ color: 'var(--accent-primary)' }}>Operations</span>
            <span className="crm-ov-col-count">{operations.length}</span>
          </div>
          <input className="crm-ov-search" placeholder="Search…" value={opSearch} onChange={(e) => setOpSearch(e.target.value)} />
          <div className="crm-ov-list" onScroll={onScroll}>
            {filteredOps.map((op) => (
              <div
                key={op.id}
                ref={registerCard(`op-${op.id}`)}
                className={cardClass('op', op.id)}
                onClick={() => toggle('op', op.id)}
              >
                <div className="crm-ov-card-name">{op.name}</div>
                <div className="crm-ov-card-meta">
                  {op.billingEntities.length > 0 && <span>{op.billingEntities.length} billing</span>}
                  {op.linkedContacts.length > 0 && <span>{op.linkedContacts.length} contact{op.linkedContacts.length !== 1 ? 's' : ''}</span>}
                  {op.fieldCount > 0 && <span>{op.fieldCount} field{op.fieldCount !== 1 ? 's' : ''}</span>}
                </div>
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
          <input className="crm-ov-search" placeholder="Search…" value={beSearch} onChange={(e) => setBeSearch(e.target.value)} />
          <div className="crm-ov-list" onScroll={onScroll}>
            {filteredBEs.map((be) => (
              <div
                key={be.id}
                ref={registerCard(`be-${be.id}`)}
                className={cardClass('be', be.id)}
                onClick={() => toggle('be', be.id)}
              >
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
            {filteredBEs.length === 0 && <p className="crm-ov-empty">No results</p>}
          </div>
        </div>

        {/* Contacts */}
        <div className="crm-ov-col">
          <div className="crm-ov-col-header">
            <span className="crm-ov-col-title" style={{ color: 'var(--accent-amber)' }}>Contacts</span>
            <span className="crm-ov-col-count">{contacts.length}</span>
          </div>
          <input className="crm-ov-search" placeholder="Search name or email…" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
          <div className="crm-ov-list" onScroll={onScroll}>
            {filteredContacts.map((contact) => (
              <div
                key={contact.id}
                ref={registerCard(`contact-${contact.id}`)}
                className={cardClass('contact', contact.id)}
                onClick={() => toggle('contact', contact.id)}
              >
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
            {filteredContacts.length === 0 && <p className="crm-ov-empty">No results</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
