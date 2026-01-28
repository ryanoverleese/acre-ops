'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

export interface DashboardStats {
  operationsCount: number;
  fieldsCount: number;
  probesCount: number;
  repairsCount: number;
  installedCount: number;
  assignedCount: number;
  unassignedCount: number;
}

export interface DashboardOperation {
  id: number;
  name: string;
  notes?: string;
}

interface DashboardClientProps {
  stats: DashboardStats;
  operations: DashboardOperation[];
}

export default function DashboardClient({ stats, operations: initialOperations }: DashboardClientProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [operations] = useState(initialOperations);

  const filteredOperations = useMemo(() => {
    if (!searchQuery.trim()) return operations;
    const query = searchQuery.toLowerCase();
    return operations.filter(
      (op) =>
        op.name.toLowerCase().includes(query) ||
        op.notes?.toLowerCase().includes(query)
    );
  }, [operations, searchQuery]);

  const handleExport = () => {
    // Generate CSV
    const headers = ['Operation', 'Notes'];
    const rows = operations.map((op) => [op.name, op.notes || '']);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `operations-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Dashboard</h2>
          <span className="season-badge">2026 Season</span>
        </div>
        <div className="header-right">
          <div className="search-box">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search operations, fields, probes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      <div className="content">
        {/* Install Status Section */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Install Status (2026)
          </h3>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Link href="/install" style={{ textDecoration: 'none' }}>
              <div className="stat-card" style={{ cursor: 'pointer' }}>
                <div className="stat-label">Ready to Install</div>
                <div className="stat-value amber">{stats.assignedCount}</div>
                <div className="stat-change">Assigned probes</div>
              </div>
            </Link>
            <div className="stat-card">
              <div className="stat-label">Installed</div>
              <div className="stat-value green">{stats.installedCount}</div>
              <div className="stat-change">Completed installs</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Unassigned</div>
              <div className="stat-value blue">{stats.unassignedCount}</div>
              <div className="stat-change">Need probe assignment</div>
            </div>
          </div>
        </div>

        {/* Overview Stats */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Overview
          </h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Operations</div>
              <div className="stat-value green">{stats.operationsCount}</div>
              <div className="stat-change">Active operations</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active Fields</div>
              <div className="stat-value blue">{stats.fieldsCount}</div>
              <div className="stat-change">Fields with probe data</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Probes</div>
              <div className="stat-value amber">{stats.probesCount}</div>
              <div className="stat-change">In inventory</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Needs Repair</div>
              <div className="stat-value red">{stats.repairsCount}</div>
              <div className="stat-change">Active repairs</div>
            </div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3 className="table-title">
              {searchQuery ? `Matching Operations (${filteredOperations.length})` : 'Operations Overview'}
            </h3>
            <div className="table-actions">
              <button className="btn btn-secondary" onClick={handleExport}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Export
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Operation</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOperations.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {searchQuery ? 'No matching operations found.' : 'No operations found. Add some in Baserow.'}
                  </td>
                </tr>
              ) : (
                filteredOperations.map((op) => (
                  <tr key={op.id}>
                    <td>
                      <div className="operation-name">{op.name}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {op.notes || '—'}
                      </span>
                    </td>
                    <td>
                      <Link href="/operations" className="action-btn">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
