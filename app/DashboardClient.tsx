'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export interface DashboardStats {
  installedCount: number;
  assignedCount: number;
  unassignedCount: number;
  totalAssignments: number;
  probesOnOrder: number;
  todayInstalledCount: number;
}

export interface DashboardRepair {
  id: number;
  fieldName: string;
  problem: string;
  reportedAt: string;
}

export interface DashboardOrder {
  id: number;
  customerName: string;
  orderDate: string;
  status: string;
  total: string;
}

export interface DashboardInstalledProbe {
  id: number;
  fieldName: string;
  probeSerial: string;
  installDate: string;
  installer: string;
}

export interface DashboardBooking {
  operationId: number;
  operationName: string;
  operationNotes: string;
  fieldsPrev: number;
  fieldsCurr: number;
  probesPrev: number;
  probesCurr: number;
  status: 'returning' | 'new' | 'still-to-go' | 'not-returning';
}

interface DashboardClientProps {
  stats: DashboardStats;
  openRepairs: DashboardRepair[];
  recentOrders: DashboardOrder[];
  installedProbes: DashboardInstalledProbe[];
}

function daysAgo(dateStr: string): number {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type BookingSortColumn = 'operation' | 'change' | 'fieldsCurr' | 'probesCurr' | 'probeChange' | 'status';

export default function DashboardClient({ stats, openRepairs, recentOrders, installedProbes }: DashboardClientProps) {
  const [showInstalled, setShowInstalled] = useState(false);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [remainingFields, setRemainingFields] = useState(0);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [previousYear, setPreviousYear] = useState(new Date().getFullYear() - 1);
  const [bookingSortCol, setBookingSortCol] = useState<BookingSortColumn>('status');
  const [bookingSortDir, setBookingSortDir] = useState<'asc' | 'desc'>('asc');
  const [dismissLoading, setDismissLoading] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch('/api/bookings')
      .then(res => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.bookings;
        const remaining = Array.isArray(data) ? 0 : data.remainingFields || 0;
        if (data.currentYear) setCurrentYear(data.currentYear);
        if (data.previousYear) setPreviousYear(data.previousYear);
        if (list?.length) setBookings(list);
        setRemainingFields(remaining);
      })
      .catch(() => {});
  }, []);

  const handleDismiss = async (booking: DashboardBooking) => {
    const tag = `[NOT_RETURNING_${currentYear}]`;
    const newNotes = booking.operationNotes ? `${booking.operationNotes} ${tag}` : tag;
    setDismissLoading(prev => ({ ...prev, [booking.operationId]: true }));
    try {
      const res = await fetch(`/api/operations/${booking.operationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes }),
      });
      if (res.ok) {
        setBookings(prev => prev.map(b =>
          b.operationId === booking.operationId
            ? { ...b, status: 'not-returning' as const, operationNotes: newNotes }
            : b
        ));
      }
    } catch { /* silent */ }
    setDismissLoading(prev => ({ ...prev, [booking.operationId]: false }));
  };

  const handleUndoDismiss = async (booking: DashboardBooking) => {
    const tag = `[NOT_RETURNING_${currentYear}]`;
    const newNotes = booking.operationNotes.replace(tag, '').replace(/\s{2,}/g, ' ').trim();
    setDismissLoading(prev => ({ ...prev, [booking.operationId]: true }));
    try {
      const res = await fetch(`/api/operations/${booking.operationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes }),
      });
      if (res.ok) {
        setBookings(prev => prev.map(b =>
          b.operationId === booking.operationId
            ? { ...b, status: 'still-to-go' as const, operationNotes: newNotes }
            : b
        ));
      }
    } catch { /* silent */ }
    setDismissLoading(prev => ({ ...prev, [booking.operationId]: false }));
  };

  const pct = stats.totalAssignments > 0
    ? Math.round((stats.installedCount / stats.totalAssignments) * 100)
    : 0;

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Dashboard</h2>
          <span className="season-badge">{currentYear} Season</span>
        </div>
      </header>

      <div className="content">
        {/* Install Progress */}
        <div className="dashboard-section">
          <h3 className="section-label">Install Progress</h3>
          <div className="stats-grid stats-grid-3">
            <Link href="/install" className="unstyled-link">
              <div className="stat-card">
                <div className="stat-label">Ready to Install *</div>
                <div className="stat-value amber">{stats.assignedCount}</div>
                <div className="stat-change">Not yet installed</div>
              </div>
            </Link>
            <div className="stat-card stat-card-clickable" onClick={() => setShowInstalled(!showInstalled)}>
              <div className="stat-label">Installed</div>
              <div className="stat-value green">{stats.installedCount}</div>
              <div className="stat-change">{showInstalled ? 'Click to hide' : 'Click to view'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">M&Ms Today</div>
              <div className="stat-value" style={{ color: '#e8303a' }}>{stats.todayInstalledCount}</div>
              <div className="stat-change">Probes installed today</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Unassigned</div>
              <div className="stat-value blue">{stats.unassignedCount}</div>
              <div className="stat-change">Need probe assignment</div>
            </div>
          </div>
          {stats.totalAssignments > 0 && (
            <div className="install-progress">
              <div className="install-progress-bar">
                <div className="install-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="install-progress-label">
                {stats.installedCount} of {stats.totalAssignments} installed ({pct}%)
              </div>
            </div>
          )}
          <div className="stat-footnote">* excludes CropX Complete DIY</div>
          {showInstalled && installedProbes.length > 0 && (
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">
                  Installed Probes
                  <span className="season-badge" style={{ marginLeft: 8 }}>{installedProbes.length}</span>
                </h3>
              </div>
              <table className="desktop-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Probe</th>
                    <th>Installer</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {installedProbes.map((probe) => (
                    <tr key={probe.id}>
                      <td>{probe.fieldName}</td>
                      <td><span className="text-secondary">{probe.probeSerial}</span></td>
                      <td><span className="text-secondary">{probe.installer || '—'}</span></td>
                      <td><span className="text-secondary">{formatDate(probe.installDate)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Booking Tracker */}
        {bookings.length > 0 && (() => {
          const stillToGo = bookings.filter(b => b.status === 'still-to-go').length;
          const notReturning = bookings.filter(b => b.status === 'not-returning').length;
          const newOps = bookings.filter(b => b.status === 'new').length;
          const activeOps = bookings.filter(b => b.status !== 'still-to-go' && b.status !== 'not-returning');
          const totalProbesAssigned = activeOps.reduce((sum, b) => sum + b.probesCurr, 0);
          const totalEnrolledFields = activeOps.reduce((sum, b) => sum + b.fieldsCurr, 0);

          const statusOrder: Record<string, number> = { 'still-to-go': 0, 'new': 1, 'returning': 2, 'not-returning': 3 };
          const sorted = [...bookings].sort((a, b) => {
            let cmp = 0;
            switch (bookingSortCol) {
              case 'operation': cmp = a.operationName.localeCompare(b.operationName); break;
              case 'change': cmp = (a.fieldsCurr - a.fieldsPrev) - (b.fieldsCurr - b.fieldsPrev); break;
              case 'fieldsCurr': cmp = a.fieldsCurr - b.fieldsCurr; break;
              case 'probesCurr': cmp = a.probesCurr - b.probesCurr; break;
              case 'probeChange': cmp = (a.probesCurr - a.probesPrev) - (b.probesCurr - b.probesPrev); break;
              case 'status': cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99); break;
            }
            return bookingSortDir === 'asc' ? cmp : -cmp;
          });

          const handleBookingSort = (col: BookingSortColumn) => {
            if (bookingSortCol === col) {
              setBookingSortDir(bookingSortDir === 'asc' ? 'desc' : 'asc');
            } else {
              setBookingSortCol(col);
              setBookingSortDir('asc');
            }
          };

          const sortArrow = (col: BookingSortColumn) =>
            bookingSortCol === col ? <span className="sort-indicator">{bookingSortDir === 'asc' ? ' ▲' : ' ▼'}</span> : null;

          const statusLabel = (status: string) => {
            if (status === 'returning') return 'Returning';
            if (status === 'still-to-go') return 'Still to Go';
            if (status === 'not-returning') return 'Not Returning';
            return 'New';
          };

          return (
            <div className="dashboard-section">
              <h3 className="section-label">{currentYear} Booking Tracker</h3>
              <div className="stats-grid stats-grid-6">
                <div className="stat-card">
                  <div className="stat-label">Enrolled Fields *</div>
                  <div className="stat-value">{totalEnrolledFields}</div>
                  <div className="stat-change">{currentYear} season</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">New Operations</div>
                  <div className="stat-value blue">{newOps}</div>
                  <div className="stat-change">First time in {currentYear}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Ops Still to Go</div>
                  <div className="stat-value amber">{stillToGo}</div>
                  <div className="stat-change">Had {previousYear}, not yet {currentYear}{notReturning > 0 ? ` (+${notReturning} dismissed)` : ''}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Probes Assigned *</div>
                  <div className="stat-value green">{totalProbesAssigned}</div>
                  <div className="stat-change">{currentYear} season</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Probes on Order</div>
                  <div className="stat-value">{stats.probesOnOrder > 0 ? <span className="blue">{stats.probesOnOrder}</span> : <span className="green">0</span>}</div>
                  <div className="stat-change">Awaiting delivery</div>
                </div>
              </div>
              <div className="stat-footnote">* excludes CropX Complete DIY</div>
              <div className="table-container">
                <table className="desktop-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleBookingSort('operation')}>Operation{sortArrow('operation')}</th>
                      <th className="sortable" onClick={() => handleBookingSort('fieldsCurr')}>Fields{sortArrow('fieldsCurr')}</th>
                      <th className="sortable" onClick={() => handleBookingSort('change')}>Change{sortArrow('change')}</th>
                      <th className="sortable" onClick={() => handleBookingSort('probesCurr')}>Probes{sortArrow('probesCurr')}</th>
                      <th className="sortable" onClick={() => handleBookingSort('probeChange')}>Change{sortArrow('probeChange')}</th>
                      <th className="sortable" onClick={() => handleBookingSort('status')}>Status{sortArrow('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((b) => (
                      <tr key={b.operationName} className={b.status === 'still-to-go' ? 'row-highlight' : b.status === 'not-returning' ? 'row-muted' : undefined}>
                        <td style={b.status === 'not-returning' ? { textDecoration: 'line-through', opacity: 0.5 } : undefined}>{b.operationName}</td>
                        <td>{b.fieldsCurr || '—'}</td>
                        <td>
                          {(() => {
                            const delta = b.fieldsCurr - b.fieldsPrev;
                            if (b.status === 'new') return <span className="status-badge in-stock">+{b.fieldsCurr}</span>;
                            if (b.status === 'still-to-go' || b.status === 'not-returning') return <span className="status-badge assigned">-{b.fieldsPrev}</span>;
                            if (delta > 0) return <span className="status-badge installed">+{delta}</span>;
                            if (delta < 0) return <span className="status-badge assigned">{delta}</span>;
                            return <span className="status-badge unassigned">=</span>;
                          })()}
                        </td>
                        <td>
                          {b.status !== 'still-to-go' && b.status !== 'not-returning' ? (
                            b.probesCurr >= b.fieldsCurr && b.fieldsCurr > 0
                              ? <span className="status-badge installed">{b.probesCurr}</span>
                              : <span className="status-badge assigned">{b.probesCurr}/{b.fieldsCurr}</span>
                          ) : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          {(() => {
                            if (b.status === 'still-to-go' || b.status === 'not-returning') return <span className="text-muted">—</span>;
                            if (b.status === 'new') return b.probesCurr > 0 ? <span className="status-badge in-stock">+{b.probesCurr}</span> : <span className="text-muted">—</span>;
                            const delta = b.probesCurr - b.probesPrev;
                            if (delta > 0) return <span className="status-badge installed">+{delta}</span>;
                            if (delta < 0) return <span className="status-badge assigned">{delta}</span>;
                            return <span className="status-badge unassigned">=</span>;
                          })()}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className={`status-badge ${b.status}`}>
                            {statusLabel(b.status)}
                          </span>
                          {b.status === 'still-to-go' && (
                            <button
                              onClick={() => handleDismiss(b)}
                              disabled={dismissLoading[b.operationId]}
                              title="Mark as not returning"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', marginLeft: '4px', color: 'var(--text-secondary)', fontSize: '12px', opacity: 0.6 }}
                            >
                              {dismissLoading[b.operationId] ? '...' : '✕'}
                            </button>
                          )}
                          {b.status === 'not-returning' && (
                            <button
                              onClick={() => handleUndoDismiss(b)}
                              disabled={dismissLoading[b.operationId]}
                              title="Undo — move back to Still to Go"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', marginLeft: '4px', color: 'var(--text-secondary)', fontSize: '11px', opacity: 0.6 }}
                            >
                              {dismissLoading[b.operationId] ? '...' : 'Undo'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mobile-cards">
                  {sorted.map((b) => (
                    <div key={b.operationName} className={`mobile-card${b.status === 'still-to-go' ? ' row-highlight' : b.status === 'not-returning' ? ' row-muted' : ''}`}>
                      <div className="mobile-card-header">
                        <strong style={b.status === 'not-returning' ? { textDecoration: 'line-through', opacity: 0.5 } : undefined}>{b.operationName}</strong>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span className={`status-badge ${b.status}`}>
                            {statusLabel(b.status)}
                          </span>
                          {b.status === 'still-to-go' && (
                            <button
                              onClick={() => handleDismiss(b)}
                              disabled={dismissLoading[b.operationId]}
                              title="Mark as not returning"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-secondary)', fontSize: '12px', opacity: 0.6 }}
                            >
                              {dismissLoading[b.operationId] ? '...' : '✕'}
                            </button>
                          )}
                          {b.status === 'not-returning' && (
                            <button
                              onClick={() => handleUndoDismiss(b)}
                              disabled={dismissLoading[b.operationId]}
                              title="Undo — move back to Still to Go"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-secondary)', fontSize: '11px', opacity: 0.6 }}
                            >
                              {dismissLoading[b.operationId] ? '...' : 'Undo'}
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="mobile-card-fields">
                        <span>{b.fieldsCurr || '—'} fields</span>
                        <span>{b.status !== 'still-to-go' && b.status !== 'not-returning' ? `${b.probesCurr} probes` : ''}</span>
                        <span>
                          {(() => {
                            const delta = b.fieldsCurr - b.fieldsPrev;
                            if (b.status === 'new') return <span className="status-badge in-stock">+{b.fieldsCurr}</span>;
                            if (b.status === 'still-to-go' || b.status === 'not-returning') return <span className="status-badge assigned">-{b.fieldsPrev}</span>;
                            if (delta > 0) return <span className="status-badge installed">+{delta}</span>;
                            if (delta < 0) return <span className="status-badge assigned">{delta}</span>;
                            return <span className="status-badge unassigned">=</span>;
                          })()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Open Repairs */}
        <div className="dashboard-section">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">
                Open Repairs
                {openRepairs.length > 0 && <span className="season-badge" style={{ marginLeft: 8 }}>{openRepairs.length}</span>}
              </h3>
              <div className="table-actions">
                <Link href="/repairs" className="btn btn-secondary">View All</Link>
              </div>
            </div>
            {openRepairs.length === 0 ? (
              <div className="empty-state">
                <p className="text-muted">No open repairs</p>
              </div>
            ) : (
              <table className="desktop-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Problem</th>
                    <th>Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {openRepairs.map((repair) => (
                    <tr key={repair.id}>
                      <td>{repair.fieldName}</td>
                      <td><span className="text-secondary">{repair.problem || '—'}</span></td>
                      <td>
                        <span className={`status-badge ${daysAgo(repair.reportedAt) > 7 ? 'repair' : 'pending'}`}>
                          {daysAgo(repair.reportedAt)}d
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="dashboard-section">
          <div className="table-container">
            <div className="table-header">
              <h3 className="table-title">Recent Orders</h3>
              <div className="table-actions">
                <Link href="/orders" className="btn btn-secondary">View All</Link>
              </div>
            </div>
            {recentOrders.length === 0 ? (
              <div className="empty-state">
                <p className="text-muted">No recent orders</p>
              </div>
            ) : (
              <table className="desktop-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.customerName}</td>
                      <td><span className="text-secondary">{formatDate(order.orderDate)}</span></td>
                      <td>
                        {order.status && (
                          <span className={`status-badge ${order.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {order.status}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{order.total ? `$${Number(order.total).toLocaleString()}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
