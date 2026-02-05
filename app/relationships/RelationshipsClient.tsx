'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ProcessedRelationship, ContactOption, OrphanedBillingEntity } from './page';

interface RelationshipsClientProps {
  relationships: ProcessedRelationship[];
  allContacts: ContactOption[];
  orphanedBillingEntities: OrphanedBillingEntity[];
  unlinkedContacts: ContactOption[];
}

export default function RelationshipsClient({
  relationships: initialRelationships,
  allContacts,
  orphanedBillingEntities,
  unlinkedContacts,
}: RelationshipsClientProps) {
  const [relationships, setRelationships] = useState(initialRelationships);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOperations, setExpandedOperations] = useState<Set<number>>(new Set());
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());
  const [showHealthIssues, setShowHealthIssues] = useState(false);

  // Add contact modal state
  const [addContactModal, setAddContactModal] = useState<{ operationId: number; operationName: string } | null>(null);
  const [newContactId, setNewContactId] = useState('');
  const [newContactIsMain, setNewContactIsMain] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredRelationships = useMemo(() => {
    if (!searchQuery.trim()) return relationships;

    const query = searchQuery.toLowerCase();
    return relationships.filter((rel) => {
      if (rel.operationName.toLowerCase().includes(query)) return true;

      const contactMatch = rel.contacts.some(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query)
      );
      if (contactMatch) return true;

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

  // Health metrics
  const operationsWithNoContacts = relationships.filter((r) => r.contacts.length === 0);
  const totalHealthIssues = operationsWithNoContacts.length + orphanedBillingEntities.length + unlinkedContacts.length;

  // Summary stats
  const totalOperations = filteredRelationships.length;
  const totalContacts = filteredRelationships.reduce((sum, r) => sum + r.contacts.length, 0);
  const totalBillingEntities = filteredRelationships.reduce((sum, r) => sum + r.totalBillingEntities, 0);
  const totalFields = filteredRelationships.reduce((sum, r) => sum + r.totalFields, 0);

  // Get available contacts for a specific operation (not already linked)
  const getAvailableContacts = (operationId: number) => {
    const rel = relationships.find((r) => r.operationId === operationId);
    const linkedContactIds = new Set(rel?.contacts.map((c) => c.id) || []);
    return allContacts.filter((c) => !linkedContactIds.has(c.id));
  };

  // Add contact to operation
  const handleAddContact = async () => {
    if (!newContactId || !addContactModal) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${newContactId}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: addContactModal.operationId,
          isMainContact: newContactIsMain,
        }),
      });
      if (response.ok) {
        // Update local state
        const contact = allContacts.find((c) => c.id === parseInt(newContactId));
        if (contact) {
          setRelationships((prev) =>
            prev.map((rel) => {
              if (rel.operationId === addContactModal.operationId) {
                return {
                  ...rel,
                  contacts: [
                    ...rel.contacts,
                    {
                      id: contact.id,
                      name: contact.name,
                      email: contact.email,
                      phone: contact.phone,
                      isMainContact: newContactIsMain,
                      billingEntities: [],
                    },
                  ],
                };
              }
              return rel;
            })
          );
        }
        setAddContactModal(null);
        setNewContactId('');
        setNewContactIsMain(false);
      } else {
        alert('Failed to add contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to add contact');
    } finally {
      setSaving(false);
    }
  };

  // Remove contact from operation
  const handleRemoveContact = async (operationId: number, contactId: number, contactName: string) => {
    if (!confirm(`Remove ${contactName} from this operation?`)) return;
    try {
      const response = await fetch(`/api/contacts/${contactId}/operations?operationId=${operationId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setRelationships((prev) =>
          prev.map((rel) => {
            if (rel.operationId === operationId) {
              return {
                ...rel,
                contacts: rel.contacts.filter((c) => c.id !== contactId),
              };
            }
            return rel;
          })
        );
      } else {
        alert('Failed to remove contact');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to remove contact');
    }
  };

  // Toggle main contact status
  const handleToggleMainContact = async (operationId: number, contactId: number, currentIsMain: boolean) => {
    try {
      const response = await fetch(`/api/contacts/${contactId}/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId,
          isMainContact: !currentIsMain,
        }),
      });
      if (response.ok) {
        setRelationships((prev) =>
          prev.map((rel) => {
            if (rel.operationId === operationId) {
              return {
                ...rel,
                contacts: rel.contacts.map((c) =>
                  c.id === contactId ? { ...c, isMainContact: !currentIsMain } : c
                ),
              };
            }
            return rel;
          })
        );
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

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
        <div className="stat-card" style={{ cursor: totalHealthIssues > 0 ? 'pointer' : 'default' }} onClick={() => totalHealthIssues > 0 && setShowHealthIssues(!showHealthIssues)}>
          <div className="stat-label">Health Issues</div>
          <div className={`stat-value ${totalHealthIssues > 0 ? 'red' : 'green'}`}>
            {totalHealthIssues}
          </div>
        </div>
      </div>

      {/* Health Issues Panel */}
      {showHealthIssues && totalHealthIssues > 0 && (
        <div className="table-container" style={{ marginBottom: '24px', background: 'var(--bg-card)', borderColor: 'var(--status-red)' }}>
          <div className="table-header" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="table-title" style={{ color: 'var(--status-red)' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Relationship Health Issues
            </h3>
            <button className="btn btn-secondary" onClick={() => setShowHealthIssues(false)}>Hide</button>
          </div>
          <div style={{ padding: '16px' }}>
            {operationsWithNoContacts.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Operations with No Contacts ({operationsWithNoContacts.length})
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {operationsWithNoContacts.map((op) => (
                    <Link
                      key={op.operationId}
                      href={`/operations`}
                      className="status-badge pending"
                      style={{ textDecoration: 'none' }}
                    >
                      {op.operationName}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {unlinkedContacts.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Contacts Not Linked to Any Operation ({unlinkedContacts.length})
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {unlinkedContacts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/contacts`}
                      className="status-badge pending"
                      style={{ textDecoration: 'none' }}
                    >
                      {c.name || c.email}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {orphanedBillingEntities.length > 0 && (
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Billing Entities Not Linked to Any Contact ({orphanedBillingEntities.length})
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {orphanedBillingEntities.map((be) => (
                    <Link
                      key={be.id}
                      href={`/billing-entities`}
                      className="status-badge pending"
                      style={{ textDecoration: 'none' }}
                    >
                      {be.name} {be.fieldCount > 0 && `(${be.fieldCount} fields)`}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
              const hasNoContacts = rel.contacts.length === 0;

              return (
                <div
                  key={rel.operationId}
                  style={{
                    marginBottom: '12px',
                    border: `1px solid ${hasNoContacts ? 'var(--status-yellow)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Operation Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      background: 'var(--bg-tertiary)',
                    }}
                  >
                    <button
                      onClick={() => toggleOperation(rel.operationId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
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
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: 'var(--accent-green)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <Link
                        href="/operations"
                        style={{ fontWeight: 600, fontSize: '15px', textDecoration: 'none', color: 'inherit' }}
                        className="hover-link"
                      >
                        {rel.operationName}
                      </Link>
                      {hasNoContacts && (
                        <span className="status-badge pending" style={{ fontSize: '10px', padding: '2px 6px' }}>
                          No contacts
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-muted)', alignItems: 'center' }}>
                      <span>{rel.contacts.length} contacts</span>
                      <span>{rel.totalBillingEntities} billing entities</span>
                      <span>{rel.totalFields} fields</span>
                      <span>{rel.totalAcres.toLocaleString()} acres</span>

                      {/* Quick action: Add contact */}
                      <button
                        className="action-btn"
                        title="Add contact to this operation"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddContactModal({ operationId: rel.operationId, operationName: rel.operationName });
                        }}
                        style={{ marginLeft: '8px' }}
                      >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                      </button>
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
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '10px 12px',
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              {contact.billingEntities.length > 0 ? (
                                <button
                                  onClick={() => toggleContact(contactKey)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
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
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              ) : (
                                <div style={{ width: '14px' }} />
                              )}

                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>

                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Link
                                    href="/contacts"
                                    style={{ fontWeight: 500, textDecoration: 'none', color: 'inherit' }}
                                    className="hover-link"
                                  >
                                    {contact.name || 'Unnamed Contact'}
                                  </Link>
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

                              {/* Contact quick actions */}
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  className="action-btn"
                                  title={contact.isMainContact ? 'Remove main contact status' : 'Set as main contact'}
                                  onClick={() => handleToggleMainContact(rel.operationId, contact.id, contact.isMainContact)}
                                >
                                  <svg fill={contact.isMainContact ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" style={{ color: contact.isMainContact ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                  </svg>
                                </button>
                                <button
                                  className="action-btn"
                                  title="Remove from operation"
                                  onClick={() => handleRemoveContact(rel.operationId, contact.id, contact.name)}
                                >
                                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
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

                                    <Link
                                      href="/billing-entities"
                                      style={{ flex: 1, fontWeight: 500, fontSize: '13px', textDecoration: 'none', color: 'inherit' }}
                                      className="hover-link"
                                    >
                                      {be.name}
                                    </Link>

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
                    </div>
                  )}

                  {isOpExpanded && rel.contacts.length === 0 && (
                    <div style={{ padding: '16px 16px 16px 40px', background: 'var(--bg-secondary)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span>No contacts linked to this operation</span>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', padding: '4px 12px' }}
                          onClick={() => setAddContactModal({ operationId: rel.operationId, operationName: rel.operationName })}
                        >
                          Add Contact
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add Contact Modal */}
      {addContactModal && (
        <div className="detail-panel-overlay" onClick={() => setAddContactModal(null)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="detail-panel-header">
              <h3>Add Contact to {addContactModal.operationName}</h3>
              <button className="close-btn" onClick={() => setAddContactModal(null)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Select Contact</label>
                  <select
                    value={newContactId}
                    onChange={(e) => setNewContactId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">Choose a contact...</option>
                    {getAvailableContacts(addContactModal.operationId).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.email && `(${c.email})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newContactIsMain}
                      onChange={(e) => setNewContactIsMain(e.target.checked)}
                    />
                    Set as Main Contact
                  </label>
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setAddContactModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddContact} disabled={!newContactId || saving}>
                {saving ? 'Adding...' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .hover-link:hover {
          text-decoration: underline;
          color: var(--accent-blue) !important;
        }
      `}</style>
    </>
  );
}
