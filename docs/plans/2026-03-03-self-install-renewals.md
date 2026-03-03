# Self-Install Renewal Customers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow billing entities to be flagged as "self-install" so renewal-only customers can be tracked without requiring full field details. Add quantity support to invoice lines so renewal customers can be billed per-probe (e.g., 16 probes × $375 = $6,000).

**Architecture:** Add a `self_install` boolean field to the billing_entities Baserow table. When toggled on, auto-create a dummy field named "[Customer] - Renewals" linked to that billing entity. Field_seasons are created through the existing enrollment flow. Add `quantity` field to invoice_lines (default 1) so billing displays and calculates rate × quantity. No new tables or API routes needed.

**Tech Stack:** Next.js, Baserow API, TypeScript

---

### Task 1: Add `self_install` field to Baserow and update types

**Files:**
- Modify: `lib/baserow.ts:321-324` (BillingEntity interface)

**Step 1: Add `self_install` boolean field in Baserow**

Go to Baserow UI → `billing_entities` table (817297) → Add a new boolean field named `self_install`.

**Step 2: Update the BillingEntity interface**

In `lib/baserow.ts`, update the interface at lines 321-324:

```typescript
export interface BillingEntity {
  id: number;
  name: string;
  self_install?: boolean;
}
```

**Step 3: Update ProcessedBillingEntity to carry the flag through**

In `app/billing-entities/page.tsx`, update the interface at line 4:

```typescript
export interface ProcessedBillingEntity {
  id: number;
  name: string;
  selfInstall: boolean;
  operationNames: string[];
  contactIds: number[];
  contactNames: string[];
}
```

And in the processing logic (~line 62), add the field:

```typescript
return {
  id: be.id,
  name: be.name || '',
  selfInstall: be.self_install === true,
  operationNames: opNames,
  contactIds: linkedContacts.map((c) => c.id),
  contactNames: linkedContacts.map((c) => c.name),
};
```

**Step 4: Commit**

```bash
git add lib/baserow.ts app/billing-entities/page.tsx
git commit -m "feat: add self_install field to BillingEntity type"
```

---

### Task 2: Add self-install toggle to billing entity edit modal

**Files:**
- Modify: `app/billing-entities/BillingEntitiesClient.tsx`

**Step 1: Add state for the self-install checkbox**

After the `formName` state declaration (line 26):

```typescript
const [formSelfInstall, setFormSelfInstall] = useState(false);
```

**Step 2: Update handleEdit to send self_install**

In the `handleEdit` function (line 122-125), update the body:

```typescript
body: JSON.stringify({ name: formName, self_install: formSelfInstall }),
```

And update the local state on success (line 129-134):

```typescript
setEntities(
  entities.map((e) =>
    e.id === selectedEntity.id
      ? { ...e, name: formName, selfInstall: formSelfInstall }
      : e
  )
);
```

**Step 3: Add checkbox to the edit modal**

In the edit modal form (after line 374, inside the `.edit-form` div):

```tsx
<div className="form-group">
  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
    <input
      type="checkbox"
      checked={formSelfInstall}
      onChange={(e) => setFormSelfInstall(e.target.checked)}
    />
    Self-Install Customer
  </label>
  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
    Customer installs their own probes. A renewal field will be auto-created.
  </span>
</div>
```

**Step 4: Populate form when opening the edit modal**

Find where `setFormName` is called when opening the edit modal (look for the click handler on the edit button that sets `selectedEntity` and `formName`). Add after `setFormName(...)`:

```typescript
setFormSelfInstall(entity.selfInstall);
```

**Step 5: Commit**

```bash
git add app/billing-entities/BillingEntitiesClient.tsx
git commit -m "feat: add self-install toggle to billing entity edit modal"
```

---

### Task 3: Auto-create renewal field when self-install is toggled on

**Files:**
- Modify: `app/billing-entities/BillingEntitiesClient.tsx`

**Step 1: Add auto-creation logic after successful edit**

In the `handleEdit` function, after the successful PATCH response (after line 128 `if (response.ok)`), add logic to create the dummy field if self-install was just toggled on:

