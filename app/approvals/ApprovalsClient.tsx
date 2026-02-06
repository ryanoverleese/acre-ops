'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ApprovalItem } from './page';

interface OperationSummary {
  id: number;
  name: string;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  total: number;
}

interface ApprovalsClientProps {
  items: ApprovalItem[];
  operationSummaries: OperationSummary[];
  availableSeasons: number[];
}

export default function ApprovalsClient({
  items: initialItems,
  operationSummaries: initialSummaries,
  availableSeasons,
}: ApprovalsClientProps) {
  const [items, setItems] = useState(initialItems);
  const [operationSummaries, setOperationSummaries] = useState(initialSummaries);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>(
    availableSeasons[0] || new Date().getFullYear()
  );
  const [selectedOperation, setSelectedOperation] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [expandedOperations, setExpandedOperations] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  // Approval link state (per operation)
  const [linkOperationId, setLinkOperationId] = useState<number | null>(null);
  const [linkType, setLinkType] = useState<'approval' | 'field-info'>('approval');
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Season filter
      if (selectedSeason !== 'all' && item.season !== selectedSeason) return false;

      // Operation filter
      if (selectedOperation !== 'all' && item.operationId !== selectedOperation) return false;

      // Status filter
      if (statusFilter === 'pending' && item.approvalStatus !== 'Pending') return false;
      if (statusFilter === 'approved' && item.approvalStatus !== 'Approved') return false;
      if (statusFilter === 'rejected' && !['Change Requested', 'Rejected'].includes(item.approvalStatus)) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (
          !item.fieldName.toLowerCase().includes(query) &&
          !item.operationName.toLowerCase().includes(query) &&
          !(item.probeSerial?.toLowerCase().includes(query))
        ) {
          return false;
        }
      }

      return true;
    });
  }, [items, selectedSeason, selectedOperation, statusFilter, searchQuery]);

  // Group by operation
  const groupedItems = useMemo(() => {
    const groups: Record<number, { operation: string; items: ApprovalItem[] }> = {};
    filteredItems.forEach((item) => {
      if (!groups[item.operationId]) {
        groups[item.operationId] = { operation: item.operationName, items: [] };
      }
      groups[item.operationId].items.push(item);
    });
    return Object.entries(groups)
      .map(([opId, data]) => ({
        operationId: parseInt(opId),
        operationName: data.operation,
        items: data.items.sort((a, b) => a.fieldName.localeCompare(b.fieldName) || a.probeNumber - b.probeNumber),
      }))
      .sort((a, b) => a.operationName.localeCompare(b.operationName));
  }, [filteredItems]);

  // Stats
  const stats = useMemo(() => {
    const seasonItems = selectedSeason === 'all'
      ? items
      : items.filter((item) => item.season === selectedSeason);
    return {
      total: seasonItems.length,
      pending: seasonItems.filter((item) => item.approvalStatus === 'Pending').length,
      approved: seasonItems.filter((item) => item.approvalStatus === 'Approved').length,
      rejected: seasonItems.filter((item) => ['Change Requested', 'Rejected'].includes(item.approvalStatus)).length,
    };
  }, [items, selectedSeason]);

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

  const expandAll = () => {
    setExpandedOperations(new Set(groupedItems.map((g) => g.operationId)));
  };

  const collapseAll = () => {
    setExpandedOperations(new Set());
  };

  // Approve single item
  const handleApprove = async (itemId: number) => {
    setLoading((prev) => ({ ...prev, [itemId]: true }));
    try {
      const response = await fetch(`/api/probe-assignments/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_status: 'Approved',
          approval_date: new Date().toISOString().split('T')[0],
        }),
      });

      if (response.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, approvalStatus: 'Approved', approvalDate: new Date().toISOString().split('T')[0] }
              : item
          )
        );
        updateOperationSummary(itemId, 'approve');
      } else {
        alert('Failed to approve');
      }
    } catch {
      alert('Failed to approve');
    } finally {
      setLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  // Reject single item
  const handleReject = async (itemId: number) => {
    const notes = prompt('Enter rejection reason:');
    if (notes === null) return;

    setLoading((prev) => ({ ...prev, [itemId]: true }));
    try {
      const response = await fetch(`/api/probe-assignments/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_status: 'Change Requested',
          approval_notes: notes,
        }),
      });

      if (response.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, approvalStatus: 'Change Requested', approvalNotes: notes }
              : item
          )
        );
        updateOperationSummary(itemId, 'reject');
      } else {
        alert('Failed to reject');
      }
    } catch {
      alert('Failed to reject');
    } finally {
      setLoading((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  // Update operation summary after approval/rejection
  const updateOperationSummary = (itemId: number, action: 'approve' | 'reject') => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    setOperationSummaries((prev) =>
      prev.map((summary) => {
        if (summary.id === item.operationId) {
          return {
            ...summary,
            pendingCount: summary.pendingCount - 1,
            approvedCount: action === 'approve' ? summary.approvedCount + 1 : summary.approvedCount,
            rejectedCount: action === 'reject' ? summary.rejectedCount + 1 : summary.rejectedCount,
          };
        }
        return summary;
      })
    );
  };

  // Bulk approve all pending in current filter
  const handleBulkApprove = async () => {
    const pendingItems = filteredItems.filter((item) => item.approvalStatus === 'Pending');
    if (pendingItems.length === 0) {
      alert('No pending items to approve');
      return;
    }

    if (!confirm(`Approve all ${pendingItems.length} pending probe locations?`)) return;

    setBulkLoading(true);
    try {
      const approvalDate = new Date().toISOString().split('T')[0];
      await Promise.all(
        pendingItems.map((item) =>
          fetch(`/api/probe-assignments/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              approval_status: 'Approved',
              approval_date: approvalDate,
            }),
          })
        )
      );

      const approvedIds = new Set(pendingItems.map((i) => i.id));
      setItems((prev) =>
        prev.map((item) =>
          approvedIds.has(item.id)
            ? { ...item, approvalStatus: 'Approved', approvalDate }
            : item
        )
      );

      // Update all affected operation summaries
      const affectedOps = new Set(pendingItems.map((i) => i.operationId));
      setOperationSummaries((prev) =>
        prev.map((summary) => {
          if (affectedOps.has(summary.id)) {
            const count = pendingItems.filter((i) => i.operationId === summary.id).length;
            return {
              ...summary,
              pendingCount: summary.pendingCount - count,
              approvedCount: summary.approvedCount + count,
            };
          }
          return summary;
        })
      );
    } catch {
      alert('Some approvals may have failed. Please refresh the page.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleGenerateApprovalLink = async (operationId: number, type: 'approval' | 'field-info' = 'approval', regenerate: boolean = false) => {
    setApprovalLoading(true);
    setLinkOperationId(operationId);
    setLinkType(type);
    setLinkCopied(false);
    try {
      const response = await fetch(`/api/operations/${operationId}/approval-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate }),
      });
      if (response.ok) {
        const data = await response.json();
        setApprovalToken(data.token);
      } else {
        alert('Failed to generate approval link');
        setLinkOperationId(null);
      }
    } catch {
      alert('Failed to generate approval link');
      setLinkOperationId(null);
    } finally {
      setApprovalLoading(false);
    }
  };

  const getApprovalUrl = () => {
    if (!approvalToken) return '';
    const year = selectedSeason !== 'all' ? selectedSeason : new Date().getFullYear();
    const path = linkType === 'field-info' ? 'field-info' : 'approve';
    return `${window.location.origin}/${path}/${approvalToken}/${year}`;
  };

  const handleCopyLink = async () => {
    const url = getApprovalUrl();
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div
          className="stat-card"
          style={{ cursor: 'pointer', background: statusFilter === 'all' ? 'var(--bg-tertiary)' : undefined }}
          onClick={() => setStatusFilter('all')}
        >
          <div className="stat-label">Total</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer', background: statusFilter === 'pending' ? 'var(--bg-tertiary)' : undefined }}
          onClick={() => setStatusFilter('pending')}
        >
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: stats.pending > 0 ? 'var(--status-yellow)' : undefined }}>
            {stats.pending}
          </div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer', background: statusFilter === 'approved' ? 'var(--bg-tertiary)' : undefined }}
          onClick={() => setStatusFilter('approved')}
        >
          <div className="stat-label">Approved</div>
          <div className="stat-value green">{stats.approved}</div>
        </div>
        <div
          className="stat-card"
          style={{ cursor: 'pointer', background: statusFilter === 'rejected' ? 'var(--bg-tertiary)' : undefined }}
          onClick={() => setStatusFilter('rejected')}
        >
          <div className="stat-label">Change Requested</div>
          <div className="stat-value red">{stats.rejected}</div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Approval Queue</h3>
          <div className="table-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              style={{ padding: '6px 10px', fontSize: '13px' }}
            >
              <option value="all">All Seasons</option>
              {availableSeasons.map((season) => (
                <option key={season} value={season}>{season}</option>
              ))}
            </select>

            <select
              value={selectedOperation}
              onChange={(e) => setSelectedOperation(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              style={{ padding: '6px 10px', fontSize: '13px', maxWidth: '200px' }}
            >
              <option value="all">All Operations</option>
              {operationSummaries.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.name} ({op.pendingCount} pending)
                </option>
              ))}
            </select>

            <div className="search-box" style={{ width: '180px' }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <button className="btn btn-secondary" onClick={expandAll}>Expand All</button>
            <button className="btn btn-secondary" onClick={collapseAll}>Collapse All</button>

            {statusFilter === 'pending' && stats.pending > 0 && (
              <button
                className="btn btn-primary"
                onClick={handleBulkApprove}
                disabled={bulkLoading}
              >
                {bulkLoading ? 'Approving...' : `Approve All (${filteredItems.filter((i) => i.approvalStatus === 'Pending').length})`}
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {groupedItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
              {statusFilter === 'pending' ? 'No pending approvals.' : 'No items match your filters.'}
            </div>
          ) : (
            groupedItems.map((group) => {
              const isExpanded = expandedOperations.has(group.operationId);
              const groupPendingCount = group.items.filter((i) => i.approvalStatus === 'Pending').length;

              return (
                <div
                  key={group.operationId}
                  style={{
                    marginBottom: '12px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Operation Header */}
                  <div
                    onClick={() => toggleOperation(group.operationId)}
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
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        flexShrink: 0,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>

                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20" style={{ color: 'var(--accent-green)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>

                    <Link
                      href="/operations"
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontWeight: 600, fontSize: '15px', textDecoration: 'none', color: 'inherit' }}
                    >
                      {group.operationName}
                    </Link>

                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {group.items.length} probe{group.items.length !== 1 ? 's' : ''}
                    </span>

                    {groupPendingCount > 0 && (
                      <span className="status-badge pending" style={{ fontSize: '11px', padding: '2px 8px' }}>
                        {groupPendingCount} pending
                      </span>
                    )}

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (linkOperationId === group.operationId && approvalToken && linkType === 'approval') {
                            setLinkOperationId(null);
                            setApprovalToken(null);
                          } else {
                            handleGenerateApprovalLink(group.operationId, 'approval');
                          }
                        }}
                        disabled={approvalLoading && linkOperationId === group.operationId}
                        style={{
                          background: 'none',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          padding: '4px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="Generate customer approval link"
                      >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Approval Link
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (linkOperationId === group.operationId && approvalToken && linkType === 'field-info') {
                            setLinkOperationId(null);
                            setApprovalToken(null);
                          } else {
                            handleGenerateApprovalLink(group.operationId, 'field-info');
                          }
                        }}
                        disabled={approvalLoading && linkOperationId === group.operationId}
                        style={{
                          background: 'none',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          padding: '4px 10px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="Generate field info link for customer"
                      >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Field Info Link
                      </button>
                    </div>
                  </div>

                  {/* Approval Link */}
                  {linkOperationId === group.operationId && approvalToken && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--bg-card)',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                        {linkType === 'field-info'
                          ? 'Share this link with your customer to fill in field details:'
                          : 'Share this link with your customer to approve probe placements:'}
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={getApprovalUrl()}
                          readOnly
                          style={{ flex: 1, fontSize: '12px', fontFamily: 'monospace', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)' }}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={handleCopyLink}
                          style={{ flexShrink: 0, fontSize: '12px', padding: '6px 12px' }}
                        >
                          {linkCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--accent-green)' }}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Link generated
                        </span>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleGenerateApprovalLink(group.operationId, linkType, true)}
                          disabled={approvalLoading}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Items */}
                  {isExpanded && (
                    <div style={{ background: 'var(--bg-secondary)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-card)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>Field</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>Serial</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>Crop</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>Status</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600 }}>Notes</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 600 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 500 }}>
                                {item.fieldName} - Probe {item.probeNumber}
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                {item.probeSerial || '—'}
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '13px' }}>
                                {item.crop}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <span className={`status-badge ${
                                  item.approvalStatus === 'Approved' ? 'installed' :
                                  item.approvalStatus === 'Pending' ? 'pending' : 'needs-probe'
                                }`}>
                                  {item.approvalStatus}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)', maxWidth: '200px' }}>
                                {item.approvalNotes || '—'}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {item.approvalStatus === 'Pending' && (
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                    <button
                                      className="action-btn"
                                      title="Approve"
                                      onClick={() => handleApprove(item.id)}
                                      disabled={loading[item.id]}
                                      style={{ color: 'var(--accent-green)' }}
                                    >
                                      {loading[item.id] ? (
                                        <span style={{ fontSize: '12px' }}>...</span>
                                      ) : (
                                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </button>
                                    <button
                                      className="action-btn"
                                      title="Request Change"
                                      onClick={() => handleReject(item.id)}
                                      disabled={loading[item.id]}
                                      style={{ color: 'var(--status-red)' }}
                                    >
                                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                )}
                                {item.approvalStatus === 'Approved' && (
                                  <span style={{ fontSize: '12px', color: 'var(--accent-green)' }}>
                                    {item.approvalDate}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
