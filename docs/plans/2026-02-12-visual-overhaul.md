# Visual Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Acre Insights from a generic admin panel into a modern, professional agricultural operations platform.

**Architecture:** Pure CSS + component refactoring. No functional/logic changes. All styling changes flow from `globals.css` variables. Inline styles get extracted to CSS classes. Dark sidebar is achieved via CSS scoping on `.sidebar`.

**Tech Stack:** CSS custom properties, Google Fonts (General Sans + Source Sans 3), Next.js/React components (JSX class migration)

---

### Task 1: CSS Foundation — Colors, Typography, Variables

**Files:**
- Modify: `app/globals.css:1-68` (font import, :root variables, body styles)

**Step 1: Replace font import and update :root variables**

Replace the Google Fonts import line with:
```css
@import url('https://fonts.googleapis.com/css2?family=General+Sans:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap');
```

Replace the full `:root` block with updated colors, radii, shadows, and new sidebar variables:
```css
:root {
  --bg-primary: #f7f5f2;
  --bg-secondary: #edeae5;
  --bg-tertiary: #e4e0d9;
  --bg-card: #ffffff;
  --bg-hover: #f0ede8;
  --bg-elevated: #ffffff;

  --text-primary: #1a1815;
  --text-secondary: #57534e;
  --text-muted: #78716c;

  --accent-primary: #4a7a5b;
  --accent-primary-dim: rgba(74, 122, 91, 0.12);
  --accent-primary-hover: #3d6a4e;
  --accent-blue: #0284c7;
  --accent-blue-dim: rgba(2, 132, 199, 0.1);
  --accent-amber: #d97706;
  --accent-amber-dim: rgba(217, 119, 6, 0.1);
  --accent-red: #dc2626;
  --accent-red-dim: rgba(220, 38, 38, 0.1);

  --border: #e7e5e4;
  --border-strong: #d6d3d1;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 16px;

  --shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Sidebar (dark) */
  --sidebar-bg: #1a1f1c;
  --sidebar-bg-hover: rgba(255,255,255,0.06);
  --sidebar-bg-active: rgba(74, 122, 91, 0.2);
  --sidebar-text: rgba(255,255,255,0.7);
  --sidebar-text-hover: rgba(255,255,255,0.95);
  --sidebar-text-muted: rgba(255,255,255,0.35);
  --sidebar-border: rgba(255,255,255,0.08);

  /* Notification unread (was hardcoded) */
  --notification-unread-bg: rgba(74, 122, 91, 0.06);
  --notification-unread-hover: rgba(74, 122, 91, 0.1);
}
```

**Step 2: Update body styles**

```css
body {
  font-family: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  font-size: 14px;
  line-height: 1.55;
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

**Step 3: Find-and-replace `--accent-green` → `--accent-primary` throughout globals.css**

Every occurrence of `--accent-green` becomes `--accent-primary`. Every `--accent-green-dim` becomes `--accent-primary-dim`. Every `--accent-green-hover` becomes `--accent-primary-hover`.

Also fix these hardcoded hover colors:
- `.btn-primary:hover` — change `#4a7a4a` to `var(--accent-primary-hover)`
- `.btn-danger:hover` — change `#a04540` to `#b91c1c`
- `.popup-btn:hover` — change `#2fc58c` to `var(--accent-primary-hover)`

**Step 4: Find-and-replace `--accent-green` → `--accent-primary` in ALL component .tsx files**

Search all `.tsx` files for `accent-green` and replace with `accent-primary`.

**Step 5: Commit**
```
git add -A && git commit -m "feat: update color system, typography, and CSS variables"
```

---

### Task 2: Dark Sidebar CSS

**Files:**
- Modify: `app/globals.css` (sidebar section, ~line 76-191)

**Step 1: Replace sidebar CSS block**

Replace the `.sidebar`, `.logo`, `.nav-section`, `.nav-item`, and related selectors with dark-themed versions:

