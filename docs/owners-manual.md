# Acre Insights Operation Center — Owner's Manual

## What Is Acre-Ops?

Acre-Ops is a web-based operations management system built for agricultural service providers who deploy and manage soil moisture probes on customer fields. It tracks the full lifecycle of probe operations — from customer onboarding and field setup, through probe installation and seasonal monitoring, to billing and invoicing.

The system is organized around a handful of core concepts that mirror the real-world business:

- **Operations** — the farming operations (customers) you serve
- **Contacts** — people associated with those operations
- **Billing Entities** — the organizations you invoice
- **Fields** — the physical agricultural fields where probes are placed
- **Probes** — the soil moisture sensors you own and deploy
- **Seasons** — the annual crop cycles that tie everything together

All data lives in a Baserow database. Acre-Ops is the front-end that makes it usable.

---

## Getting Started

### Logging In

Navigate to the application URL. If you are not already logged in, you will be redirected to the login page. Enter your email and password to access the system.

There are two user roles:

| Role | Access |
|------|--------|
| **Admin / Manager** | Full access to every page and feature |
| **Installer** | Limited to Dashboard, Installs, Approvals, Locations, and Repairs |

### Navigating the App

The sidebar on the left organizes the application into five sections:

| Section | Pages |
|---------|-------|
| **Overview** | Dashboard, CRM, Fields, Probes |
| **Field Work** | Approvals, Installs, Locations, Repairs |
| **Reports** | Water Recs, Billing |
| **Supplies** | Orders, Inventory, Weather Stations |
| **Admin** | AI Chat, Documents, Settings |

- Click the collapse button at the bottom of the sidebar to give yourself more screen space.
- On mobile, tap the menu icon in the top-left to open the sidebar as an overlay.
- Use the **season selector** in the top bar to switch which crop year you are viewing. Most pages filter their data by the selected season.
- Use the **Operation Focus** feature (configured in Settings) to filter every page down to a single operation's data.

---

## Core Concepts & Data Model

Understanding how the data relates to each other is key to using the system effectively.

```
Operation
 ├── Contacts (people: growers, decision makers, probe contacts)
 ├── Billing Entities (who gets the invoice)
 │    └── Fields (physical land parcels)
 │         └── Field Seasons (one per field per year)
 │              └── Probe Assignments (which probe goes where)
 └── Probes (the physical sensors, owned by an operation or billing entity)
```

### Operations

An operation is a farming business or customer account. It is the top-level grouping. Everything — contacts, billing entities, fields, probes — traces back to an operation.

### Contacts

People associated with operations. Each contact can have one or more customer types (grower, probe contact, decision maker, etc.) and can be marked as the "main contact" for their operation.

### Billing Entities

The legal entity that receives invoices. A billing entity is linked to one or more operations and owns a set of fields. Some billing entities are flagged as **self-install**, meaning the customer installs their own probes and uses a renewal billing arrangement.

### Fields

A physical agricultural field. Fields store permanent data: location (lat/lng), acreage, irrigation type, water source, fuel source, soil type, elevation, PLSS location (township/range/section), drip system specifications, and placement notes.

### Field Seasons

A field season is the join between a field and a crop year. It captures seasonal data: what crop is planted, the service type, planting date, hybrid variety, logger ID, and whether the field is ready for installation. Each field season can have one or more probe assignments.

### Probe Assignments

A probe assignment links a specific probe to a specific field season. It tracks everything about that placement: probe number, label (e.g. "NE", "SW" for multi-probe fields), antenna type, battery type, placement coordinates, installation data (date, installer, GPS, photos, signal strength), and approval status.

### Probes

The physical soil moisture sensors. Each probe has a serial number, brand, status (on order, available, assigned, installed, retired), rack/slot location for storage, and history of damages and repairs.

---

## Page-by-Page Guide

### Dashboard

**What it shows:** An executive summary of the current state of the business.

**Key sections:**

1. **Install Progress** — A progress bar showing how many probes are installed vs. assigned vs. unassigned for the current season. Click into the detail table to see each installed probe with its field, serial number, install date, and installer.

2. **Booking Tracker** — Shows which operations are booked for the current season, how many fields and probes they have, and whether they are returning from last year or new. Also highlights operations from last year that haven't booked yet ("Still to Go"). Probes on order are shown separately.

3. **Open Repairs** — A count and list of repair tickets that haven't been resolved yet. Color-coded by age (how many days since reported).

4. **Recent Orders** — The five most recent purchase orders with their status and totals.

**Typical use:** Check this page at the start of each day to see what needs attention.

---

### CRM

**What it shows:** Three tabbed views — Operations, Contacts, and Billing Entities — with all their relationships.

**Operations tab:**
- Lists every operation with its linked contacts, billing entities, field count, and probe count.
- Use this to see the full picture of a customer relationship at a glance.

