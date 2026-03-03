# Self-Install Renewal Customers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow billing entities to be flagged as "self-install" so renewal-only customers can be tracked without requiring full field details.

**Architecture:** Add a `self_install` boolean field to the billing_entities Baserow table. When toggled on, auto-create a dummy field named "[Customer] - Renewals" linked to that billing entity. Field_seasons are created through the existing enrollment flow. No new tables or API routes needed.

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

### Task 5: Test the full flow end-to-end

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
