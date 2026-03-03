# Self-Install Renewal Customers

## Problem

Some customers only purchase annual renewals — they install probes themselves, so we don't know their field names or locations. Currently there's no clean way to track these in acre-ops without creating detailed field records that don't apply.

## Design

### Core Concept

A billing entity can be flagged as **"Self-Install"**. When toggled on, the system auto-creates a single dummy field named `"[Customer Name] - Renewals"` linked to that billing entity. This field flows through the existing billing pipeline like any other field.

### Data Changes

1. **Baserow: `billing_entities` table** — Add a `self_install` boolean field
2. **Baserow: `fields` table** — No schema changes. The auto-created dummy field uses existing columns with relaxed expectations (no lat/lng, acres, etc.)

### Behavior

**Initial setup:**
- User toggles "self-install" on a billing entity
- System auto-creates field: `"[Customer Name] - Renewals"` linked to that billing entity
- System auto-creates a `field_season` for the current year with the renewal service type

**Annual renewals:**
- User enrolls the dummy field into the new season using the existing enrollment process
- Picks the renewal service type and probe count

**Billing:**
- Unchanged — invoice lines are generated from field_seasons as usual
- Rate comes from the products/services table per probe

**Probes:**
- Assigned to the billing entity as normal (existing flow)

### UI Changes

1. **Billing Entities page** — Add self-install toggle/checkbox on billing entity edit
2. **Self-install badge** — Show a visual indicator on self-install billing entities in lists
3. **Fields page** — Renewal dummy fields appear like normal fields but could show a "Renewal" badge
4. **Enrollment** — No changes needed, existing flow works

### What Stays the Same

- Probe ownership (billing_entity link on probes table)
- Invoice generation pipeline
- Field_season enrollment process
- All existing billing reports

### Edge Cases

- **Toggling self-install off**: Keep the dummy field but remove the flag. Field becomes a regular field.
- **Customer name changes**: Dummy field name doesn't auto-update (can be renamed manually).
- **Customer has both full-service and renewal probes**: They'd have real fields AND the renewals dummy field under the same billing entity. Works naturally.
