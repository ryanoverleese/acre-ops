---
name: Acre Field Installer App
description: Standalone installer field app — route group /installer/, PIN auth, daily route + install form
type: project
---

Acre Field is a mobile-first installer app living in the same Next.js repo as Acre Ops, at route group `app/(installer)/`, URL prefix `/installer`. It has its own layout with no sidebar.

**Why:** Installers need a simple field-focused interface on their phones — today's probe assignment list, directions, and a guided install form — without access to the full back-office app.

**How to apply:** Keep the installer route group completely isolated from the main app layout. Use touch-friendly tap targets, minimal chrome, and optimize for slow/offline-ish conditions.

---

## Auth
- Per-installer PIN codes (4–6 digits), one per installer name
- PIN storage: Settings page in the main app, new collapsible section alongside the existing planned_installer dropdown options
- Installer names come from `field_seasons.planned_installer` Baserow select options (managed in Settings > Dropdown Options)
- PIN storage mechanism: TBD — either `.env.local` as `INSTALLER_PINS={"Alice":"1234","Bob":"5678"}` JSON or a Baserow config table
- Session: `localStorage` keyed by installer name, clears on explicit sign-out

## Data Source
- Table: `probe_assignments`
- Filter: `field_seasons.planned_installer == <logged-in installer name>` AND `season == <current season>`
- Sort: `route_order` (ascending)
- Status distinction: `probe_status` value — "Installed" = done, anything else = todo
- Access notes: from linked `field_seasons.notes` field

## Screens

### 1. PIN Login
- Installer name picker (dropdown of field_seasons.planned_installer options) + numeric PIN pad
- On success: store session in localStorage, redirect to Today's Route

### 2. Today's Route
- Filter tabs: Todo / Done / All
- Each card shows: field name, operation/grower, slot label, route order number
- Tap card → Field Detail screen

### 3. Field Detail
- Field name, grower/operation
- Google Maps directions link: `https://maps.google.com/?q=<lat>,<lng>` using `fields.lat` / `fields.lng`
- Access notes from `field_seasons.notes`
- "Start Install" button → Install Form

### 4. Install Form (one-page scroll)
Fields mapping to `probe_assignment` Baserow columns:
- **Installer** — pre-filled from session, locked
- **Probe serial** — numeric keyboard (`inputMode="numeric"`), searches available probes
- **GPS location** — mini map with blue dot, captures device coordinates → `probe_assignment.gps_lat` / `gps_lng`
- **Crop confirmation** — shows current `field_seasons.crop`, confirm or override → `probe_assignment.crop_confirmed`
- **Row direction** — shows `fields.row_direction` value, confirm button (not a new freeform input) → `probe_assignment.row_direction_confirmed`
- **CropX telemetry ID** — text input → `probe_assignment.cropx_id`
- **Photos** — "Field End" (required) + optional extras, same upload mechanism as existing Installs page
- **Install notes** — textarea → `probe_assignment.install_notes`
- **Submit** → PATCH existing probe_assignment record, set `probe_status` to "Installed"

### 5. Success Screen
- Confirmation with field name + probe serial
- Flag stake summary (see below)
- "Back to Route" button

## Flag Stake Calculation
Displayed on success screen per probe serial assigned:
- 1 pink flag per probe serial
- ~5 blue flags per probe serial
- 1 white flag per probe serial (base)
- +1 white if `probe.antenna_type` contains "stub"
- No extra white if `probe.antenna_type` contains "Coulter" OR `probe_assignment.side_dress` contains "cultivat" or "coulter" (case-insensitive)

## API Routes Needed
- `GET /api/installer/route?installer=<name>&season=<n>` — returns today's assignments with field + field_season join
- `PATCH /api/installer/assignment/[id]` — updates probe_assignment (install data)
- `GET /api/installer/auth` — validates PIN for installer name

## Implementation Notes
- No new npm packages — use existing fetch patterns, same CSS vars
- Photos: reuse whatever mechanism the existing Installs page uses for photo upload to Baserow
- The plan file at `/Users/ryano/.claude/plans/sprightly-herding-cosmos.md` is for a different feature (tap-to-move rack slots + display modes), not this installer app