**Contacts tab:**
- Every contact with their phone, email, customer type, associated operations, and billing entities.
- Shows whether someone is the main contact for their operation.

**Billing Entities tab:**
- Lists billing entities with linked operations and contacts.
- Shows the self-install flag.

**Typical use:** Look up a customer's details, find who to call about an operation, or check which billing entity covers which fields.

---

### Fields

**What it shows:** A comprehensive, filterable table of all fields and their seasonal data.

**Key features:**
- Filter by operation, billing entity, or search by field name.
- Each field row expands to show its field seasons and probe assignments.
- Inline editing for many fields (click a cell to edit it directly).
- Add new fields, add seasons to existing fields, and manage probe assignments.
- View field locations on an interactive map.
- Supports multi-probe fields (multiple probe assignments per field season).
- Resizable table columns — drag column borders to your preferred width.

**Key workflows:**

*Adding a new field:*
1. Click "Add Field" button.
2. Fill in the field name, select a billing entity, and enter location/acreage data.
3. The field is created in Baserow and appears in the list.

*Setting up a field for a new season:*
1. Find the field in the list.
2. Click "Add Season" on that field's row.
3. Select the season year, crop, service type, and other seasonal details.
4. A field season record is created.

*Assigning a probe to a field:*
1. Expand a field season row.
2. Click "Assign Probe" or use the probe assignment interface.
3. Select a probe from the available inventory.
4. Set the probe number, label, antenna type, battery type, and placement location.

**Typical use:** Pre-season setup — creating field seasons and assigning probes before installers head to the field.

---

### Probes

**What it shows:** The full probe inventory with status, brand, serial number, and assignment history.

**Key features:**
- Filter by status (on order, available, assigned, installed, retired), brand, or trade year.
- See which field season each probe is assigned to.
- Inline editing for probe details.
- Track damages, repairs, and notes for each probe.

**Probe lifecycle:**
1. **On Order** — Probe has been ordered but not yet received.
2. **Available** — Probe is in inventory and ready to be assigned.
3. **Assigned** — Probe has been assigned to a field season but not yet installed.
4. **Installed** — Probe is physically in the ground and reporting data.
5. **Retired** — Probe is no longer in service.

**Typical use:** Check inventory levels, find available probes for assignment, or track down a specific probe by serial number.

---

### Approvals

**What it shows:** The probe placement approval workflow, organized by operation.

**How approvals work:**

Before installing probes, many operations require the grower to approve the planned placement locations. The approval system tracks this.

**Key features:**
- View approval status by operation: how many placements are pending, approved, change-requested, or rejected.
- Expand an operation to see each field season and its probe assignments with approval status.
- Generate a **shareable approval link** that can be sent to the grower. The grower can open this link without logging in and approve or reject each placement.
- Track approval notes and dates.

**Workflow:**
1. Assign probes to field seasons on the Fields page and set placement coordinates.
2. Go to Approvals and find the operation.
3. Click the approval link button to generate a shareable URL.
4. Send the link to the grower via email or text.
5. The grower opens the link, reviews each placement on a map, and approves or requests changes.
6. Come back to the Approvals page to see updated statuses and handle any change requests.

**Typical use:** Mid-pre-season — after probes are assigned but before installers go to the field.

---

### Installs

**What it shows:** Probe assignments that are ready for installation, and tools to record installation data.

**Who uses it:** Primarily installers in the field.

**Key features:**
- Shows assignments with status "Assigned" where the field season is marked "Ready to Install."
- Sorted by route order so installers can follow an efficient path.
- For each assignment, shows the field name, probe serial number, placement notes, and target coordinates.
- **Perform Install** action captures:
  - Installer name
  - Install date and time
  - GPS coordinates (can auto-detect from device)
  - Signal strength reading
  - CropX telemetry ID
  - Installation photos (field end view and extra views)
  - Install notes
- After recording install data, the probe assignment status changes to "Installed."

**Workflow:**
1. Installer opens the Installs page on their phone or tablet.
2. Reviews the list of fields to visit, sorted by route order.
3. At each field, taps "Perform Install" on the probe assignment.
4. Fills in installation data, takes photos, and submits.
5. The probe is now marked as installed.

**Typical use:** In the field during installation season.

---

### Locations (Route)

**What it shows:** An interactive map of field locations for route planning.

**Key features:**
- All fields plotted on a Leaflet map with their coordinates.
- Grouped by operation for easy filtering.
- Shows installed probe locations from the current season's assignments.
- Click a field marker to see details: acres, water source, fuel source, elevation, soil type, irrigation info.
- Use for planning the order in which an installer visits fields.

**Typical use:** Pre-install route planning and in-field navigation.

---

### Repairs

**What it shows:** Probe repair tickets — open issues and resolved history.

