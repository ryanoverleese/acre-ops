# Step 6 — Supabase app switch review

Date: 2026-10-12. Branch: `supabase-schema`. Target: Acre Ops only, `junawlttpyztjlnbmvcb`.

## Status and commits

Implementation is committed locally and locally tested. **Not pushed or deployed. No Netlify configuration was changed.** This is a branch-test implementation, not a production cutover approval.

- `ed1cd5c385270affb74f3bd528fe1106b1bfbe57`: cherry-pick of main's `5b2c4672907314fae8fc44f41bcc7b763feb57e3`, retaining crew-only CropX notification semantics.
- `3a26851d93fbc4b3bd271f2a21bdaa3d2a7f12c0`: Supabase application adapter/routes, authorization and Storage, equal field-charge allocation, tests.
- This report is a separate documentation commit; see Git history.

Main remains at `5b2c4672907314fae8fc44f41bcc7b763feb57e3`. The stash “wip hold for autosave” remains at `65856746e3c4f7b1776f6680aef1dc5b7ba7b408`; neither applied nor dropped. No Baserow reads/writes, live application writes, imports, schema/grant/policy changes, real webhooks, or writes to other projects were performed during Step 6. A limited read-only check of this Supabase project was performed, described below.

## Implementation

- `lib/baserow.ts` remains the compatibility facade. Forty existing data helper exports remain; the obsolete Baserow-JWT helper is removed with its callers. Server-only `lib/supabase/*` uses parameterized Postgres queries, allowlisted metadata generated from the reviewed migrations, and native Supabase IDs. There is no runtime Baserow HTTP transport in app/lib/components.
- Hydration returns dropdown objects, ordered link arrays, calculated view columns, numeric values, dates, file DTOs and the existing route-specific list/search envelopes. Reads page through complete datasets; a small batch size does not truncate water recommendations. Unknown writes/filters fail rather than broadening scope.
- All eight relationship tables are read/written transactionally. **All field billing comes from `field_billing_entities`; the deprecated scalar is never a fallback.** Multi-entity field membership is retained in grower/operation grouping and customer-token ownership. Shared billing is not silently collapsed by single-value editors.
- `lib/billing-allocation.ts` and `/api/billing/enroll` split the WHOLE field charge evenly among every linked entity. Two recipients receive 50/50. Integer-cent allocation assigns a leftover cent in stable entity-ID order; the shares add up exactly. Shared invoice lines use quantity one and rate equal to that entity's allocated total. Single-recipient rates/quantities retain their prior representation.
- The Billing screen displays each recipient's separate charge and share percentage, saved prices rather than current catalog prices, and cents. Split bulk-discount calculations follow the same penny allocation. Unsaved projections are labeled estimates. Existing partial/unequal draft allocations require the explicit “Save equal shares” action; imported historical invoices were **not** rewritten during this task. Non-draft, duplicate or detached-recipient charges reject automatic reallocation for review.
- Multi-table actions include field setup, billing enrollment, install/removal, fulfillment, bulk season/assignment creation, water-rec replacement, RMA and checked rack move/undo. Actions use database transactions and an app-wide transaction advisory lock to prevent concurrent app write races without changing schema. Storage/network work stays outside the short database transaction; new uploads are cleaned up on failed saves.
- Private files retain stored `{bucket,path,name,size,mime}` references. Browser DTOs use authorized application URLs with `name,url,mime_type,size,is_image`. After authorization, downloads redirect to short-lived signed Storage URLs. The bucket stays private. Both opaque secret keys and legacy service-role JWTs are supported; no service key is sent to clients.
- NextAuth/bcrypt continues to use `users.password_hash`, active/role checks and `last_login`. Staff API writes are authorized server-side. Crew PINs are verified only on the server, new PINs are bcrypt-hashed, and the browser receives only names, IDs and `pinSet`, not PINs. Signed, HTTP-only crew sessions replace client-only authentication. Customer edits verify ownership through contacts → billing entities → field-billing join.
- Auth/session and installer/operation caches use a new backend namespace so old Baserow numeric IDs are not reused as Supabase IDs. Old ID-bearing bookmarks/bots must not be assumed compatible; `baserow_id` is retained only as the crosswalk.
- Options are edited in their existing Supabase lookup tables. Removed choices are retired, not erased from historical records. Metadata `fieldId` is a stable allowlisted catalog index on this branch, not a Baserow schema-field ID.
- Notification DTO `field` maps to the existing SQL `changed_field` FK; DTO `changed_field` (the changed-attribute label) maps to SQL `field_name`. “Field Info” is explicitly normalized to the catalog's `field-info`. No new column or silently invented option is used.
- The two old planting-update scripts fail closed on this branch, preventing accidental Baserow writes or applying legacy numeric IDs to Supabase. The read-only-source importer remains a separate explicit tool and was not run.

