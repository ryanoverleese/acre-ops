'use client';

import { useState, useMemo } from 'react';
import type { ProcessedRelationship } from './page';

interface RelationshipsClientProps {
  relationships: ProcessedRelationship[];
}

export default function RelationshipsClient({ relationships }: RelationshipsClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOperations, setExpandedOperations] = useState<Set<number>>(new Set());
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());

  const filteredRelationships = useMemo(() => {
    if (!searchQuery.trim()) return relationships;

    const query = searchQuery.toLowerCase();
    return relationships.filter((rel) => {
      // Check operation name
      if (rel.operationName.toLowerCase().includes(query)) return true;

      // Check contacts
      const contactMatch = rel.contacts.some(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query)
      );
      if (contactMatch) return true;

      // Check billing entities
      const beMatch = rel.contacts.some((c) =>
        c.billingEntities.some((be) =>
          be.name.toLowerCase().includes(query)
        )
      );
      if (beMatch) return true;

      return false;
    });
  }, [relationships, searchQuery]);

  const toggleOperation = (opId: number) => {
    setExpandedOperations((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) {
        next.delete(opId);
      } else {
        next.add(opId);
      }
      return next;
    });
  };

  const toggleContact = (key: string) => {
    setExpandedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedOperations(new Set(filteredRelationships.map((r) => r.operationId)));
    const contactKeys: string[] = [];
    filteredRelationships.forEach((r) => {
      r.contacts.forEach((c) => {
        contactKeys.push(`${r.operationId}-${c.id}`);
      });
    });
    setExpandedContacts(new Set(contactKeys));
  };

  const collapseAll = () => {
    setExpandedOperations(new Set());
    setExpandedContacts(new Set());
  };

  // Summary stats
  const totalOperations = filteredRelationships.length;
  const totalContacts = filteredRelationships.reduce((sum, r) => sum + r.contacts.length, 0);
  const totalBillingEntities = filteredRelationships.reduce((sum, r) => sum + r.totalBillingEntities, 0);
  const totalFields = filteredRelationships.reduce((sum, r) => sum + r.totalFields, 0);

  return (
    <>
      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">Operations</div>
          <div className="stat-value blue">{totalOperations}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Contacts</div>
          <div className="stat-value green">{totalContacts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Billing Entities</div>
          <div className="stat-value">{totalBillingEntities}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fields (This Season)</div>
          <div className="stat-value">{totalFields}</div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Organization Hierarchy</h3>
          <div className="table-actions">
            <div className="search-box" style={{ width: '250px' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search operations, contacts, billing..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="btn btn-secondary" onClick={expandAll}>
              Expand All
            </button>
            <button className="btn btn-secondary" onClick={collapseAll}>
              Collapse All
            </button>
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {filteredRelationships.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
              No relationships found.
            </div>
          ) : (
            filteredRelationships.map((rel) => {
              const isOpExpanded = expandedOperations.has(rel.operationId);

              return (
                <div
                  key={rel.operationId}
                  style={{
                    marginBottom: '12px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Operation Row */}
                  <div
                    onClick={() => toggleOperation(rel.operationId)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      background: 'var(--bg-tertiary)',
                      cursor: 'pointer',
                    }}
                  >
                    <svg
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      style={{
                        transform: isOpExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: 'var(--accent-green)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span style={{ fontWeight: 600, fontSize: '15px' }}>{rel.operationName}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                      <span>{rel.contacts.length} contacts</span>
                      <span>{rel.totalBillingEntities} billing entities</span>
                      <span>{rel.totalFields} fields</span>
                      <span>{rel.totalAcres.toLocaleString()} acres</span>
                    </div>
                  </div>

                  {/* Contacts */}
                  {isOpExpanded && rel.contacts.length > 0 && (
                    <div style={{ padding: '8px 16px 8px 40px', background: 'var(--bg-secondary)' }}>
                      {rel.contacts.map((contact) => {
                        const contactKey = `${rel.operationId}-${contact.id}`;
                        const isContactExpanded = expandedContacts.has(contactKey);

                        return (
                          <div key={contact.id} style={{ marginBottom: '8px' }}>
                            {/* Contact Row */}
                            <div
                              onClick={() => contact.billingEntities.length > 0 && toggleContact(contactKey)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '10px 12px',
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: contact.billingEntities.length > 0 ? 'pointer' : 'default',
                              }}
                            >
                              {contact.billingEntities.length > 0 ? (
                                <svg
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  width="14"
                                  height="14"
                                  style={{
                                    transform: isContactExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s',
                                    flexShrink: 0,
                                  }}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              ) : (
                                <div style={{ width: '14px' }} />
                              )}

                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>

                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 500 }}>{contact.name || 'Unnamed Contact'}</span>
                                  {contact.isMainContact && (
                                    <span className="status-badge installed" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                      Main
                                    </span>
                                  )}
                                </div>
                                {(contact.email || contact.phone) && (
                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {contact.email}{contact.email && contact.phone && ' • '}{contact.phone}
                                  </div>
                                )}
                              </div>

                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {contact.billingEntities.length} billing {contact.billingEntities.length === 1 ? 'entity' : 'entities'}
                              </span>
                            </div>

                            {/* Billing Entities */}
                            {isContactExpanded && contact.billingEntities.length > 0 && (
                              <div style={{ paddingLeft: '40px', paddingTop: '8px' }}>
                                {contact.billingEntities.map((be) => (
                                  <div
                                    key={be.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '12px',
                                      padding: '8px 12px',
                                      background: 'var(--bg-tertiary)',
                                      borderRadius: 'var(--radius-sm)',
                                      marginBottom: '4px',
                                    }}
                                  >
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>

                                    <span style={{ flex: 1, fontWeight: 500, fontSize: '13px' }}>
                                      {be.name}
                                    </span>

                                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                      <span>{be.fieldCount} fields</span>
                                      <span>{be.totalAcres.toLocaleString()} acres</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {rel.contacts.length === 0 && (
                        <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                          No contacts linked to this operation
                        </div>
                      )}
                    </div>
                  )}

                  {isOpExpanded && rel.contacts.length === 0 && (
                    <div style={{ padding: '16px 16px 16px 40px', background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                      No contacts linked to this operation
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
