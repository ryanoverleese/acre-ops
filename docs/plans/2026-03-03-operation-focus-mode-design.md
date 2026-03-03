# Operation Focus Mode

## Problem

When meeting with a customer, all operations' data is visible across every page. This exposes other clients' data during customer-facing sessions.

## Solution

A global "Operation Focus" mode that filters the entire app to a single operation. Set it in Settings before a meeting, clear it when done.

## Architecture

### OperationFocusContext (`lib/OperationFocusContext.tsx`)

- Follows the existing `SeasonContext` pattern exactly
- Stores `{ id: number; name: string } | null` in `sessionStorage`
- Clears automatically when the browser tab closes
- Exports `useOperationFocus()` hook: `{ focusedOperation, setFocusedOperation, clearFocusedOperation }`
- Wrapped in `Providers.tsx` alongside `SessionProvider`
- Handles hydration mismatch (waits for mount before reading storage)

### Settings Page

- New "Operation Focus" section at the top of the settings page
- Dropdown listing all operations (fetched server-side in `settings/page.tsx`)
- Clear button to deselect
- Brief description text explaining the feature

### Per-Page Integration

Each page with an operation filter reads `useOperationFocus()`:
- **Focused:** Local filter locks to the focused operation, operation dropdown hidden
- **Not focused:** Everything works exactly as today (no behavior change)
- **Empty state:** When the focused operation has no data, show a message like "No [items] for [Operation Name]"

### Pages to Update

- `ProbesClient` — `filterOperation`
- `InstallClient` — `operationFilter`
- `FieldsClient` — `currentOperation`
- `ApprovalsClient` — `selectedOperation`
- `WaterRecsClient` — `selectedOperationId`
- Check and update: `BillingClient`, `RepairsClient`, `RouteClient`, `CRMClient`

### What's NOT Included

- No header banner (settings page is the only UI)
- No server-side filtering (client-side only, matching current architecture)
- No URL query parameters
- No role-based restrictions on who can use focus mode
