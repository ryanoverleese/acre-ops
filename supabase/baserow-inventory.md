# Acre Insights: Baserow → Supabase migration inventory
Generated 2026-10-12 (read-only discovery; nothing changed). Baserow DB 360377 'Soil Moisture Management' (only DB). 23 tables, 20,720 rows.

## Existing Supabase projects (org bcjwjhlwqewrgtlicybl)
- `reminders` vqqmyjapnvmpktxikrrz ACTIVE: public.reminders(126), toys(0), kasen_log(22), kasen_access(0), agent_changes(548), agent_runs(23). Edge fns: sms-in, analyze-toy, suggest-bins. **No Acre Ops tables; no collisions by name, but don't mix: create a dedicated project.**
- `acre-fertility` dtkhfiopehjeidqyymzk INACTIVE (paused) — not inspected (paused). `MeterCalc` xyvhmndlnvlayostclgk INACTIVE. **No Acre Ops project exists.**

## App (box copy /workspace/acre-ops, HEAD 999a02d 2026-10-08)
- Next.js on Netlify (@netlify/plugin-nextjs); no netlify/functions dir — all Baserow access is via Next API routes in app/api/* through lib/baserow.ts (TABLE_IDS for 22 tables, REST `api.baserow.io/api/database/rows/table/{id}/?user_field_names=true`, token BASEROW_API_TOKEN; normalizeKeys spaces→underscores).
- Schema-level calls: lib/baserow.ts getTableFieldOptions* hits `/api/database/fields/table/{id}/` (select options read live; /api/select-options PATCH ADDS select options via JWT login BASEROW_EMAIL/PASSWORD) → in Postgres use lookup tables, not hard enums, for app-editable options.
- Also: app/api/migrate, app/api/backup, app/api/debug/*, app/api/ask (AI tool: creates repairs, updates probes/field_seasons/probe_assignments), scripts/update-planting-data.mjs (field_seasons), tests/equipment/baserow-fixture.cjs. No webhooks found. No Supabase code in repo.
- Routes with CRUD (GET/POST/PATCH/DELETE): contacts, operations, billing-entities, fields, field-seasons(+bulk), probes, probe-assignments(+bulk,backfill), probe-rack(no DELETE), repairs, water-recs(+bulk,field-note), invoices, invoice-lines, products-services(no DELETE), inventory, orders(+fulfill), order-items, weather-stations, documents, notifications(no DELETE), mileage, installer-pins. Installer app (app/api/installer/*, install, removal, log-removal, pulled-today) reads billing_entities/contacts/field_seasons/fields/operations/probe_assignments/probe_rack/probes and writes probe_assignments/probes/probe_rack/repairs.


## Relationships (proposed)
Cardinality verified from data where marked ✔; others inferred from naming/usage — verify with a full export before DDL.
- contacts.billing_entity_id → billing_entities (FK, inferred); contacts↔operations: join `contact_operations` (M:N likely)
- fields.billing_entity_id → billing_entities (FK)
- field_seasons.field_id → fields (FK); field_seasons↔products_services (service_type): join `field_season_services` or FK if always 1
- probes.billing_entity_id → billing_entities (FK ✔ ≤1; 69 null)
- probes↔contacts: **join `probe_contacts` ✔ (28 probes have 2 contacts)**
- probe_rack.probe_id → probes (FK ✔ ≤1 per probe; 167 probes unracked) + unique(rack, rack_slot)
- probe_assignments.field_season_id → field_seasons (FK ✔ ≤1, 5 null); probe_assignments.probe_id → probes (FK ✔ ≤1, 17 null)
- repairs.field_season_id → field_seasons; repairs.probe_assignment_id → probe_assignments (PA has 0–4 repairs ✔ ⇒ FK lives on repairs)
- water_recs.field_season_id → field_seasons
- invoices.billing_entity_id → billing_entities; invoice_lines.invoice_id → invoices; invoice_lines.field_season_id → field_seasons
- weather_stations.billing_entity_id, orders.billing_entity_id → billing_entities; order_items.order_id → orders; order_items.product_id → products_services
- notifications.operation_id → operations; notifications.field_id → fields
- Every link appears on both tables in Baserow (reverse fields, e.g. billing_entities.fields, fields.field_seasons) — model once as FK on the child, drop the reverse column.

## Tricky bits / risks
1. **water_recs = 15,767 rows (76% of all data)** — paginate export (200/page cap via MCP ⇒ ~79 pages; use REST API size=200 with script). report_type has overlapping values (full_report vs full, water_day_update vs update) — normalize.
2. **File fields → Supabase Storage**: probe_assignments.install_photo_field_end (213 rows), install_photo_extra (10), removal_photo (23, some 2 files); documents.file (8). Baserow file URLs are signed/expiring — download and re-upload during migration, store storage paths (jsonb array).
3. **Formula/lookup (derived, don't store)**: fields.ai_ufid (formula), field_seasons.record_name (formula) + entity (lookup), probe_assignments.record_name (formula) + Field + season (lookups), water_recs.field (lookup). Recreate as views/generated columns; app reads these names.
4. **Probe serials**: no duplicate non-null serial_number across 597 probes ✔, but **62 probes have null serial** ⇒ unique index must be partial (WHERE serial_number IS NOT NULL). Serial is a number type in Baserow; store as text to preserve any leading zeros/future formats. repairs.new_probe_serial is free text (not a FK).
5. **Selects editable from the app** (/api/select-options adds options live via JWT): use lookup tables or text+CHECK, not Postgres ENUMs, for app-editable ones; ENUMs fine for stable ones (invoice status, user role). Several people-name selects (planned_installer, remover, planned_remover) + free-text installer/removed_by — consider an `installers`/staff FK.
6. **Multi-select**: contacts.customer_type (11 options) → text[] or join `contact_customer_types`.
7. Field names with spaces/punctuation: `Solo?` (probes), `Item Name`, `Address`, `Field`, `Active` — app normalizeKeys() relies on space→underscore; rename to snake_case and update types.
8. users.password_hash lives in Baserow (auth.ts) — migrate to Supabase Auth or keep bcrypt hash table with RLS no-public-access. installers.pin plaintext — hash.
9. Dates: date_include_time per field noted (timestamptz vs date); Baserow returns UTC.
10. journal (1035630) is not referenced by the app; notifications is empty (0 rows).
11. Every link field returns arrays; app code assumes `[{id,value}]` shape everywhere — the data layer (lib/baserow.ts) needs an adapter or a full rewrite to supabase-js.

## Recommended migration order
1. Create a new dedicated Supabase project (e.g. `acre-ops`); don't reuse `reminders`.
2. Lookup/enums + standalone: products_services, inventory, users, installers, mileage_logs, journal, documents(+Storage).
3. billing_entities → contacts (+contact_operations, operations) → fields → weather_stations.
4. field_seasons (+service link) → probes → probe_contacts → probe_rack.
5. probe_assignments (+photos to Storage) → repairs → water_recs (bulk).
6. invoices → invoice_lines; orders → order_items; notifications.
7. Views for formula/lookup fields; FK validation & row-count reconciliation; then swap lib/baserow.ts for a Supabase data layer behind the same function signatures; run Baserow read-only in parallel during a cutover window (off-season, after removals).
## Tables

### contacts (Baserow 817294) — 117 rows → `public.contacts`  
App: /api/contacts + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| name | text | text |  |
| email | text | text |  |
| phone | phone_number | text |  |
| address | long_text | text |  |
| customer_type | multiple_select | enum[] / join | options: Current Customer, Past Customer, Weather Station, Agronomist, Landlord, Retired, Prospect, Probe, Hired Hand, Probe - Complete DIY, Probe - DIY |
| notes | long_text | text |  |
| cropx_username | text | text |  |
| date_entered | date | timestamptz |  |
| operations | link_row | FK / join | → operations |
| is_main_contact | single_select | enum | options: Yes, No |
| address_lat | number | numeric |  |
| address_lng | number | numeric |  |
| billing_entity | link_row | FK / join | → billing_entities |
| soil_temp_updates | boolean | boolean |  |
| android | boolean | boolean |  |

### operations (Baserow 817295) — 66 rows → `public.operations`  
App: /api/operations + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| name | text | text |  |
| notes | long_text | text |  |
| approval_token | text | text |  |
| notifications | link_row | FK / join | → notifications |

### billing_entities (Baserow 817297) — 151 rows → `public.billing_entities`  
App: /api/billing-entities + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| name | text | text |  |
| notes | long_text | text |  |
| fields | link_row | FK / join | → fields |
| invoices | link_row | FK / join | → invoices |
| Address | long_text | text |  |
| weather_stations | link_row | FK / join | → weather_stations |
| orders | link_row | FK / join | → orders |
| self_install | boolean | boolean |  |

### fields (Baserow 817298) — 594 rows → `public.fields`  
App: /api/fields + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| name | text | text |  |
| billing_entity | link_row | FK / join | → billing_entities (reverse side of same link; don't create twice) |
| acres | number | numeric |  |
| pivot_acres | number | numeric |  |
| lat | number | numeric |  |
| lng | number | numeric |  |
| water_source | single_select | enum | options: Well, Canal, Other, Dryland |
| fuel_source | single_select | enum | options: Natural Gas, Diesel, Other, Electric - Full Power, Electric - Anytime Interrupt, Electric - Two Day Interrupt, Electric - Three Day Interrupt, Electric - Four Day Interrupt, Propane |
| notes | long_text | text |  |
| field_seasons | link_row | FK / join | → field_seasons |
| elevation | number | integer |  |
| soil_type | text | text |  |
| placement_notes | long_text | text |  |
| irrigation_type | single_select | enum | options: Pivot, Gravity, Drip, Dryland, Pivot - Corner System, Pivot - Wiper, Pivot - Wiper Corner System |
| row_direction | single_select | enum | options: N-S, E-W, N-S and E-W, NW-SE, SE-SW, Mix |
| drip_tubing_direction | single_select | enum | options: N-S, E-W |
| drip_tubing_spacing | number | integer |  |
| drip_emitter_spacing | number | integer |  |
| drip_zones | number | integer |  |
| drip_gpm | number | integer |  |
| drip_depth | number | integer |  |
| field_directions | text | text |  |
| install_directions | long_text | text |  |
| nrcs_field | boolean | boolean |  |
| plss_township | number | integer |  |
| plss_range | number | integer |  |
| plss_section | number | integer |  |
| plss_description | long_text | text |  |
| cropx_field_uuid | text | text |  |
| ai_ufid | formula | DERIVED (view/generated) |  formula: `concat(
  right(left("FJKRTXY2345679", mod(row_id(), 14) + 1), 1),
  right(left("FJKRTXY2345679", mod(floor(row_id() / 14), 14) + 1), 1),
  right(left("FJKRTXY2345679", mod(floor(row_id() / 196), 14) + 1), 1),
  right(left("JKRTXY2345679", mod(floor(row_id() / 2744), 14) + 1), 1)
)` |

### probes (Baserow 817299) — 597 rows → `public.probes`  
App: /api/probes + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| serial_number | number | integer |  |
| year_new | number | integer |  |
| status | single_select | enum | options: In Stock, Assigned, Installed, RMA, Retired, On Order, On Order - Trade, Trade Ordered, Unknown, No Trade, In Crate for Shipment, Trade Ordered - In Crate, Lost |
| notes | long_text | text |  |
| probe_assignments | link_row | FK / join | → probe_assignments |
| billing_entity | link_row | FK / join | → billing_entities |
| damages_repairs | text | text |  |
| date_created | date | date |  |
| contact | link_row | FK / join | → contacts |
| brand | single_select | enum | options: CropX V4, Sentek 36"/Sentek Rocket DTU, Sentek 36"/CropX Gateway (Small Diameter), Sentek 36"/CropX Gateway (Large Diameter), Sentek 48” Blue/Sentek Rocket, CropX Apex 36" |
| trade_year | single_select | enum | options: 2026, 2027 |
| is_trade | boolean | boolean |  |
| Solo? | boolean | boolean |  |
| probe_rack | link_row | FK / join | → probe_rack |

### field_seasons (Baserow 817300) — 663 rows → `public.field_seasons`  
App: /api/field-seasons + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| record_name | formula | DERIVED (view/generated) |  formula: `concat(lookup('field', 'billing_entity'), ' - ', lookup('field', 'name'), ' - ', field('season'))` |
| field | link_row | FK / join | → fields (reverse side of same link; don't create twice) |
| season | number | integer |  |
| crop | single_select | enum | options: Corn, Soybeans, Wheat, Seed Corn, Other, Popcorn |
| service_type | link_row | FK / join | → products_services |
| removal_date | date | date |  |
| removal_notes | long_text | text |  |
| repairs | link_row | FK / join | → repairs |
| water_recs | link_row | FK / join | → water_recs |
| invoice_lines | link_row | FK / join | → invoice_lines |
| approval_status | single_select | enum | options: Approved, Pending, Change Requested |
| approval_notes | long_text | text |  |
| approval_date | date | timestamptz |  |
| crop_confirmed | boolean | boolean |  |
| route_order | text | text |  |
| planned_installer | single_select | enum | options: Brian, Daine, Ryan |
| ready_to_install | boolean | boolean |  |
| probe_assignments | link_row | FK / join | → probe_assignments |
| side_dress | single_select | enum | options: Low Y-Drop, High Y-Drop, Coulter 1-5" off row, Coulter 5-10" off Row, Coulter 10-15" off row, Sprayer Drops, None, Cultivate, Cultivation Likely, Pivot |
| logger_id | text | text |  |
| early_removal | single_select | enum | options: Regular, Silage, Soybeans, HMC, HMC – Oct 1, Dummy Probe – Drip, Popcorn, HMC Maybe, Early Incentive Corn, Seed Corn, Sorghum |
| hybrid_variety | text | text |  |
| ready_to_remove | single_select | enum | options: Yes, No |
| remover | single_select | enum | options: Ryan, Daine, Jeremy, Brian, Joe, Josh, None Yet, Carter, Brandon |
| planting_date | date | date |  |
| entity | lookup | DERIVED (view/join) |  formula: `lookup('field','billing_entity')` |
| early_install | single_select | enum | options: Yes, No, Qualifies |
| install_group | number | integer |  |
| field_note | long_text | text |  |
| irrigator | text | text |  |
| planned_remover | single_select | enum | options: Ryan, Brian, Carter, Jeremy, Daine, Brandon |
| removal_priority | single_select | enum | options: Priority, Normal |

### repairs (Baserow 817301) — 127 rows → `public.repairs`  
App: /api/repairs + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| record_name | text | text |  |
| field_season | link_row | FK / join | → field_seasons (reverse side of same link; don't create twice) |
| reported_at | date | date |  |
| problem | text | text |  |
| fix | long_text | text |  |
| repaired_at | date | date |  |
| notified_customer | boolean | boolean |  |
| probe_assignment | link_row | FK / join | → probe_assignments |
| probe_replaced | boolean | boolean |  |
| new_probe_serial | text | text |  |
| watch_list | boolean | boolean |  |

### water_recs (Baserow 817302) — 15767 rows → `public.water_recs`  
App: /api/water-recs + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| record_name | autonumber | bigint identity |  |
| field_season | link_row | FK / join | → field_seasons (reverse side of same link; don't create twice) |
| date | date | date |  |
| recommendation | long_text | text |  |
| suggested_water_day | text | text |  |
| priority | boolean | boolean |  |
| report_type | single_select | enum | options: full_report, water_day_update, full, update, overview, farm_insight |
| field | lookup | DERIVED (view/join) |  formula: `lookup('field_season','field')` |

### invoices (Baserow 817303) — 82 rows → `public.invoices`  
App: /api/invoices + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| record_name | text | text |  |
| billing_entity | link_row | FK / join | → billing_entities (reverse side of same link; don't create twice) |
| season | number | integer |  |
| amount | number | numeric |  |
| status | single_select | enum | options: Draft, Sent, Paid |
| sent_at | date | date |  |
| paid_at | date | date |  |
| notes | long_text | text |  |
| invoice_lines | link_row | FK / join | → invoice_lines |
| check_number | number | integer |  |
| actual_billed_amount | number | numeric |  |
| invoice_number | number | integer |  |
| matched_in_qb | boolean | boolean |  |

### invoice_lines (Baserow 817304) — 59 rows → `public.invoice_lines`  
App: /api/invoice-lines + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| record_name | text | text |  |
| invoice | link_row | FK / join | → invoices (reverse side of same link; don't create twice) |
| field_season | link_row | FK / join | → field_seasons (reverse side of same link; don't create twice) |
| service_type | text | text |  |
| rate | number | numeric |  |
| quantity | number | integer |  |

### probe_assignments (Baserow 819350) — 724 rows → `public.probe_assignments`  
App: /api/probe-assignments + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| record_name | formula | DERIVED (view/generated) |  formula: `concat(lookup('field_season', 'season'), ' - ', lookup('field_season', 'field'), ' - ', lookup('probe', 'serial_number'))` |
| field_season | link_row | FK / join | → field_seasons (reverse side of same link; don't create twice) |
| probe | link_row | FK / join | → probes (reverse side of same link; don't create twice) |
| placement_order | number | integer |  |
| placement_lat | number | numeric |  |
| placement_lng | number | numeric |  |
| elevation | number | integer |  |
| soil_type | text | text |  |
| placement_notes | long_text | text |  |
| approval_status | single_select | enum | options: Pending, Approved, Change Requested |
| approval_notes | long_text | text |  |
| approval_date | date | date |  |
| probe_status | single_select | enum | options: Unassigned, Assigned, Installed, Removed, Ready to Enter Serial, Trade-In |
| route_order | number | integer |  |
| ready_to_install | boolean | boolean |  |
| installer | text | text |  |
| install_date | date | timestamptz |  |
| install_lat | number | numeric |  |
| install_lng | number | numeric |  |
| install_photo_field_end | file | jsonb (→ Storage) |  |
| install_photo_extra | file | jsonb (→ Storage) |  |
| install_notes | long_text | text |  |
| cropx_telemetry_id | text | text |  |
| signal_strength | text | text |  |
| crop_confirmed | boolean | boolean |  |
| removal_date | date | date |  |
| removal_notes | long_text | text |  |
| repairs | link_row | FK / join | → repairs (reverse side of same link; don't create twice) |
| probe_number | number | integer |  |
| battery_type | single_select | enum | options: CropX, Sentek New, Sentek Used |
| antenna_type | single_select | enum | options: Sentek Stub, CropX Stub, Sentek 10', CropX 10', CropX 6', ASK, CropX Stub + White Flag, CropX Stub + No Flag |
| Field | lookup | DERIVED (view/join) |  formula: `lookup('field_season','field')` |
| season | lookup | DERIVED (view/join) |  formula: `lookup('field_season','season')` |
| label | text | text |  |
| approval_sent | date | date |  |
| grower_notified | date | date |  |
| pickup_access | text | text |  |
| removed_by | text | text |  |
| removal_photo | file | jsonb (→ Storage) |  |
| planned_remover | text | text |  |

### products_services (Baserow 826849) — 39 rows → `public.products_services`  
App: /api/products-services + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| service_type | text | text |  |
| rate | number | numeric |  |
| dealer_fee | number | numeric |  |
| description | long_text | text |  |
| status | single_select | enum | options: Active, Inactive |
| field_seasons | link_row | FK / join | → field_seasons (reverse side of same link; don't create twice) |
| category | single_select | enum | options: Probe Service, Weather Station Sale, Weather Station Subscription, Other |
| unit | single_select | enum | options: Per Acre, Per Station, Flat Fee, Annual |
| active | boolean | boolean |  |
| order_items | link_row | FK / join | → order_items |

### inventory (Baserow 827222) — 11 rows → `public.inventory`  
App: /api/inventory + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| Item Name | text | text |  |
| Quantity | number | integer |  |

### users (Baserow 828606) — 2 rows → `public.users`  
App: auth.ts login (password_hash) + /api/register

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| email | text | text |  |
| password_hash | long_text | text |  |
| name | text | text |  |
| role | single_select | enum | options: admin, installer |
| active | boolean | boolean |  |
| created_at | date | timestamptz |  |
| last_login | date | timestamptz |  |

### weather_stations (Baserow 831050) — 63 rows → `public.weather_stations`  
App: /api/weather-stations + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| station_name | text | text |  |
| model | text | text |  |
| billing_entity | link_row | FK / join | → billing_entities (reverse side of same link; don't create twice) |
| install_lat | number | numeric |  |
| install_lng | number | numeric |  |
| install_date | date | date |  |
| connectivity_type | single_select | enum | options: WiFi, Cellular, Other |
| status | single_select | enum | options: Active, Offline, Decommissioned |
| price_paid | number | numeric |  |
| notes | long_text | text |  |

### orders (Baserow 831072) — 13 rows → `public.orders`  
App: /api/orders + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| order_id | autonumber | bigint identity |  |
| billing_entity | link_row | FK / join | → billing_entities (reverse side of same link; don't create twice) |
| order_date | date | date |  |
| status | single_select | enum | options: Quote, Ordered, Shipped, Received, Fulfilled |
| tracking_number | text | text |  |
| notes | long_text | text |  |
| valid_until | date | date |  |
| order_items | link_row | FK / join | → order_items |

### order_items (Baserow 831073) — 32 rows → `public.order_items`  
App: /api/order-items + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| item_id | autonumber | bigint identity |  |
| order_link | link_row | FK / join | → orders (reverse side of same link; don't create twice) |
| product | link_row | FK / join | → products_services (reverse side of same link; don't create twice) |
| quantity | number | integer |  |
| unit_price | number | numeric |  |
| notes | long_text | text |  |

### notifications (Baserow 854433) — 0 rows → `public.notifications`  
App: /api/notifications + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| field_name | text | text |  |
| operation | link_row | FK / join | → operations (reverse side of same link; don't create twice) |
| changed_field | link_row | FK / join | → fields |
| new_value | text | text |  |
| page_type | single_select | enum | options: field-info, approval |
| read | boolean | boolean |  |

### documents (Baserow 861653) — 8 rows → `public.documents`  
App: /api/documents + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| name | text | text |  |
| file | file | jsonb (→ Storage) |  |
| description | long_text | text |  |
| uploaded_by | text | text |  |
| uploaded_at | date | timestamptz |  |

### probe_rack (Baserow 934076) — 576 rows → `public.probe_rack`  
App: /api/probe-rack + pages

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| rack | text | text |  |
| rack_slot | number | integer |  |
| probe | link_row | FK / join | → probes (reverse side of same link; don't create twice) |

### installers (Baserow 939826) — 7 rows → `public.installers`  
App: /api/installer-pins, installer-auth

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| name | text | text |  |
| pin | text | text |  |

### mileage_logs (Baserow 982999) — 17 rows → `public.mileage_logs`  
App: /api/mileage (CRUD)

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| date | date | date |  |
| notes | long_text | text |  |
| installer | text | text |  |
| start_miles | number | numeric |  |
| end_miles | number | numeric |  |

### journal (Baserow 1035630) — 5 rows → `public.journal`  
App: NOT referenced by app (not in TABLE_IDS)

| field | baserow type | pg | notes |
|---|---|---|---|
| id | row id | bigint PK | keep Baserow ids to preserve links |
| date | date | timestamptz |  |
| entry | long_text | text |  |
| Active | boolean | boolean |  |