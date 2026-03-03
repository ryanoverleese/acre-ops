# Operation Focus Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global "Operation Focus" mode so the app can be filtered to a single operation during customer meetings, preventing other clients' data from being visible.

**Architecture:** Create an `OperationFocusContext` (mirroring the existing `SeasonContext` pattern) that stores a focused operation in sessionStorage. The settings page gets an operation picker. Each page's client component reads the context and locks its operation filter when focus mode is active.

**Tech Stack:** React Context, sessionStorage, Next.js App Router, TypeScript

---

### Task 1: Create OperationFocusContext

**Files:**
- Create: `lib/OperationFocusContext.tsx`

**Step 1: Create the context file**

Model this directly after `lib/SeasonContext.tsx`. The context stores `{ id: number; name: string } | null`.

```tsx
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface FocusedOperation {
  id: number;
  name: string;
}

interface OperationFocusContextType {
  focusedOperation: FocusedOperation | null;
  setFocusedOperation: (op: FocusedOperation) => void;
  clearFocusedOperation: () => void;
}

const OperationFocusContext = createContext<OperationFocusContextType | undefined>(undefined);

const FOCUS_STORAGE_KEY = 'acre-ops-focused-operation';

export function OperationFocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedOperation, setFocusedOperationState] = useState<FocusedOperation | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(FOCUS_STORAGE_KEY);
      if (stored) {
        setFocusedOperationState(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load focused operation from storage:', e);
    }
    setIsHydrated(true);
  }, []);

  const setFocusedOperation = useCallback((op: FocusedOperation) => {
    setFocusedOperationState(op);
    try {
      sessionStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(op));
    } catch (e) {
      console.error('Failed to save focused operation to storage:', e);
    }
  }, []);

  const clearFocusedOperation = useCallback(() => {
    setFocusedOperationState(null);
    try {
      sessionStorage.removeItem(FOCUS_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear focused operation from storage:', e);
    }
  }, []);

  if (!isHydrated) {
    return null;
  }

  return (
    <OperationFocusContext.Provider value={{ focusedOperation, setFocusedOperation, clearFocusedOperation }}>
      {children}
    </OperationFocusContext.Provider>
  );
}

export function useOperationFocus() {
  const context = useContext(OperationFocusContext);
  if (context === undefined) {
    throw new Error('useOperationFocus must be used within an OperationFocusProvider');
  }
  return context;
}
```

**Step 2: Commit**

```bash
git add lib/OperationFocusContext.tsx
git commit -m "feat: add OperationFocusContext for global operation filtering"
```

---

### Task 2: Wire OperationFocusProvider into the app

**Files:**
- Modify: `components/Providers.tsx`

**Step 1: Add the provider**

```tsx
'use client';

import { SessionProvider } from 'next-auth/react';
import { OperationFocusProvider } from '@/lib/OperationFocusContext';
import { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <OperationFocusProvider>
        {children}
      </OperationFocusProvider>
    </SessionProvider>
  );
}
```

**Step 2: Commit**

```bash
git add components/Providers.tsx
git commit -m "feat: wire OperationFocusProvider into app providers"
```

---

### Task 3: Add Operation Focus section to Settings page

**Files:**
- Modify: `app/settings/page.tsx` — add operations fetch
- Modify: `app/settings/SettingsClient.tsx` — add Operation Focus UI section

**Step 1: Fetch operations in settings/page.tsx**

Add `getRows` import for operations and pass them to `SettingsClient`. Add to the `getSettingsData` parallel fetch:

```typescript
import { getRows } from '@/lib/baserow';
import type { Operation } from '@/lib/baserow';

// Inside getSettingsData, add to Promise.all:
const operations = await getRows<Operation>('operations');

// Return operations in the result:
return {
  ...existingFields,
  operations: operations.map(op => ({ id: op.id, name: op.name })),
};
```

Pass to SettingsClient:

```tsx
<SettingsClient
  initialProductsServices={productsServices}
  availableSeasons={availableSeasons}
  selectOptions={selectOptions}
  operations={operations}
/>
```

**Step 2: Add Operation Focus section to SettingsClient.tsx**

Add at the TOP of the settings page, before the existing sections. Import and use `useOperationFocus`:

```tsx
import { useOperationFocus } from '@/lib/OperationFocusContext';

// Inside component:
const { focusedOperation, setFocusedOperation, clearFocusedOperation } = useOperationFocus();
```

UI section (add as the first section in the rendered output):

```tsx
<div className="settings-section">
  <h2>Operation Focus</h2>
  <p className="settings-description">
    Focus on a single operation to filter all pages. Useful for customer meetings.
  </p>
  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
    <select
      value={focusedOperation?.id ?? ''}
      onChange={(e) => {
        const id = Number(e.target.value);
        const op = operations.find(o => o.id === id);
        if (op) setFocusedOperation({ id: op.id, name: op.name });
      }}
      className="settings-select"
    >
      <option value="">No focus (show all operations)</option>
      {operations.map(op => (
        <option key={op.id} value={op.id}>{op.name}</option>
      ))}
    </select>
    {focusedOperation && (
      <button onClick={clearFocusedOperation} className="btn-secondary">
        Clear
      </button>
    )}
  </div>
</div>
```