## Route reconciliation against the 83-route plan

All **60 direct** Baserow route files changed, plus **15 of 16 indirect** route files: **75 changed, 8 unchanged**. The remaining indirect route is the thin NextAuth handler, converted through `auth.ts`. Seven non-database/inert routes required no database change. Four legacy maintenance routes now return 410 instead of modifying Baserow or executing an old backfill.

Two new routes (outside the original 83): `app/api/equipment/actions/route.ts` for transactional RMA/rack/edit actions, and `app/api/files/[table]/[id]/[column]/[index]/route.ts` for authorized private downloads.

D = direct Baserow caller in the plan; A = adapter/indirect; — = non-database/inert.

| Planned route file | Plan | Result | Notes |
|---|---|---|---|
| `app/api/ask/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/auth/[...nextauth]/route.ts` | A | Unchanged | Unchanged thin handler; auth.ts and private credential lookup now use Supabase. |
| `app/api/backup/route.ts` | D | Changed | Authorized Supabase DTO export; excludes users/installers credentials. |
| `app/api/billing-entities/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/billing-entities/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/billing/enroll/route.ts` | D | Changed | Transactional equal allocation to every linked entity; one charge per entity; cents preserved. |
| `app/api/bookings/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/contacts/[id]/operations/route.ts` | D | Changed | Transactional join edits; preserves DELETE operationId query parameter and POST row response. |
| `app/api/contacts/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/contacts/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/debug/ensure-removal-priority/route.ts` | D | Changed — retired, HTTP 410 | Baserow schema/maintenance operation disabled; no data migration is run. |
| `app/api/debug/field-names/route.ts` | D | Changed — retired, HTTP 410 | Baserow schema/maintenance operation disabled; no data migration is run. |
| `app/api/debug/health/route.ts` | D | Changed | Admin-only safe Postgres health query. |
| `app/api/debug/order-items/route.ts` | D | Changed — retired, HTTP 410 | Baserow schema/maintenance operation disabled; no data migration is run. |
| `app/api/documents/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/documents/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/elevation/route.ts` | — | Unchanged | Unchanged external elevation lookup. |
| `app/api/field-info/route.ts` | D | Changed | Customer token ownership through full field-billing join; scoped transactional save + notification. |
| `app/api/field-seasons/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/field-seasons/bulk/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/field-seasons/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/fields/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/fields/route.ts` | D | Changed | Atomic field, join, season, services and optional assignment creation. |
| `app/api/fields/season-data/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/gdu/route.ts` | — | Unchanged | Unchanged external weather/GDU calculation; no database transport. |
| `app/api/geocode/route.ts` | — | Unchanged | Unchanged external geocoding. |
| `app/api/install/route.ts` | D | Changed | Private uploads, selected-device conflict checks, transactional installation. |
| `app/api/installer-auth/route.ts` | A | Changed | Server-only PIN verification and signed HTTP-only crew session. |
| `app/api/installer-pins/route.ts` | D | Changed | Names/pinSet only on reads; admin-only hashed PIN writes. |
| `app/api/installer/assignments/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/installer/fields/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/installer/history/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/installer/locations/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/installer/probe-index/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/installer/probe-search/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/installer/removals/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/installer/repairs/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/installer/summary/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/installer/unassigned-probes/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/inventory/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/inventory/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/invoice-lines/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/invoice-lines/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/invoices/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/invoices/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/log-removal/route.ts` | D | Changed | Transactional RMA document-note append. |
| `app/api/migrate/probe-to-assignments/route.ts` | — | Unchanged | Unchanged, already inert; no migration is executed. |
| `app/api/mileage/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/notifications/route.ts` | A | Changed | Explicit label/link schema mapping; atomic bulk mark-read. |
| `app/api/operations/[id]/approval-token/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/operations/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/operations/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/order-items/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/order-items/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/orders/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/orders/fulfill/route.ts` | D | Changed | Server-derived order quantity; exact, entity-scoped assignment set; ambiguous selection rejected. |
| `app/api/orders/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/ping/route.ts` | — | Unchanged | Unchanged connectivity response. |
| `app/api/plss/lookup/route.ts` | — | Unchanged | Unchanged external PLSS lookup. |
| `app/api/probe-assignments/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/probe-assignments/backfill/route.ts` | D | Changed — retired, HTTP 410 | Baserow schema/maintenance operation disabled; no data migration is run. |
| `app/api/probe-assignments/bulk/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/probe-assignments/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/probe-rack/[id]/route.ts` | A | Changed | Authorized Supabase-backed compatible helper/DTO. |
| `app/api/probe-rack/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/probe-rack/sync/route.ts` | D | Changed | Explicit admin-only transactional reconciliation; never executed during this work. |
| `app/api/probes/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/probes/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/products-services/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/products-services/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/pulled-today/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/register/route.ts` | D | Changed | Administrator-only bcrypt user creation. |
| `app/api/removal/route.ts` | D | Changed | Shared removal action; selected assignment + probe transaction; crew-only post-commit dry-run webhook. |
| `app/api/repairs/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/repairs/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/select-options/route.ts` | D | Changed | Allowlisted lookup-table add/rename/reorder/retire; no schema or Baserow writes. |
| `app/api/soil/route.ts` | — | Unchanged | Unchanged external soil lookup. |
| `app/api/water-recs/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/water-recs/bulk/route.ts` | D | Changed | Transactional exact date/report-type replacement, idempotent retries, empty request inert. |
| `app/api/water-recs/field-note/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/water-recs/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/weather-stations/[id]/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |
| `app/api/weather-stations/route.ts` | D | Changed | Direct Baserow transport replaced with authorized Supabase adapter/action; response envelope retained. |

## Cache invalidation — every touched table

A successful transaction records its touched physical tables, commits, then immediately expires each table tag using `revalidateTag(tag, {expire: 0})`. Rolled-back writes do not invalidate. The shared data tag and options tag are also expired, so dependent calculated views, inverse relationship labels, lookup labels, grower lists and pages are refreshed even when the changed table is not their primary cached source. Credentials are never put in the shared Next data cache.

Base tables covered (22): `products_services`, `inventory`, `users`, `installers`, `mileage_logs`, `documents`, `billing_entities`, `contacts`, `operations`, `fields`, `weather_stations`, `field_seasons`, `probes`, `probe_rack`, `probe_assignments`, `repairs`, `water_recs`, `invoices`, `invoice_lines`, `orders`, `order_items`, `notifications`.

Relationship tables covered (8): `field_billing_entities`, `contact_operations`, `contact_billing_entities`, `contact_customer_types`, `probe_contacts`, `probe_billing_entities`, `probe_owner_operations`, `field_season_services`. Join replacement/clear records the join and base table; deletes also invalidate the join tables affected by FK cascades.

Editable option tables covered (35): `contact_customer_type_options`, `contact_main_contact_options`, `field_water_source_options`, `field_fuel_source_options`, `field_irrigation_type_options`, `field_row_direction_options`, `field_drip_tubing_direction_options`, `probe_brand_options`, `probe_status_options`, `probe_rack_options`, `probe_trade_year_options`, `field_season_crop_options`, `field_season_side_dress_options`, `field_season_early_removal_options`, `field_season_early_install_options`, `field_season_ready_to_remove_options`, `field_season_planned_installer_options`, `field_season_planned_remover_options`, `field_season_remover_options`, `field_season_removal_priority_options`, `field_season_approval_status_options`, `assignment_antenna_type_options`, `assignment_battery_type_options`, `assignment_probe_status_options`, `assignment_approval_status_options`, `invoice_status_options`, `product_category_options`, `product_unit_options`, `product_status_options`, `inventory_category_options`, `user_role_options`, `weather_station_connectivity_options`, `weather_station_status_options`, `order_status_options`, `notification_page_type_options`.

| Action | Physical tables touched/invalidate |
|---|---|
| Field create + season | fields, field_billing_entities, field_seasons, field_season_services; probe_assignments when requested |
| Field membership edit | fields, field_billing_entities |
| Contact relationship edit | contacts, contact_operations and/or contact_billing_entities/contact_customer_types |
| Probe relationship edit | probes and the supplied probe_contacts/probe_billing_entities/probe_owner_operations joins |
| Billing equal-share enrollment | invoices, invoice_lines for every linked recipient |
| Install | selected probe_assignments and field_seasons when crop changes |
| Removal | selected probe_assignments and its single linked probes row; never field_seasons/planned_remover/siblings |
| RMA | probes, selected current-season probe_assignments, probe_rack, documents |
| Rack move/undo | source and destination probe_rack rows |
| Fulfillment | exact selected probe_assignments, orders |
| Water bulk replacement | water_recs |
| Water field note | field_seasons |
| Customer field-info update | fields or field_seasons; field_billing_entities only for an allowed membership change; notifications |
| RMA log append | documents |
| Authentication | users for last_login; installers for explicit PIN administration |
| Dropdown save | the exact allowlisted *_options table |
| Other CRUD | named base table and any supplied/affected relationship tables |

The shared expiry deliberately covers more than the minimal dependencies. It avoids stale results at the current scale; optimize only after profiling.

## Verification

- `node --test tests/supabase/contract.test.cjs tests/removal.test.mjs scripts/import-baserow.test.mjs`: **69 passed**, zero failures/skips (23 Supabase contracts, 15 shared-removal tests, 31 importer tests).
- `npx tsc --noEmit --incremental false`: passed.
- Production `npm run build`: passed, with database connection variables and Storage key disabled for the build. Pages are dynamic; private data is not embedded into a static build. Next's existing middleware→proxy deprecation warning remains.
- `tests/equipment/smoke.mjs`: **10 passed**, including real production-build Billing rendering of a saved $300 charge as two $150 charges, rack move/undo, RMA, registration, login gating and phone/tablet layout.
- `tests/removal/smoke.mjs`: **4 passed**, including selected-device scope, actual remover/date, untouched planning/sibling, zero Workflows notifications, one crew dry-run notification and retry history.
- Browser tests use the actual migrations in isolated PGlite databases and block external traffic. Synthetic authenticated sessions test access, not a live user's password. Crew-role notification-list requests are denied (403) by design; no browser runtime errors.
- Read-only live check: connection succeeded through `DATABASE_URL_ALT` after primary failed. Confirmed target project, private Storage bucket authentication, **65/65 tables with RLS**, **15 security-invoker views**, 595 field-billing links across 593 fields, and 15,767 water recommendation rows. No database or Storage writes.
- Static transport scan: zero runtime Baserow URL/token/schema-transport references in app/lib/components. Git whitespace checks and a secret-pattern scan of 139 changed/new implementation files passed. No credentials or generated private import manifests/reports committed.
- All local tests use synthetic data. Actual user login, live upload/download, a Netlify-hosted function/connection pool, external geospatial services and the real CropX webhook receiver remain untested in this step.

## Branch-deploy environment — names only

Set only in the intended branch-deploy context; never overwrite production/main settings. Server-only secrets must not use a NEXT_PUBLIC prefix.

Required application configuration:

- `SUPABASE_URL`
- `DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_SECRET`
- `AUTH_URL`
- `AUTH_TRUST_HOST`
- `REMOVAL_WEBHOOK_DRY_RUN`

Optional/fallback configuration:

- `DATABASE_URL_ALT`
- `NEXTAUTH_SECRET` (legacy alternative to AUTH_SECRET)
- `NEXTAUTH_URL` (legacy alternative to AUTH_URL)
- `REMOVAL_WEBHOOK_URL`
- `REMOVAL_WEBHOOK_KEY` or `REMOVAL_WEBHOOK_AUTH`
- `ANTHROPIC_API_KEY` (Ask/AI Chat)

`COMMIT_REF` is supplied by Netlify for the version display; `NEXT_PUBLIC_GIT_SHA` is derived at build time. Neither Baserow credentials nor SUPABASE_ACCESS_TOKEN nor a browser Supabase key is required.

The database connection and Storage origin are pinned to the Acre Ops project. The branch must use dry-run removal notifications. **REMOVAL_WEBHOOK_DRY_RUN must be true**; the code additionally forces true on this branch. The payload still contains `serial`, `assignment_id`, `source: 'acre-ops'`, and `dry_run`; **assignment_id is now the native Supabase ID**, not the old Baserow ID. The receiver's crosswalk handling must be reviewed before any production notification is enabled.

## Review items and limits before deployment

1. **Dependency security gate:** npm audit reported 8 affected packages (3 critical, 4 high, 1 moderate): @auth/core, next-auth, next, sharp, postcss, nanoid, source-map-js and baseline-browser-mapping. Their installed versions are unchanged from 011039a. No automatic upgrade was applied during this database conversion. Review/update and retest before a public deployment; passing migration tests is not a security clearance.
2. Postgres and Storage access is privileged and server-only. Existing RLS/grants were preserved, not relaxed, but the configured backend role can bypass RLS. Route authorization is therefore essential. A dedicated least-privilege application database role is a separate hardening step; no new role/grants were created here.
3. Notifications' existing schema has a naming mismatch; the explicit mapping above preserves the app's current label + field-link contract without a schema change. Review that choice if other consumers expect SQL field_name to mean the literal field name.
4. Existing imported billing history is preserved until an explicit safe draft allocation save. Paid/non-draft invoices and ambiguous duplicate charges require review. Equal splitting applies to field charges, not independently owned probe purchases or weather-station bills.
5. Fulfillment no longer picks arbitrary first-N assignments. With the existing count-only UI, the eligible entity-linked On Order assignment count must exactly match the order. Ambiguous cases stop with an explanation; a future explicit assignment picker can submit the supported assignmentIds list.
6. PIN attempt throttling is in-memory per worker, not distributed. Crew sessions expire after 12 hours; PIN rotation does not immediately revoke already-issued sessions. These are known hardening limits, not claims of complete brute-force/revocation protection.
7. The app-wide write lock provides simple correctness but serializes writes. Compound server actions are atomic; separate UI steps (for example season save followed by billing enrollment, or trade-order preparation) are still separate requests. Billing failures are now surfaced instead of silently claiming the invoice saved.
8. Existing old numeric URLs, open forms and external bots need native-ID/crosswalk review. Backend namespaces protect the known installer/operation caches and auth sessions; no universal old-ID fallback is provided.
9. Branch data is the previously imported snapshot, not a live synchronized mirror of Baserow. No refresh import was requested or performed here.

Stop here. No branch push or deployment without Ryan's approval.

