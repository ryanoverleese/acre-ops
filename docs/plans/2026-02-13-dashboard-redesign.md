# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dashboard's static count cards and operations table with three actionable sections: install progress with progress bar, open repairs table, and recent orders table.

**Architecture:** Server component (`app/page.tsx`) fetches all data from Baserow, computes stats/filters/sorts, and passes serialized props to a stateless client component (`app/DashboardClient.tsx`). Client renders three sections using the app's standard `table-container`/`table-header` patterns.

**Tech Stack:** Next.js 16 (App Router), Baserow REST API, CSS custom properties

---

### Task 1: Update server data fetching (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`

**Step 1: Update imports and data fetching**

Add `getOrders` and `getBillingEntities` to the import from `@/lib/baserow`. Update the `Promise.all` to fetch orders and billing entities alongside existing data.

```tsx
import { getOperations, getFields, getProbes, getRepairs, getFieldSeasons, getProbeAssignments, getOrders, getBillingEntities } from '@/lib/baserow';
```

```tsx
const [operations, fields, probes, repairs, fieldSeasons, probeAssignments, orders, billingEntities] = await Promise.all([
  getOperations(),
  getFields(),
  getProbes(),
  getRepairs(),
  getFieldSeasons(),
  getProbeAssignments(),
  getOrders(),
  getBillingEntities(),
]);
```

**Step 2: Compute totalAssignments**

After the existing install stats logic, add:

```tsx
const totalAssignments = installedCount + assignedCount + unassignedCount;
```

**Step 3: Build open repairs list**

Resolve field names by chaining: repair → field_season → field name (the `field_season` link on repairs has a `value` that is the field_season display name, and the `field` link on field_seasons has a `value` that is the field name).

```tsx
// Build field_season id → field name map
const fsFieldNameMap = new Map<number, string>();
fieldSeasons.forEach((fs) => {
  const fieldName = fs.field?.[0]?.value || 'Unknown Field';
  fsFieldNameMap.set(fs.id, fieldName);
});

// Open repairs with resolved field names
const openRepairs = repairs
  .filter((r) => !r.repaired_at)
  .map((r) => {
    const fsId = r.field_season?.[0]?.id;
    return {
      id: r.id,
      fieldName: (fsId && fsFieldNameMap.get(fsId)) || r.field_season?.[0]?.value || 'Unknown',
      problem: r.problem || '',
      reportedAt: r.reported_at || '',
    };
  })
  .sort((a, b) => (a.reportedAt || '').localeCompare(b.reportedAt || ''));
```

**Step 4: Build recent orders list**

Resolve billing entity names from the billing_entity link field.

```tsx
const billingEntityMap = new Map(billingEntities.map((be) => [be.id, be.name || '']));

const recentOrders = orders
  .filter((o) => o.order_date)
  .sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''))
  .slice(0, 5)
  .map((o) => ({
    id: o.id,
    customerName: o.billing_entity?.[0]?.value || billingEntityMap.get(o.billing_entity?.[0]?.id || 0) || 'Unknown',
    orderDate: o.order_date || '',
    status: o.status?.value || '',
    total: o.total || '',
  }));
```

**Step 5: Update DashboardStats interface and return value**

Remove `operationsCount`, `fieldsCount`, `probesCount`, `repairsCount` from stats. Add `totalAssignments`. Remove `DashboardOperation`. Update the return and error fallback.

```tsx
const stats: DashboardStats = {
  installedCount,
  assignedCount,
  unassignedCount,
  totalAssignments,
};

return { stats, openRepairs, recentOrders };
```

Error fallback:
```tsx
return {
  stats: { installedCount: 0, assignedCount: 0, unassignedCount: 0, totalAssignments: 0 },
  openRepairs: [],
  recentOrders: [],
};
```

**Step 6: Update component render**

```tsx
export default async function Dashboard() {
  const { stats, openRepairs, recentOrders } = await getDashboardData();
  return <DashboardClient stats={stats} openRepairs={openRepairs} recentOrders={recentOrders} />;
}
```

**Step 7: Verify build**

Run: `npm run build`
Expected: Compile error in DashboardClient.tsx (expected — we haven't updated it yet)

---

### Task 2: Rewrite client component (`app/DashboardClient.tsx`)

**Files:**
- Modify: `app/DashboardClient.tsx`

**Step 1: Replace entire DashboardClient.tsx**

Replace the file contents with the new stateless component. Key changes:
- Remove: `useState`, `useMemo`, search state, operations state, `handleExport`, operations table, overview stat cards
- Add: open repairs table, recent orders table, progress bar
- Keep: install status stat cards (assigned/installed/unassigned)

```tsx
'use client';

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

interface DashboardClientProps {
  stats: DashboardStats;
  openRepairs: DashboardRepair[];
  recentOrders: DashboardOrder[];
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

export default function DashboardClient({ stats, openRepairs, recentOrders }: DashboardClientProps) {
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
        </div>

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
```

**Step 2: Verify build**

Run: `npm run build`
Expected: PASS — both page.tsx and DashboardClient.tsx should compile cleanly

---

### Task 3: Add progress bar CSS (`app/globals.css`)

**Files:**
- Modify: `app/globals.css`

**Step 1: Add progress bar styles**

Add after the existing `.dashboard-section` rule (around line 1565):

```css
.install-progress {
  margin-top: -8px;
  margin-bottom: 8px;
}

.install-progress-bar {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.install-progress-fill {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.install-progress-label {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 8px;
}
```

**Step 2: Final build verification**

Run: `npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add app/page.tsx app/DashboardClient.tsx app/globals.css docs/plans/2026-02-13-dashboard-redesign.md
git commit -m "feat: redesign dashboard with install progress, open repairs, and recent orders"
```