**Step 3: Update the SettingsClient props interface**

```typescript
interface SettingsClientProps {
  initialProductsServices: ProcessedProductService[];
  availableSeasons: string[];
  selectOptions: SerializedSelectOptionsWithMeta;
  operations: { id: number; name: string }[];
}
```

**Step 4: Verify the settings page loads and the operation picker works**

Run: `npm run dev` (or however the dev server starts)
Navigate to `/settings`, verify the Operation Focus section appears at the top.
Select an operation, verify it persists on page refresh (within same tab).
Clear it, verify it clears.

**Step 5: Commit**

```bash
git add app/settings/page.tsx app/settings/SettingsClient.tsx
git commit -m "feat: add Operation Focus picker to Settings page"
```

---

### Task 4: Integrate focus mode into ProbesClient

**Files:**
- Modify: `app/probes/ProbesClient.tsx`

**Step 1: Wire up the context**

Import `useOperationFocus` and read `focusedOperation`:

```tsx
import { useOperationFocus } from '@/lib/OperationFocusContext';

// Inside component:
const { focusedOperation } = useOperationFocus();
```

**Step 2: Override filterOperation when focused**

The effective operation filter should be the focused operation name when focus mode is active. Find where `filterOperation` is used in the filtering logic and apply:

```tsx
const effectiveOperationFilter = focusedOperation ? focusedOperation.name : filterOperation;
```

Replace all filtering references to `filterOperation` with `effectiveOperationFilter`.

**Step 3: Hide the operation dropdown when focused**

Find the operation `<select>` in the filter bar and wrap it:

```tsx
{!focusedOperation && (
  <select value={filterOperation} onChange={...}>...</select>
)}
```

**Step 4: Verify**

- Set focus to an operation in Settings
- Navigate to Probes page
- Verify only that operation's probes show
- Verify the operation filter dropdown is hidden
- Clear focus in Settings, verify probes page returns to normal

**Step 5: Commit**

```bash
git add app/probes/ProbesClient.tsx
git commit -m "feat: integrate operation focus mode into Probes page"
```

---

### Task 5: Integrate focus mode into FieldsClient

**Files:**
- Modify: `app/fields/FieldsClient.tsx`

**Step 1: Wire up the context**

Same pattern. Note: FieldsClient uses `currentOperation` which compares against `f.operationId?.toString()` — this is an **ID comparison**, so use `focusedOperation.id.toString()`:

```tsx
const { focusedOperation } = useOperationFocus();
const effectiveOperation = focusedOperation ? focusedOperation.id.toString() : currentOperation;
```

Replace `currentOperation` with `effectiveOperation` in the filtering logic.

**Step 2: Hide the operation dropdown when focused**

Wrap the operation filter UI with `{!focusedOperation && (...)}`.

**Step 3: Verify and commit**

```bash
git add app/fields/FieldsClient.tsx
git commit -m "feat: integrate operation focus mode into Fields page"
```

---

### Task 6: Integrate focus mode into InstallClient

**Files:**
- Modify: `app/install/InstallClient.tsx`

**Step 1: Wire up the context**

InstallClient uses `operationFilter` (string name comparison against `p.operation`):

```tsx
const { focusedOperation } = useOperationFocus();
const effectiveOperationFilter = focusedOperation ? focusedOperation.name : operationFilter;
```

Replace `operationFilter` with `effectiveOperationFilter` in the filtering logic. Note: the current filter uses `=== 'all'` to mean no filter, so when focused we skip that check.

**Step 2: Hide the operation dropdown when focused**

**Step 3: Verify and commit**

```bash
git add app/install/InstallClient.tsx
git commit -m "feat: integrate operation focus mode into Install page"
```

---

### Task 7: Integrate focus mode into ApprovalsClient

**Files:**
- Modify: `app/approvals/ApprovalsClient.tsx`

**Step 1: Wire up the context**

ApprovalsClient uses `selectedOperation` as `number | 'all'`, compared against `item.operationId` (number). Use the focused operation **ID**:

```tsx
const { focusedOperation } = useOperationFocus();
const effectiveOperation = focusedOperation ? focusedOperation.id : selectedOperation;
```

Replace `selectedOperation` with `effectiveOperation` in the filtering logic.

**Step 2: Hide the operation dropdown when focused**

**Step 3: Verify and commit**

```bash
git add app/approvals/ApprovalsClient.tsx
git commit -m "feat: integrate operation focus mode into Approvals page"
```

---

### Task 8: Integrate focus mode into WaterRecsClient