```css
.sidebar {
  width: 240px;
  background: var(--sidebar-bg);
  border-right: none;
  padding: var(--space-5) 0;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  z-index: 60;
}

.logo {
  padding: 0 var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--sidebar-border);
  margin-bottom: var(--space-4);
}

.logo h1 {
  font-family: 'General Sans', sans-serif;
  font-size: 17px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.02em;
}

.logo span {
  font-size: 11px;
  color: var(--sidebar-text-muted);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.nav-section-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--sidebar-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 var(--space-2);
  margin-bottom: var(--space-2);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--sidebar-text);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}

.nav-item:hover {
  background: var(--sidebar-bg-hover);
  color: var(--sidebar-text-hover);
}

.nav-item.active {
  background: var(--sidebar-bg-active);
  color: #ffffff;
  font-weight: 600;
}

.nav-item svg {
  width: 18px;
  height: 18px;
  opacity: 0.5;
  flex-shrink: 0;
}

.nav-item:hover svg,
.nav-item.active svg {
  opacity: 0.9;
}

.nav-badge {
  margin-left: auto;
  background: var(--accent-red);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  letter-spacing: 0.02em;
}
```

**Step 2: Update notification bell and mobile sidebar styles for dark theme**

The notification bell in sidebar needs inverted colors. The mobile sidebar header also needs dark theme.

Update `.logo-title-row .notification-bell-btn` and `.sidebar-header-mobile` selectors.

**Step 3: Commit**
```
git add -A && git commit -m "feat: dark sidebar with warm charcoal theme"
```

---

### Task 3: Dark Sidebar Components — AppShell + NotificationBell

**Files:**
- Modify: `components/AppShell.tsx:249-300` (user profile inline styles)
- Modify: `components/NotificationBell.tsx` (bell styling in sidebar context)

**Step 1: Replace AppShell user profile section inline styles with CSS classes**

Add CSS classes to `globals.css`:
```css
.sidebar-user {
  margin-top: auto;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--sidebar-border);
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--sidebar-bg-active);
  color: rgba(255,255,255,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.sidebar-user-info {
  flex: 1;
  min-width: 0;
}

.sidebar-user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--sidebar-text-hover);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-user-role {
  font-size: 11px;
  color: var(--sidebar-text-muted);
  text-transform: capitalize;
}

.sidebar-signout {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--sidebar-text-muted);
  padding: 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.sidebar-signout:hover {
  color: var(--sidebar-text-hover);
}
```

Then update `AppShell.tsx` to use these classes instead of inline `style={{}}` props.

**Step 2: Update notification bell colors for sidebar context**

The `.notification-bell-btn` inside `.sidebar` needs:
```css
.sidebar .notification-bell-btn {
  border-color: var(--sidebar-border);
  background: transparent;
  color: var(--sidebar-text);
}

.sidebar .notification-bell-btn:hover {
  color: var(--sidebar-text-hover);
  border-color: rgba(255,255,255,0.2);
  box-shadow: none;
}
```

**Step 3: Commit**
```
git add -A && git commit -m "feat: migrate AppShell user section to CSS classes, style bell for dark sidebar"
```

---

### Task 4: Typography — Headings, Stat Values, Section Labels

**Files:**
- Modify: `app/globals.css` (header h2, stat-value, table-title, page-header, section-header, form-section-title, detail-panel-header h3)

**Step 1: Add General Sans to all heading selectors**

Update these selectors to use `font-family: 'General Sans', sans-serif`:
- `.header h2`
- `.stat-value`
- `.table-title`
- `.page-header h2`
- `.section-header h3`
- `.detail-panel-header h3`
- `.approval-header-content h1`
- `.route-field-name`
- `.entity-title`
- `.entity-amount-value`

**Step 2: Increase heading sizes**

