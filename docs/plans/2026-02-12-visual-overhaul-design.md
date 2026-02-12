# Visual Overhaul Design — Acre Insights Operation Center

**Date:** 2026-02-12
**Goal:** Transform the UI from a generic admin panel into a professional, modern agricultural operations platform that feels like 2026 software.

## Design Decisions

### Color System
- **Primary accent:** Sage green `#4a7a5b`, hover `#3d6a4e`, dim `rgba(74, 122, 91, 0.12)`
- Rename `--accent-green` → `--accent-primary` across CSS and all components
- Secondary accents stay: blue `#0284c7`, amber `#d97706`, red `#dc2626`
- Unify map marker colors with badge system (use CSS variables, not hardcoded hex)
- Fix all one-off hover colors (`#4a7a4a`, `#2fc58c`, `#a04540`) to derive from variable system
- Move hardcoded notification colors (`#f0f7ff`, `#e6f0fb`) to variables

### Typography
- **Headings:** General Sans (500/600/700) from Google Fonts CDN
- **Body:** Source Sans 3 (400/500/600) — cleaner than Inter, better readability at small sizes
- Heading scale: page titles 26px, section headers 18px, stat values 28px, modal titles 18px
- Standardize all letter-spacing to `em` units
- Remove duplicate Inter references

### Dark Sidebar
- Background: `#1a1f1c` (warm charcoal with green undertone)
- Nav text: `rgba(255, 255, 255, 0.7)`, hover: `rgba(255, 255, 255, 0.9)`
- Active nav: sage green left border indicator + light background wash
- Section titles: `rgba(255, 255, 255, 0.4)`
- Logo area: white text on dark
- User profile section: styled to match dark theme
- Notification bell: inverted for dark context

### Layout & Spacing
- Content max-width: `1440px` with auto centering
- Extract ALL inline styles to CSS classes (LoginForm, InstallClient, CRMClient, DashboardClient, EmptyState, LoadingBar, AppShell user section)
- Fix duplicate `.status-badge` definitions — single source of truth
- Stats grid modifiers: `.stats-grid-3` and `.stats-grid-4`
- Consistent spacing via CSS variable scale only (no raw px in components)

### Visual Depth & Texture
- Default card shadow bumped from `shadow-sm` to `shadow-md`
- Cards on hover get `shadow-lg`
- Subtle CSS noise texture on `--bg-primary` via pseudo-element
- Sidebar gets `shadow-lg` for strong spatial separation
- Slightly increase border radius: cards 12px, modals 16px, buttons 8px

### Motion & Transitions
- `@keyframes fadeInUp` for stat cards and table rows on page load
- Smooth `max-height` transition on entity card expand/collapse
- Sidebar nav hover: 0.15s background + color transition (already exists, just needs dark theme values)
- Skeleton loading CSS classes for table and card layouts

### Accessibility
- Visible focus ring: `0 0 0 2px var(--accent-primary)` outline on all interactive elements
- Minimum 44x44px touch targets on mobile (action buttons, nav items)
- Focus trap in modal overlays
- Escape key closes modals
- `aria-sort` on sortable table headers
- Verify WCAG AA contrast for all text/background combinations

### Component Fixes
- **Modals:** Size system — `.detail-panel-sm` (440px), `.detail-panel-md` (560px), `.detail-panel-lg` (900px)
- **Tables:** Sticky `<thead>` with `position: sticky; top: 0`
- **Mobile cards:** White background + shadow (elevated, not recessed)
- **Empty state:** Migrate from inline styles to CSS classes
- **Login page:** Full CSS class migration
- **Install page:** Full CSS class migration

## Files Affected

**CSS:**
- `app/globals.css` — primary changes (color variables, dark sidebar, typography, animations, new classes)

**Components (inline style extraction):**
- `app/login/LoginForm.tsx`
- `app/DashboardClient.tsx`
- `app/install/InstallClient.tsx`
- `app/crm/CRMClient.tsx`
- `app/repairs/RepairsClient.tsx`
- `components/AppShell.tsx`
- `components/EmptyState.tsx`
- `components/LoadingBar.tsx`

**Components (dark sidebar adaptation):**
- `components/AppShell.tsx`
- `components/Sidebar.tsx`
- `components/NotificationBell.tsx`

## Non-Goals
- No functional changes to business logic
- No API changes
- No new dependencies beyond Google Fonts URL change
- No changes to data flow or state management
