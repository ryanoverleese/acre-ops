'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import SearchableSelect from '@/components/SearchableSelect';
import type { ApprovalItem, EnrolledOperation } from './page';

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
  enrolledOperations: EnrolledOperation[];
}

export default function ApprovalsClient({
  items: initialItems,
  operationSummaries: initialSummaries,
  availableSeasons,
  enrolledOperations,
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

  // Field-info question selection
  const FIELD_INFO_QUESTIONS = [
    { key: 'crop', label: 'Crop' },
    { key: 'irrigation_type', label: 'Irrigation Type' },
    { key: 'row_direction', label: 'Row Direction' },
    { key: 'side_dress', label: 'Side Dress' },
    { key: 'water_source', label: 'Water Source' },
    { key: 'fuel_source', label: 'Fuel Source' },
    { key: 'hybrid_variety', label: 'Hybrid / Variety' },
    { key: 'planting_date', label: 'Planting Date' },
    { key: 'billing_entity', label: 'Billing Entity' },
  ] as const;
  const ALL_QUESTION_KEYS = FIELD_INFO_QUESTIONS.map(q => q.key);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set(ALL_QUESTION_KEYS));

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

  // Enrolled-only operations: have field_seasons for selected season but no probe items
  const enrolledOnlyOps = useMemo(() => {
    const opsWithProbes = new Set(groupedItems.map((g) => g.operationId));
    const seasonFilter = selectedSeason === 'all' ? null : selectedSeason;
    return enrolledOperations
      .filter((op) => {
        if (opsWithProbes.has(op.id)) return false;
        if (seasonFilter && !op.seasons.includes(seasonFilter)) return false;
        if (searchQuery.trim()) {
          if (!op.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        }
        if (selectedOperation !== 'all' && op.id !== selectedOperation) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrolledOperations, groupedItems, selectedSeason, searchQuery, selectedOperation]);

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
    let url = `${window.location.origin}/${path}/${approvalToken}/${year}`;
    // For field-info links, append selected questions (omit param if all selected)
    if (linkType === 'field-info' && selectedQuestions.size < ALL_QUESTION_KEYS.length) {
      url += `?q=${Array.from(selectedQuestions).join(',')}`;
    }
    return url;
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

  // Render the question selector chips (reused in both grouped and enrolled-only ops)
  const renderQuestionChips = () => (
    <div className="approvals-question-chips">
      {FIELD_INFO_QUESTIONS.map((q) => {
        const isSelected = selectedQuestions.has(q.key);
        return (
          <label
            key={q.key}
            className={`approvals-question-chip${isSelected ? ' selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {
                setSelectedQuestions(prev => {
                  const next = new Set(prev);
                  if (next.has(q.key)) {
                    if (next.size > 1) next.delete(q.key);
                  } else {
                    next.add(q.key);
                  }
                  return next;
                });
              }}
            />
            {q.label}
          </label>
        );
      })}
    </div>
  );

  // Render the link section panel (reused for both grouped and enrolled-only ops)
  const renderLinkSection = (operationId: number) => (
    <div
      className="approvals-link-section"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="approvals-link-description">
        {linkType === 'field-info'
          ? 'Share this link with your customer to fill in field details:'
          : 'Share this link with your customer to approve probe placements:'}
      </p>

      {/* Question selector for field-info links */}
      {linkType === 'field-info' && renderQuestionChips()}

      <div className="approvals-link-row">
        <input
          type="text"
          value={getApprovalUrl()}
          readOnly
          className="approvals-link-input"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          className="btn btn-primary approvals-link-copy-btn"
          onClick={handleCopyLink}
        >
          {linkCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="approvals-link-footer">
        <span className="approvals-link-generated">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Link generated
        </span>
        <button
          className="btn btn-secondary approvals-regenerate-btn"
          onClick={() => handleGenerateApprovalLink(operationId, linkType, true)}
          disabled={approvalLoading}
        >
          Regenerate
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div
          className={`stat-card approvals-stat-card${statusFilter === 'all' ? ' active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          <div className="stat-label">Total</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div
          className={`stat-card approvals-stat-card${statusFilter === 'pending' ? ' active' : ''}`}
          onClick={() => setStatusFilter('pending')}
        >
          <div className="stat-label">Pending</div>
          <div className={`stat-value${stats.pending > 0 ? ' approvals-stat-value-warning' : ''}`}>
            {stats.pending}
          </div>
        </div>
        <div
          className={`stat-card approvals-stat-card${statusFilter === 'approved' ? ' active' : ''}`}
          onClick={() => setStatusFilter('approved')}
        >
          <div className="stat-label">Approved</div>
          <div className="stat-value green">{stats.approved}</div>
        </div>
        <div
          className={`stat-card approvals-stat-card${statusFilter === 'rejected' ? ' active' : ''}`}
          onClick={() => setStatusFilter('rejected')}
        >
          <div className="stat-label">Change Requested</div>
          <div className="stat-value red">{stats.rejected}</div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Approval Queue</h3>
          <div className="table-actions approvals-toolbar">
            <select
              className="approvals-filter-select"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            >
              <option value="all">All Seasons</option>
              {availableSeasons.map((season) => (
                <option key={season} value={season}>{season}</option>
              ))}
            </select>

            <SearchableSelect
              className="approvals-filter-select-op"
              value={typeof selectedOperation === 'number' ? String(selectedOperation) : 'all'}
              onChange={(v) => setSelectedOperation(v === 'all' ? 'all' : parseInt(v))}
              options={[
                { value: 'all', label: 'All Operations' },
                ...operationSummaries.map((op) => ({
                  value: String(op.id),
                  label: `${op.name} (${op.pendingCount} pending)`,
                })),
                ...enrolledOperations
                  .filter((eo) => !operationSummaries.some((os) => os.id === eo.id))
                  .map((op) => ({
                    value: String(op.id),
                    label: `${op.name} (enrolled)`,
                  })),
              ]}
              placeholder="All Operations"
            />

            <div className="search-box approvals-search">
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

        <div className="approvals-content">
          {groupedItems.length === 0 && enrolledOnlyOps.length === 0 ? (
            <div className="approvals-empty">
              {statusFilter === 'pending' ? 'No pending approvals.' : 'No items match your filters.'}
            </div>
          ) : (
            [...groupedItems.map((group) => {
              const isExpanded = expandedOperations.has(group.operationId);
              const groupPendingCount = group.items.filter((i) => i.approvalStatus === 'Pending').length;

              return (
                <div key={group.operationId} className="approvals-op-group">
                  {/* Operation Header */}
                  <div
                    className="approvals-op-header"
                    onClick={() => toggleOperation(group.operationId)}
                  >
                    <svg
                      className={`approvals-op-toggle${isExpanded ? ' expanded' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>

                    <svg className="approvals-op-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>

                    <Link
                      className="approvals-op-name"
                      href="/operations"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {group.operationName}
                    </Link>

                    <span className="approvals-op-count">
                      {group.items.length} probe{group.items.length !== 1 ? 's' : ''}
                    </span>

                    {groupPendingCount > 0 && (
                      <span className="status-badge pending approvals-op-pending">
                        {groupPendingCount} pending
                      </span>
                    )}

                    <div className="approvals-op-actions">
                      <button
                        className="approvals-link-btn"
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
                        title="Generate customer approval link"
                      >
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Approval Link
                      </button>
                      <button
                        className="approvals-link-btn"
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
                  {linkOperationId === group.operationId && approvalToken && renderLinkSection(group.operationId)}

                  {/* Items - Desktop Table */}
                  {isExpanded && (
                    <div className="approvals-items-wrap">
                      <table className="approvals-items-table">
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Serial</th>
                            <th>Crop</th>
                            <th>Status</th>
                            <th>Notes</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.id}>
                              <td className="approvals-field-name">
                                {item.fieldName} - Probe {item.probeNumber}{item.label ? ` — ${item.label}` : ''}
                              </td>
                              <td className="approvals-serial">
                                {item.probeSerial || '\u2014'}
                              </td>
                              <td>
                                {item.crop}
                              </td>
                              <td>
                                <span className={`status-badge ${
                                  item.approvalStatus === 'Approved' ? 'installed' :
                                  item.approvalStatus === 'Pending' ? 'pending' : 'needs-probe'
                                }`}>
                                  {item.approvalStatus}
                                </span>
                              </td>
                              <td className="approvals-notes">
                                {item.approvalNotes || '\u2014'}
                              </td>
                              <td className="approvals-actions-cell">
                                {item.approvalStatus === 'Pending' && (
                                  <div className="approvals-action-group">
                                    <button
                                      className="action-btn approvals-action-approve"
                                      title="Approve"
                                      onClick={() => handleApprove(item.id)}
                                      disabled={loading[item.id]}
                                    >
                                      {loading[item.id] ? (
                                        <span className="approvals-action-loading">...</span>
                                      ) : (
                                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </button>
                                    <button
                                      className="action-btn approvals-action-reject"
                                      title="Request Change"
                                      onClick={() => handleReject(item.id)}
                                      disabled={loading[item.id]}
                                    >
                                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                )}
                                {item.approvalStatus === 'Approved' && (
                                  <span className="approvals-approved-date">
                                    {item.approvalDate}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Items - Mobile Cards */}
                      <div className="approvals-mobile-cards">
                        {group.items.map((item) => (
                          <div key={item.id} className="approvals-mobile-card">
                            <div className="approvals-mobile-card-header">
                              <div className="approvals-mobile-card-title">
                                {item.fieldName} - Probe {item.probeNumber}{item.label ? ` — ${item.label}` : ''}
                              </div>
                              <span className={`status-badge ${
                                item.approvalStatus === 'Approved' ? 'installed' :
                                item.approvalStatus === 'Pending' ? 'pending' : 'needs-probe'
                              }`}>
                                {item.approvalStatus}
                              </span>
                            </div>
                            <div className="approvals-mobile-card-body">
                              <div className="approvals-mobile-card-row">
                                <span className="approvals-mobile-card-label">Serial</span>
                                <span>{item.probeSerial || '\u2014'}</span>
                              </div>
                              <div className="approvals-mobile-card-row">
                                <span className="approvals-mobile-card-label">Crop</span>
                                <span>{item.crop}</span>
                              </div>
                              <div className="approvals-mobile-card-row">
                                <span className="approvals-mobile-card-label">Operation</span>
                                <span>{group.operationName}</span>
                              </div>
                              {item.approvalNotes && (
                                <div className="approvals-mobile-card-row">
                                  <span className="approvals-mobile-card-label">Notes</span>
                                  <span>{item.approvalNotes}</span>
                                </div>
                              )}
                              {item.approvalStatus === 'Approved' && item.approvalDate && (
                                <div className="approvals-mobile-card-row">
                                  <span className="approvals-mobile-card-label">Approved</span>
                                  <span className="approvals-approved-date">{item.approvalDate}</span>
                                </div>
                              )}
                            </div>
                            {item.approvalStatus === 'Pending' && (
                              <div className="approvals-mobile-card-actions">
                                <button
                                  className="btn btn-primary"
                                  onClick={() => handleApprove(item.id)}
                                  disabled={loading[item.id]}
                                >
                                  {loading[item.id] ? 'Approving...' : 'Approve'}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => handleReject(item.id)}
                                  disabled={loading[item.id]}
                                >
                                  Request Change
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }),
            ...enrolledOnlyOps.map((op) => (
              <div key={`enrolled-${op.id}`} className="approvals-op-group">
                <div className="approvals-op-header">
                  <svg className="approvals-op-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>

                  <Link
                    className="approvals-op-name"
                    href="/operations"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {op.name}
                  </Link>

                  <span className="approvals-op-count">
                    {op.fieldCount} field{op.fieldCount !== 1 ? 's' : ''} enrolled
                  </span>

                  <span className="status-badge pending approvals-op-pending">
                    No probes
                  </span>

                  <div className="approvals-op-actions">
                    <button
                      className="approvals-link-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (linkOperationId === op.id && approvalToken && linkType === 'field-info') {
                          setLinkOperationId(null);
                          setApprovalToken(null);
                        } else {
                          handleGenerateApprovalLink(op.id, 'field-info');
                        }
                      }}
                      disabled={approvalLoading && linkOperationId === op.id}
                      title="Generate field info link for customer"
                    >
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Field Info Link
                    </button>
                  </div>
                </div>

                {/* Field Info Link */}
                {linkOperationId === op.id && approvalToken && renderLinkSection(op.id)}
              </div>
            ))]
          )}
        </div>
      </div>
    </>
  );
}