**Files:**
- Modify: `app/water-recs/WaterRecsClient.tsx`

**Step 1: Wire up the context**

WaterRecsClient uses `selectedOperationId` (number | null). Use the focused operation **ID**:

```tsx
const { focusedOperation } = useOperationFocus();
const effectiveOperationId = focusedOperation ? focusedOperation.id : selectedOperationId;
```

Replace `selectedOperationId` with `effectiveOperationId` in the filtering/data logic.

**Step 2: Hide the operation selector when focused**

**Step 3: Verify and commit**

```bash
git add app/water-recs/WaterRecsClient.tsx
git commit -m "feat: integrate operation focus mode into Water Recs page"
```

---

### Task 9: Integrate focus mode into BillingClient

**Files:**
- Modify: `app/billing/BillingClient.tsx`

**Step 1: Wire up the context and add filtering**

BillingClient currently has NO operation filter. The `operation` field is a string (may be comma-separated for multi-operation billing entities). Add filtering when focused:

```tsx
const { focusedOperation } = useOperationFocus();

// In the filtering logic, add:
if (focusedOperation) {
  filtered = filtered.filter(be => be.operation.includes(focusedOperation.name));
}
```

**Step 2: Verify and commit**

```bash
git add app/billing/BillingClient.tsx
git commit -m "feat: integrate operation focus mode into Billing page"
```

---

### Task 10: Integrate focus mode into RepairsClient

**Files:**
- Modify: `app/repairs/RepairsClient.tsx`

**Step 1: Wire up the context and add filtering**

RepairsClient has no operation filter currently. The `operation` field is a string:

```tsx
const { focusedOperation } = useOperationFocus();

// In the filtering logic, add:
if (focusedOperation) {
  filtered = filtered.filter(r => r.operation === focusedOperation.name);
}
```

**Step 2: Verify and commit**

```bash
git add app/repairs/RepairsClient.tsx
git commit -m "feat: integrate operation focus mode into Repairs page"
```

---

### Task 11: Integrate focus mode into RouteClient

**Files:**
- Modify: `app/route/RouteClient.tsx`

**Step 1: Wire up the context and add filtering**

RouteClient has no operation filter currently. The `operation` field is a string:

```tsx
const { focusedOperation } = useOperationFocus();

// In the filtering logic, add:
if (focusedOperation) {
  filtered = filtered.filter(f => f.operation === focusedOperation.name);
}
```

**Step 2: Verify and commit**

```bash
git add app/route/RouteClient.tsx
git commit -m "feat: integrate operation focus mode into Route/Locations page"
```

---

### Task 12: Integrate focus mode into CRM page

**Files:**
- Modify: `app/crm/CRMClient.tsx`

**Step 1: Wire up the context**

CRMClient wraps three sub-clients: OperationsClient, ContactsClient, BillingEntitiesClient. Rather than modifying each sub-client (OperationsClient is used standalone too), filter the data at the CRM wrapper level before passing it down:

```tsx
const { focusedOperation } = useOperationFocus();

// Filter operations array before passing to sub-clients
const filteredOperations = focusedOperation
  ? operations.filter(op => op.id == focusedOperation.id)  // loose equality: Baserow returns numbers as strings
  : operations;

// Filter contacts to only those linked to the focused operation
const filteredContacts = focusedOperation
  ? contacts.filter(c => c.operations?.some(o => o.id == focusedOperation.id))
  : contacts;

// Filter billing entities to only those linked to the focused operation
const filteredBillingEntities = focusedOperation
  ? billingEntities.filter(be => {
      // Check via contacts mapping
      return filteredContacts.some(c =>
        c.billing_entity?.some(b => b.id == be.id)
      );
    })
  : billingEntities;
```

Pass the filtered arrays to the sub-clients instead of the raw arrays.

**Note:** Use `==` (loose equality) for Baserow ID comparisons per project conventions.

**Step 2: Verify and commit**

```bash
git add app/crm/CRMClient.tsx
git commit -m "feat: integrate operation focus mode into CRM page"
```

---

### Task 13: Final verification

**Step 1: Full walkthrough**

1. Go to Settings, select an operation
2. Navigate through EVERY page in the sidebar:
   - Dashboard (no filtering expected — shows aggregate data)
   - CRM — should show only focused operation, its contacts, its billing entities
   - Fields — should show only focused operation's fields
   - Probes — should show only focused operation's probes
   - Approvals — should show only focused operation's approvals
   - Installs — should show only focused operation's installs
   - Locations — should show only focused operation's field locations
   - Repairs — should show only focused operation's repairs
   - Water Recs — should show only focused operation's recommendations
   - Billing — should show only focused operation's billing entities
   - Orders, Inventory, Weather Stations, Documents — no filtering (not operation-specific)
3. Clear focus in Settings
4. Verify all pages return to showing all data

**Step 2: Final commit**

If any fixes were needed during verification, commit them.