- `.header h2` → `font-size: 22px`
- `.stat-value` → `font-size: 28px`
- `.page-header h2` → `font-size: 26px`
- `.detail-panel-header h3` → `font-size: 18px`
- `.approval-header-content h1` → `font-size: 26px`

**Step 3: Standardize letter-spacing**

Replace all `letter-spacing: 0.5px` with `letter-spacing: 0.06em`.
Replace all `letter-spacing: 0.04em`, `0.05em`, `0.06em` with a consistent `0.06em` for uppercase labels.

**Step 4: Commit**
```
git add -A && git commit -m "feat: General Sans headings, increased heading scale, standardized letter-spacing"
```

---

### Task 5: Visual Depth — Shadows, Cards, Content Max-Width

**Files:**
- Modify: `app/globals.css`

**Step 1: Update card default shadows**

- `.stat-card` → `box-shadow: var(--shadow-md)` (was `--shadow-sm`)
- `.stat-card:hover` → `box-shadow: var(--shadow-lg)` (was `--shadow-md`)
- `.table-container` → add `box-shadow: var(--shadow-sm)`
- `.content-card` → `box-shadow: var(--shadow-md)` (was `--shadow-sm`)
- `.content-card:hover` → `box-shadow: var(--shadow-lg)` (was `--shadow-md`)

**Step 2: Add content max-width**

```css
.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
}
```

**Step 3: Add subtle background texture**

```css
body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
}
```

**Step 4: Commit**
```
git add -A && git commit -m "feat: enhanced shadows, content max-width, subtle background texture"
```

---

### Task 6: Motion & Animations

**Files:**
- Modify: `app/globals.css`

**Step 1: Add entrance animations**

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.stat-card {
  animation: fadeInUp 0.3s ease both;
}
.stat-card:nth-child(1) { animation-delay: 0s; }
.stat-card:nth-child(2) { animation-delay: 0.05s; }
.stat-card:nth-child(3) { animation-delay: 0.1s; }
.stat-card:nth-child(4) { animation-delay: 0.15s; }