```typescript
if (response.ok) {
  // If self-install was just toggled ON, auto-create the renewal field
  if (formSelfInstall && !selectedEntity.selfInstall) {
    try {
      const currentYear = new Date().getFullYear();
      await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${formName} - Renewals`,
          billing_entity: selectedEntity.id,
          season: String(currentYear),
        }),
      });
    } catch (err) {
      console.error('Failed to create renewal field:', err);
      // Non-blocking — the toggle still saved, field can be created manually
    }
  }

  setEntities(
    entities.map((e) =>
      e.id === selectedEntity.id
        ? { ...e, name: formName, selfInstall: formSelfInstall }
        : e
    )
  );
  setShowEditModal(false);
  setSelectedEntity(null);
  setFormName('');
}
```

**Step 2: Commit**

```bash
git add app/billing-entities/BillingEntitiesClient.tsx
git commit -m "feat: auto-create renewal field when self-install is toggled on"
```

---

### Task 4: Add self-install badge to billing entities list

**Files:**
- Modify: `app/billing-entities/BillingEntitiesClient.tsx`
- Modify: `app/globals.css`

**Step 1: Add CSS for self-install badge**

In `app/globals.css`, add near the other `.status-badge` styles:

```css
.status-badge.self-install {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
}
```

**Step 2: Show badge in the billing entities table**

Find where the entity name is rendered in the table row. Add the badge after the name:

```tsx
{entity.name}
{entity.selfInstall && (
  <span className="status-badge self-install" style={{ marginLeft: '8px', fontSize: '11px' }}>
    Self-Install
  </span>
)}
```

**Step 3: Commit**

```bash
git add app/billing-entities/BillingEntitiesClient.tsx app/globals.css
git commit -m "feat: add self-install badge to billing entities list"
```

---

### Task 5: Add quantity support to invoice lines

**Prereq:** `quantity` number field (default 1) already added to `invoice_lines` table (817304) in Baserow.

**Files:**
- Modify: `lib/baserow.ts:467-473` (InvoiceLine interface)
- Modify: `app/billing/BillingClient.tsx` (display interface, table rendering, subtotal calculation)
- Modify: `app/billing/page.tsx` (server-side processing, subtotal calculation)
- Modify: `app/api/billing/enroll/route.ts` (updateInvoiceTotal helper)

**Step 1: Update the InvoiceLine interface in baserow.ts**

In `lib/baserow.ts`, update the interface at lines 467-473:

```typescript
export interface InvoiceLine {
  id: number;
  invoice?: { id: number; value: string }[];
  field_season?: { id: number; value: string }[];
  service_type?: string;
  rate?: number;
  quantity?: number;
}
```

**Step 2: Update the client-side InvoiceLine interface**

In `app/billing/BillingClient.tsx`, update the interface at lines 13-18:

```typescript
export interface InvoiceLine {
  id: number;
  fieldName: string;
  serviceType: string;
  rate: number;
  quantity: number;
}
```

**Step 3: Pass quantity through from server to client**

In `app/billing/page.tsx`, update the line processing (~line 50) to include quantity in the beSeasonLines map type:

Change the map type:
```typescript
const beSeasonLines = new Map<string, { fieldSeasonId: number; fieldName: string; serviceType: string; rate: number; quantity: number }[]>();
```

In the `fieldSeasons.forEach` loop (~line 74), add quantity when pushing to the map. Note: quantity comes from invoice_lines, not field_seasons. Since the current billing page derives lines from field_seasons (not from the invoice_lines table directly), we need to also fetch invoice_lines and merge the quantity in.

Add `getInvoiceLines` to the data fetch at the top of `getData()`, then build a map of field_season_id → quantity from invoice_lines. When pushing to beSeasonLines, look up quantity from that map, defaulting to 1.

In the processed invoice lines (~line 130-135):
```typescript
lines: lines.map((line) => ({
  id: line.fieldSeasonId,
  fieldName: line.fieldName,
  serviceType: line.serviceType,
  rate: line.rate,
  quantity: line.quantity,
})),
```

**Step 4: Update subtotal calculation on the server side**

In `app/billing/page.tsx` (~line 118), change:
```typescript
const subtotal = lines.reduce((sum, line) => sum + (line.rate * line.quantity), 0);
```

**Step 5: Update the billing table display**

In `app/billing/BillingClient.tsx`, update the table header (~line 399):
```tsx
<thead>
  <tr>
    <th>Field</th>
    <th>Service Type</th>
    <th className="align-right">Qty</th>
    <th className="align-right">Rate</th>
    <th className="align-right">Total</th>
  </tr>
</thead>
```

Update the table body row (~line 405):
```tsx
{lines.map((line) => (
  <tr key={line.id}>
    <td>{line.fieldName}</td>
    <td className="text-secondary">{line.serviceType || '—'}</td>
    <td className="align-right">{line.quantity}</td>
    <td className="align-right">{formatCurrency(line.rate)}</td>
    <td className="align-right">{formatCurrency(line.rate * line.quantity)}</td>
  </tr>
))}
```

Update the subtotal/total rows colSpan from 2 to 4:
```tsx
<tr className="subtotal-row">
  <td colSpan={4} className="align-right">Subtotal</td>
  <td className="align-right">{formatCurrency(subtotal)}</td>
</tr>
```

And same for discount and total rows.

**Step 6: Update the subtotal calculation in BillingClient**

Find where subtotal is calculated from lines in BillingClient.tsx and update to:
```typescript
const subtotal = lines.reduce((sum, line) => sum + (line.rate * line.quantity), 0);
```

**Step 7: Update updateInvoiceTotal helper**

In `app/api/billing/enroll/route.ts` (~line 207), update the total calculation:
```typescript
const total = linesData.results.reduce((sum: number, line: { rate?: number; quantity?: number }) => {
  return sum + ((line.rate || 0) * (line.quantity || 1));
}, 0);
```

**Step 8: Commit**

```bash
git add lib/baserow.ts app/billing/BillingClient.tsx app/billing/page.tsx app/api/billing/enroll/route.ts
git commit -m "feat: add quantity support to invoice lines for per-probe billing"
```

---

### Task 6: Test the full flow end-to-end

**Steps:**

1. Add `self_install` boolean field in Baserow billing_entities table
2. Start the dev server: `npm run dev`
3. Go to Billing Entities page
4. Edit a test billing entity → toggle "Self-Install Customer" on → Save
5. Verify: a field named "[Entity Name] - Renewals" appears on the Fields page
6. Verify: a field_season was created for the current year
7. Verify: the billing entity shows the "Self-Install" badge
8. Go to Fields page → enroll the renewal field into a season with a service type
9. Verify: billing works as expected through the normal invoice flow

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: self-install renewal customer support"
```
