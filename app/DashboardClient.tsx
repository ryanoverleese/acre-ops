'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface DashboardStats {
  installedCount: number;
  assignedCount: number;
  unassignedCount: number;
  totalAssignments: number;
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
  operationName: string;
  fields2025: number;
  fields2026: number;
  status: 'returning' | 'new' | 'still-to-go';
}

interface DashboardClientProps {
  stats: DashboardStats;
  openRepairs: DashboardRepair[];
  recentOrders: DashboardOrder[];
  installedProbes: DashboardInstalledProbe[];
  bookings: DashboardBooking[];
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

type BookingSortColumn = 'operation' | 'fields2025' | 'fields2026' | 'status';

export default function DashboardClient({ stats, openRepairs, recentOrders, installedProbes, bookings }: DashboardClientProps) {
  const [showInstalled, setShowInstalled] = useState(false);
  const [bookingSortCol, setBookingSortCol] = useState<BookingSortColumn>('status');
  const [bookingSortDir, setBookingSortDir] = useState<'asc' | 'desc'>('asc');
  const pct = stats.totalAssignments > 0
    ? Math.round((stats.installedCount / stats.totalAssignments) * 100)
    : 0;

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Dashboard</h2>
          <span className="season-badge">2026 Season</span>
        </div>
      </header>

      <div className="content">
        {/* Install Progress */}
        <div className="dashboard-section">
          <h3 className="section-label">Install Progress</h3>
          <div className="stats-grid stats-grid-3">
            <Link href="/install" className="unstyled-link">
              <div className="stat-card">
                <div className="stat-label">Ready to Install</div>
                <div className="stat-value amber">{stats.assignedCount}</div>
                <div className="stat-change">Assigned probes</div>
              </div>
            </Link>
            <div className="stat-card stat-card-clickable" onClick={() => setShowInstalled(!showInstalled)}>
              <div className="stat-label">Installed</div>
              <div className="stat-value green">{stats.installedCount}</div>
              <div className="stat-change">{showInstalled ? 'Click to hide' : 'Click to view'}</div>
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
          const returning = bookings.filter(b => b.status === 'returning').length;
          const stillToGo = bookings.filter(b => b.status === 'still-to-go').length;
          const newOps = bookings.filter(b => b.status === 'new').length;

          const statusOrder: Record<string, number> = { 'still-to-go': 0, 'new': 1, 'returning': 2 };
          const sorted = [...bookings].sort((a, b) => {
            let cmp = 0;
            switch (bookingSortCol) {
              case 'operation': cmp = a.operationName.localeCompare(b.operationName); break;
              case 'fields2025': cmp = a.fields2025 - b.fields2025; break;
              case 'fields2026': cmp = a.fields2026 - b.fields2026; break;
              case 'status': cmp = statusOrder[a.status] - statusOrder[b.status]; break;
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

          return (
            <div className="dashboard-section">
              <h3 className="section-label">2026 Booking Tracker</h3>
              <div className="stats-grid stats-grid-3">
                <div className="stat-card">
                  <div className="stat-label">Returning</div>
                  <div className="stat-value green">{returning}</div>
                  <div className="stat-change">Re-enrolled from 2025</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Still to Go</div>
                  <div className="stat-value amber">{stillToGo}</div>
                  <div className="stat-change">Had 2025, not yet 2026</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">New</div>
                  <div className="stat-value blue">{newOps}</div>
                  <div className="stat-change">First time in 2026</div>
                </div>
              </div>
              <div className="table-container">
                <table className="desktop-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleBookingSort('operation')}>Operation{sortArrow('operation')}</th>
                      <th className="sortable" onClick={() => handleBookingSort('fields2025')}>2025 Fields{sortArrow('fields2025')}</th>
                      <th className="sortable" onClick={() => handleBookingSort('fields2026')}>2026 Fields{sortArrow('fields2026')}</th>
                      <th className="sortable" onClick={() => handleBookingSort('status')}>Status{sortArrow('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((b) => (
                      <tr key={b.operationName} className={b.status === 'still-to-go' ? 'row-highlight' : undefined}>
                        <td>{b.operationName}</td>
                        <td><span className="text-secondary">{b.fields2025 || '—'}</span></td>
                        <td><span className="text-secondary">{b.fields2026 || '—'}</span></td>
                        <td>
                          <span className={`status-badge ${b.status}`}>
                            {b.status === 'returning' ? 'Returning' : b.status === 'still-to-go' ? 'Still to Go' : 'New'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