.table-container {
  animation: fadeInUp 0.3s ease 0.1s both;
}
```

**Step 2: Add skeleton loading class**

```css
.skeleton {
  background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

**Step 3: Add smooth entity card expand**

```css
.entity-content,
.card-content {
  overflow: hidden;
}
```

**Step 4: Commit**
```
git add -A && git commit -m "feat: entrance animations, skeleton loading, smooth transitions"
```

---

### Task 7: Accessibility

**Files:**
- Modify: `app/globals.css`

**Step 1: Add visible focus rings**

```css
*:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}
```

**Step 2: Increase mobile touch targets**

```css
@media (max-width: 768px) {
  .action-btn {
    width: 44px;
    height: 44px;
  }

  .nav-item {
    padding: var(--space-3) var(--space-3);
    min-height: 44px;
  }
}
```

**Step 3: Sticky table headers**

```css
th {
  position: sticky;
  top: 0;
  z-index: 10;
}
```

**Step 4: Commit**
```
git add -A && git commit -m "feat: focus rings, touch targets, sticky table headers"
```

---

### Task 8: New CSS Classes for Inline Style Extraction

**Files:**
- Modify: `app/globals.css` (add new classes at end)

**Step 1: Add classes that will replace common inline patterns**

```css
/* Login page */
.login-page { ... }
.login-card { ... }
.login-header { ... }
.login-form { ... }
.login-error { ... }
.login-field { ... }
.login-label { ... }
.login-input { ... }
.login-submit { ... }

/* Empty state */
.empty-state-container { ... }
.empty-state-icon { ... }
.empty-state-title { ... }
.empty-state-description { ... }

/* Loading bar */
.loading-bar { ... }
.loading-bar-fill { ... }

/* Dashboard section headers */
.section-label { ... }
.stats-grid-3 { ... }

/* Install page card components */
.install-card { ... }
.install-card-badge { ... }
.install-card-body { ... }
.install-card-meta { ... }
.install-form-container { ... }
/* ... and many more for InstallClient */

/* CRM tabs */
.crm-tabs { ... }
.crm-tab { ... }
.crm-tab.active { ... }

/* Repairs inline patterns */
.repair-modal-fields { ... }

/* Probes rack view */
.rack-scrubber { ... }
```

This is the largest single step. Full CSS definitions will be written during implementation.

**Step 2: Commit**
```
git add -A && git commit -m "feat: add CSS classes for inline style extraction"
```

---

### Task 9: Extract Inline Styles — LoginForm

**Files:**
- Modify: `app/login/LoginForm.tsx` (replace all 14 `style={{}}` with className refs)

Replace every inline style with the corresponding CSS class from Task 8. The component should have ZERO `style={{}}` props when done.

**Step 1: Commit**
```
git add -A && git commit -m "refactor: extract LoginForm inline styles to CSS classes"
```

---

### Task 10: Extract Inline Styles — EmptyState + LoadingBar

**Files:**
- Modify: `components/EmptyState.tsx` (5 inline styles → classes)
- Modify: `components/LoadingBar.tsx` (2 inline styles → classes)

**Step 1: Commit**
```
git add -A && git commit -m "refactor: extract EmptyState and LoadingBar inline styles"
```

---

### Task 11: Extract Inline Styles — DashboardClient

**Files:**
- Modify: `app/DashboardClient.tsx` (9 inline styles → classes)

**Step 1: Commit**
```
git add -A && git commit -m "refactor: extract DashboardClient inline styles"
```

---

### Task 12: Extract Inline Styles — CRMClient + RepairsClient

**Files:**
- Modify: `app/crm/CRMClient.tsx` (2 inline styles → classes)
- Modify: `app/repairs/RepairsClient.tsx` (24 inline styles → classes)

**Step 1: Commit**
```
git add -A && git commit -m "refactor: extract CRMClient and RepairsClient inline styles"
```

---

### Task 13: Extract Inline Styles — InstallClient

**Files:**
- Modify: `app/install/InstallClient.tsx` (64 inline styles → classes)

This is the largest extraction. All card layouts, badges, form elements, and positioning get CSS classes.

**Step 1: Commit**
```
git add -A && git commit -m "refactor: extract InstallClient inline styles to CSS classes"
```

---

### Task 14: Extract Inline Styles — ProbesClient

**Files:**
- Modify: `app/probes/ProbesClient.tsx` (31 inline styles → classes)

**Step 1: Commit**
```
git add -A && git commit -m "refactor: extract ProbesClient inline styles to CSS classes"
```

---

### Task 15: Fix Duplicate Status Badge + Map Marker Colors

**Files:**
- Modify: `app/globals.css` (consolidate the two `.status-badge` definitions near lines 577 and 2053)
- Modify: `app/globals.css` (update `.custom-marker.installed` from `#34d399` to use accent-primary)

**Step 1: Commit**
```
git add -A && git commit -m "fix: consolidate duplicate status-badge, unify map marker colors"
```

---

### Task 16: Mobile Polish

**Files:**
- Modify: `app/globals.css`

- Mobile cards: white background + shadow instead of `--bg-secondary`
- Notification unread: use CSS variables instead of hardcoded hex
- Mobile sidebar: dark theme carried through

**Step 1: Commit**
```
git add -A && git commit -m "feat: mobile card elevation, notification variable colors"
```

---

### Task 17: Final Sweep + Verification

**Step 1: Search for any remaining `accent-green` references**
**Step 2: Search for any remaining hardcoded hex colors in .tsx files**
**Step 3: Search for any remaining `style={{` that could be extracted**
**Step 4: Visual verification — run `npm run dev` and check each page**
**Step 5: Commit any final fixes**
```
git add -A && git commit -m "chore: final cleanup and verification pass"
```