**Key features:**
- Open repairs are shown first, sorted by most recent.
- Each repair tracks: problem description, fix applied, reported date, repaired date, and whether the customer was notified.
- Supports probe replacement: if a probe was swapped out, the new probe serial is recorded.
- Links back to the probe assignment and field season.

**Workflow:**
1. A problem is reported (e.g. probe not reading, damaged by equipment).
2. Create a repair ticket with the problem description and reported date.
3. When the repair is completed, record the fix, mark the repaired date, and check "notified customer" if applicable.
4. If the probe was replaced, check "probe replaced" and enter the new serial number.

**Typical use:** During the growing season when probes may need service.

---

### Water Recs

**What it shows:** Water irrigation recommendations for fields with installed probes.

**Key features:**
- Organized by operation, showing only fields that have probes installed for the current season.
- Each field shows its acreage and most recent water recommendation.
- Enter new recommendations with a date, recommendation text, and suggested watering day.

**Workflow:**
1. Review probe data (in CropX or another telemetry platform).
2. Open the Water Recs page and find the field.
3. Enter the recommendation (e.g. "Apply 0.75 inches") and suggested watering day.
4. The recommendation is saved and can be shared with the grower.

**Typical use:** Weekly during the growing season.

---

### Billing

**What it shows:** Invoice management organized by billing entity.

**Key features:**
- Each billing entity shows its invoices for the selected season.
- Invoices contain line items broken down by field and service type.
- Rates are pulled automatically from the Products & Services table.
- Supports per-probe quantity billing (for fields with multiple probes).
- On-order probes appear as pending line items.
- Invoice status tracking: Draft → Sent → Paid, with deposit date tracking.

**Workflow:**
1. At the start of the season (or whenever billing is due), open the Billing page.
2. Find the billing entity.
3. Review the automatically calculated line items (fields × service rates).
4. Adjust quantities or rates if needed via inline editing.
5. Mark the invoice as sent when it goes out.
6. Record deposit and payment dates as money comes in.

**Typical use:** Beginning of season (initial billing) and throughout the season (tracking payments).

---

### Orders

**What it shows:** Purchase orders for equipment and services.

**Key features:**
- Create new orders linked to a billing entity.
- Add line items from the product catalog with quantities and pricing.
- Track order status: Quote → Ordered → Shipped → Received → Fulfilled.
- Set quote validity period (days).
- View order totals and notes.

**Workflow:**
1. Customer requests a quote for probes or services.
2. Create a new order, select the billing entity, and add items from the product catalog.
3. Set the quote validity period and send to the customer.
4. When the customer approves, update status to "Ordered."
5. Track through shipping and receiving until fulfilled.

**Typical use:** Pre-season when customers are ordering new equipment.

---

### Inventory

**What it shows:** Current stock levels of equipment and supplies.

**Key features:**
- Lists all inventory items with categories and quantities.
- **Equipment Needs Calculator** — automatically calculates what you need for the current season based on probe assignments:
  - How many of each antenna type
  - How many of each battery type
  - How many flags (stub antenna installs need 4' white flags)
- Compare needs vs. current inventory to plan procurement.

**Typical use:** Pre-season procurement planning.

---

### Weather Stations

**What it shows:** Weather monitoring equipment deployed at customer locations.

**Key features:**
- List of weather stations with model, connectivity type, status, and location.
- Installation details: coordinates, install date, and price paid.
- Status tracking: Active, Offline, Decommissioned.
- Links to billing entities.
- Map view showing station locations.

**Typical use:** Asset tracking and monitoring station health.

---

### AI Chat

**What it shows:** An AI-powered chat interface for querying operations data.

**Typical use:** Ask questions about your data conversationally, get quick answers without navigating through multiple pages.

---

### Documents

**What it shows:** A file repository for operation-related documents.

**Key features:**
- Upload files (PDFs, images, spreadsheets, etc.) with a name and description.
- Browse and download stored documents.
- Track who uploaded each file and when.

**Typical use:** Store contracts, service agreements, field maps, or any reference documents.

---

### Settings

**What it shows:** System configuration and reference data.

**Key features:**

1. **Operation Focus Mode** — Select a single operation to filter every page in the application to show only that operation's data. Clear the focus to see everything again.

2. **Products & Services** — Manage the catalog of services you offer (e.g. "Standard Monitoring", "Premium Monitoring") with rates and dealer fees. These rates are used to auto-calculate invoice line items on the Billing page.

3. **Select Field Options** — Manage the dropdown values used throughout the system:
   - Field options: irrigation type, row direction, water source, fuel source, soil type, etc.
   - Field season options: crop, service type, side dress, early removal/install, etc.
   - Probe assignment options: antenna type, battery type, probe status, etc.
   - Contact options: customer type categories.

**Typical use:** Initial system setup and occasional maintenance when new dropdown values are needed.

---

## Public-Facing Pages

These pages are accessible without logging in, using token-based URLs.

### Grower Approval Page (`/approve/[token]/[season]`)

When you generate an approval link from the Approvals page, growers receive a URL that opens this page. It shows:

- Each field in the operation for that season.
- Each probe assignment with its planned placement on a map.
- Placement details: coordinates, elevation, soil type.
- Buttons to Approve, Request Changes, or Reject each placement.
- A notes field for the grower to explain any change requests.

No login is required — the token in the URL authenticates the request.

### Field Info Form (`/field-info/[token]/[season]`)

A form sent to growers to collect field-specific information before the season. The URL can include query parameters to control which questions are shown. Available questions:

- Crop selection
- Irrigation type
- Row direction
- Side dressing
- Water source
- Fuel source
- Hybrid/variety
- Planting date
- Billing entity

Growers fill out the form field-by-field, and the data is saved directly to the field season records.

---

## Seasonal Workflow — Putting It All Together

Here is the typical annual workflow through the system:

### Off-Season / Pre-Season (Winter)

1. **Booking** — Reach out to returning and prospective customers. Create new operations, contacts, and billing entities in the CRM as needed.
2. **Field Setup** — Add new fields for new customers. Create field season records for the upcoming year on all active fields.
3. **Collect Field Info** — Send Field Info form links to growers to gather crop plans, irrigation details, and other seasonal data.
4. **Probe Assignment** — Assign probes from inventory to field seasons. Use the Probes page to check availability and the Fields page to make assignments.
5. **Equipment Planning** — Check the Inventory page's equipment needs calculator. Place orders for any additional probes, antennas, batteries, or flags needed.
6. **Route Planning** — Set route order on field seasons and use the Locations map to plan efficient installation routes.

### Installation Season (Spring)

7. **Approvals** — Generate approval links and send to growers. Monitor approval status on the Approvals page. Handle any change requests.
8. **Installation** — Installers use the Installs page (on mobile) to visit fields in route order and record installation data with GPS and photos.
9. **Billing** — Generate invoices on the Billing page and send to customers. Track deposits and payments.

### Growing Season (Summer)

10. **Water Recs** — Enter weekly water recommendations based on probe telemetry data.
11. **Repairs** — Log and track any probe issues via the Repairs page. Coordinate replacements as needed.
12. **Monitoring** — Use the Dashboard to monitor overall status: install progress, open repairs, and booking trends.

### Post-Season (Fall)

13. **Removal** — Record removal dates and notes on field seasons as probes are pulled from fields.
14. **Probe Return** — Update probe statuses back to "Available" and note any damage.
15. **Final Billing** — Send remaining invoices and follow up on outstanding payments.
16. **Season Wrap-Up** — Review the season in the Dashboard. Begin planning for next year.

---

## Technical Reference

### Data Backend

All data is stored in **Baserow**, an open-source database platform. The application communicates with Baserow through its REST API. Data changes made in the Acre-Ops UI are immediately saved to Baserow, and vice versa — changes made directly in Baserow are reflected in Acre-Ops on the next page load (or within 2 minutes for cached pages like the Dashboard).

### Hosting

The application is deployed on **Netlify** and runs on Node.js 20. It uses the Next.js framework with server-side rendering for fast page loads and API routes for data operations.

### Environment Variables

The following environment variables must be configured in Netlify (or your hosting platform):

| Variable | Purpose |
|----------|---------|
| `BASEROW_API_TOKEN` | API token for reading and writing Baserow data |
| `BASEROW_EMAIL` | Baserow account email (needed for schema changes like adding dropdown options) |
| `BASEROW_PASSWORD` | Baserow account password (for schema changes) |
| `NEXTAUTH_SECRET` | Secret key for encrypting session tokens |
| `NEXTAUTH_URL` | The public URL where the application is hosted |

### External Services

The application integrates with several external services for geographic data:

| Service | What It Does |
|---------|-------------|
| **USGS National Map** | Looks up elevation for field coordinates |
| **USDA Soil Data Access** | Looks up soil type/composition for field coordinates |
| **BLM PLSS MapServer** | Looks up Public Land Survey System data (township, range, section) |
| **Mapbox** | Geocodes addresses to coordinates |
| **Esri / Leaflet** | Provides satellite and topographic map tiles |

### Caching

Pages that aggregate large amounts of data (like the Dashboard) cache their results for 2 minutes to keep page loads fast. This means changes may take up to 2 minutes to appear on cached pages. Pages that need real-time data (like the install form) do not cache.

### User Management

User accounts are stored in the Baserow `users` table. Each user has:
- Email and password (hashed with bcrypt)
- Name
- Role (admin or installer)
- Active/inactive flag
- Last login timestamp

New users can be created through the registration API endpoint. Only active users can log in.
