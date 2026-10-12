# Acre Ops app switch plan: Baserow to Supabase

Date: 2026-10-12. Status: **read-only planning; not an app switch and not approval to implement or deploy.**

## Decision in plain English

Keep the familiar screens and API URLs. Replace the data-access implementation behind them with a server-only compatibility adapter that returns the same dropdown objects, ordered link arrays, file objects, and calculated labels. Then move every direct Baserow API caller behind that adapter. **Changing only `lib/baserow.ts` is insufficient: 60 of the 83 API route files currently contain direct Baserow transport/credentials.** Another 16 use the adapter or an indirect database helper; 7 do not access Baserow.

Most display-only pages are small changes or test-only once the adapter works. The bigger work is safe writes across related tables, authentication/authorization, files, editable dropdowns, and the exceptions below. Do not combine this with a menu or screen redesign.

**Field billing must read and write `public.field_billing_entities` for EVERY field. Never fall back to the deprecated `fields.billing_entity_id`.**

## Baseline and inspection scope

- Inspected checkout: `/Users/ryano/Documents/GitHub/acre-ops`, branch `supabase-schema`, starting commit `bee240bf73fccf6942c35552452f1246a02cd18c`.
- Main remains separately checked out at `/private/tmp/acre-ops-removal.xSETkI`, with unpushed amendment `5b2c4672907314fae8fc44f41bcc7b763feb57e3` replacing `bed6231`. It was inspected read-only, not merged, amended again, or pushed.
- The schema branch still has the **older** Workflows/removal implementation. Before future implementation, explicitly bring in the approved removal change: shared `recordProbeRemoval`, assignment Removed/date/actual remover, only its linked probe In Stock, no planned-remover changes, no sibling-probe changes, and **crew-only CropX notification**. Do not copy the old schema-branch removal behavior forward.
- Protected stash `wip hold for autosave`: `65856746e3c4f7b1776f6680aef1dc5b7ba7b408`; not applied or dropped.
- Static inventory: all 228 TypeScript/TSX/JavaScript files under `app/`, `components/`, `lib/`, `hooks/`, `public/installer/`, plus `auth.ts` and `middleware.ts`. Checked imports/re-exports, direct REST URLs, numeric table IDs, fetch/XHR API callers, dropdown `.value`, ordered link arrays, file arrays, filters, and indirect renderers. The tables below enumerate all 83 API routes, database-shaped readers, write clients, and relevant indirect surfaces. Generic shells/helpers with no database access are explicitly separated.
- Cross-checked `lib/baserow.ts`, `lib/fields-data.ts`, `lib/data-mappings.ts`, `supabase/baserow-inventory.md`, both committed migrations, and `supabase/PROJECT.md`.
- Existing migration/import results cited here are from those repository records, **not newly checked live data**. No environment secrets were read, no source/destination database was queried, and no HTTP app routes were executed for this plan.
- Documentation only: this task changes this file, commits it on `supabase-schema`, and appends a Notion journey-log bullet. No application code, SQL, main, Netlify, Baserow, or Supabase data/configuration changes.

### Effort legend

- **Small (S):** focused transport substitution or no page edit after the adapter, plus contract tests. Not a claim that the adapter itself is small.
- **Bigger (B):** requires a transaction, authorization/access design, Storage workflow, semantic/cardinality decision, or several coordinated call sites.
- **None (N):** no Baserow migration change; keep existing behavior and smoke-test.
- **S + billing:** basic transport/shape compatibility is small, but the multi-billing exception in section 3 must be fixed or explicitly handled; an unchanged first-link assumption is not sign-off.
- These are relative implementation sizes, not day estimates.

## 1. Compatibility adapter design

### 1.1 Keep the public module contract, change its internals

Retain `@/lib/baserow` as a transitional facade so imports stay stable. Separate browser-safe DTO/type definitions from server-only database/client/credential code. Do not bundle a secret key or Postgres connection in client components.

Proposed internal responsibilities (future files, **not created by this plan**): table/column registry; identity translation; row serializers; write decoders; option registry; Storage adapter; backend query/transaction helpers. Prefer server-only Supabase client transport for reads/simple operations and narrowly scoped transactional SQL functions for multi-table actions. The actual app dependencies, grants, policies, and functions must be reviewed in a later implementation change; the importer runtime is not an app runtime to copy wholesale.

| Existing surface in `lib/baserow.ts` | Supabase implementation / contract | Size |
|---|---|---|
| `TABLE_IDS`, `TableName` (lines 53–78) | Keep symbolic table keys and exported names during transition. Numeric Baserow table IDs are legacy metadata only, never Supabase resource addresses. Move all callers that construct URLs to symbolic operations. Registry maps 22 source tables to base tables, option tables, joins, read views, and DTO serializers. | B |
| `getRows<T>` (223), `getRow<T>` (325) | Query the registered source/read view, hydrate relations/options in bounded batches, serialize the existing DTO. `getRows` currently returns **all matching rows**, regardless of page-size chunks; it must not silently become one Supabase page. Stable order with an ID tie-breaker; do not drop rows with nullable/missing links. | B |
| `getCachedRows<T>` (253), `bustTableCache` (264) | Keep signatures and TTL behavior. Include backend/version/access scope in cache keys; invalidate immediately after committed writes using `revalidateTag(..., { expire: 0 })`. Invalidate dependent projections too, not only the physically changed table. Never globally cache an access-scoped or secret-bearing result. | B |
| `createRow<T>` (301), `updateRow<T>` (277) | Decode allowlisted keys, scalar/link/option/file inputs; transact scalar changes and join replacements; return a freshly hydrated DTO. Omitted property means unchanged; explicit null/empty relation means clear. No wholesale overwrites of unrelated probe/season state. | B |
| Typed `getContacts`, `getOperations`, `getBillingEntities`, `getFields`, `getProbes`, `getFieldSeasons`, `getRepairs`, `getWaterRecs`, `getInvoices`, `getInvoiceLines`, `getProbeAssignments`, `getProductsServices`, `getInventory`, `getWeatherStations`, `getOrders`, `getOrderItems`, `getUsers`, `getNotifications`, `getDocuments` | Keep names/signatures; route through the registry. Keep `getDocuments` descending uploaded-at ordering. User/password and installer PIN reads are private server operations, not generic browser datasets. | S after core |
| `getCachedContacts`, `getCachedOperations`, `getCachedBillingEntities`, `getCachedFields`, `getCachedProbes`, `getCachedFieldSeasons`, `getCachedRepairs`, `getCachedProbeAssignments` | Retain current helper names and intended fresh-vs-cached distinctions. Writes to relationships or display names invalidate all affected cached DTOs. | S after core |
| `getTableFieldOptions`, `getTableFieldOptionsWithMeta`, `getAllSelectOptions`, `getCachedAllSelectOptions`, `getAllSelectOptionsWithMeta` (719–832) | Read the 35 options tables by registered table/field name, ordered by `sort_order,id`, returning `{id,value,color}`. Preserve the map shape. `fieldId` is Baserow schema metadata, not an option ID: use a stable allowlisted compatibility registry or change the one Settings mutation contract to `{tableName,fieldName}`; do not send it to Supabase as a column ID. | B |
| `getBaserowJwt` (16) | No Supabase equivalent. Remove its callers from the app switch; schema editing becomes authorized option-row CRUD, not arbitrary DDL or Baserow JWT calls. Do not fake a JWT to keep these routes working. | B |
| `addSpaceVariants` (116), key normalization (105), filter types/options (87–102) | Temporarily accept old spaced and underscored aliases at the decoder, canonicalize once, reject conflicting duplicate aliases and unknown writable fields. Do not send both keys to Postgres. Normalizer actually replaces spaces; do not assume it lowercases case-sensitive `Field`. | S |
| Private `baserowFetch`, retry/semaphore, `BaserowResponse` (172 etc.) | Replace REST URLs, Token auth, `user_field_names`, `count/next/results` paging and rate-limit workaround. Keep API response envelopes only where clients need them, not in the database. Add missing internal delete/batch/filter helpers for direct-route migration. Idempotent retries must not duplicate creates. | B |

### 1.2 Exact row-shape responsibilities

| App shape / input | Required normalization and database source |
|---|---|
| Numeric `id`; links `[{id,value}]` | PostgreSQL `id` and `baserow_id` are different. Never use a Baserow ID directly as a PostgreSQL FK. Pick one API-ID convention consistently for top-level rows, linked IDs, form values, option IDs, map keys, and writes; see identity decision below. Labels come from the referenced table's Baserow primary/display field, not merely any convenient name column. |
| Single dropdown `{id,value,color}` or null | Read registered option FK plus options row; writes currently pass label strings or numeric option IDs. Resolve strictly within that column's options table; preserve zero/false; return null for an empty selection. Do not auto-create new options from arbitrary record writes. |
| Link arrays for single FKs | Return `[]` or a one-item array for field season → field, assignment → probe/season, invoice → entity, line → invoice/season, order item → order/product, station → entity, notification → operation/field, rack → probe. Decode old array/scalar route inputs to one FK; reject multiple links where the schema is single-valued instead of silently taking the first. |
| Multi-links / multi-selects | Use the 8 ordered join tables: `contact_operations`, `contact_billing_entities`, `contact_customer_types`, `probe_contacts`, `probe_billing_entities`, `probe_owner_operations`, `field_season_services`, **`field_billing_entities`**. Respect `position`; use target ID only as a deterministic tie-breaker. Return every linked record. Service type is a link to products/services, not an enum/dropdown to invent. |
| Strings/numbers/null | Imported blank text and serials are NULL. Preserve NULL in storage; serialize according to tested DTO expectations, not arbitrary empty-string inflation. Handle numeric strings and bigint safely before JSON (only safe integer IDs become JS numbers); money/coordinates must not accidentally concatenate. Keep dates as date-only strings where the schema says date, and timestamps with timezone where specified. |
| A/B removal route | `field_seasons.route_order` is text; `probe_assignments.route_order` is integer. Do not cast the A/B removal route into the install-order field. Actual `removed_by`, field-season planned-remover option, and assignment planned-remover text are different data. |
| Files `[{url,name,size,mime_type,is_image}]` | Stored JSON is `[{bucket,path,name,size,mime}]`, not a permanent public URL. Derive MIME aliases/image flag and provide an authorized download URL. Prefer an app download endpoint resolving the reference after access checks; alternatively short-lived signed URLs generated per request, not persisted or cached beyond expiry. Never make `baserow-import` public to preserve an old URL. Upload routes must change; Baserow `{name}` upload tokens cannot be accepted as Supabase Storage references. |
| Formula/lookup fields | Read the calculated views below, then apply DTO serialization: the SQL views are **not already Baserow-shaped**. For example view `probe_status` and `crop` labels are strings; the adapter must return option objects and link arrays where consumers expect them. Derived fields are read-only and excluded from base-table writes. |
| `user_field_names`, filters, search, batch envelopes | Replace at server boundary. Current generic `baserowFilters` implements five operators; actual adapter consumers filter season equality. Direct routes additionally use link-row membership, date equality/today in America/Chicago, JSON AND filters, serial search, sort, count, and pagination. Map them explicitly with safe identifiers and parameters; unsupported filters must error, not silently broaden scope. `FetchOptions.filters` is currently unused by the generic helper—do not mistake it for implemented semantics. |

**Recommended identity choice:** use PostgreSQL numeric IDs consistently inside the future app API, while preserving `baserow_id` as the immutable import/legacy crosswalk. The DTO's *shape* and function signatures stay the same, but old numeric ID *values* cannot be assumed to survive. At cutover, invalidate/version installer probe-index caches, selected-operation state and stale form state; expire/reissue sessions where an old user ID could be reused. Inventory customer links, webhook payloads and outside bots for embedded IDs. Keep explicit legacy-ID translation at identified integration boundaries; never guess “try native ID, then Baserow ID” because overlapping numbers can identify different rows.

If retaining every old numeric app ID is mandatory, decide that **before implementation**: add a separately reviewed stable API-ID mapping/column, initialize imports from `baserow_id`, allocate future IDs above the reserved legacy range, and use it everywhere. Do not fabricate `baserow_id` for Supabase-native rows and do not use `coalesce(baserow_id,id)` as a supposedly collision-free API ID. Neither extra schema nor ID migration is implemented here.

### 1.3 Calculated reads and table routing

| Logical table / relation | Read source and important differences |
|---|---|
| fields | `fields_calculated`: computed `ai_ufid`; billing array separately from `field_billing_entities`. For new native fields, review the formula's native-ID fallback against imported codes; it is not proof of uniqueness. Never store `ai_ufid` as editable text. |
| field_seasons | Updated `field_seasons_calculated` from the **second** migration: `record_name`, entity names and services derived through joins. Its scalar billing ID is NULL for multiple entities; do not use it as the authoritative link. |
| probe_assignments | `probe_assignments_calculated`: `record_name`, original-case `Field`, field/serial labels, effective placement. Keep raw saved coordinates separate from calculated fallbacks. |
| water_recs | `water_recs_calculated`: field lookup, stored `record_name` autonumber, report-type/day text. Do not merge report-type spellings; keep report scope exact. |
| products_services / order_items / orders | Corresponding `*_calculated` views supply margin/line totals/order totals. Product link display is the source service-type label; retain price snapshots rather than recalculating historical prices from today's catalog. |
| invoice_lines / invoices | Corresponding calculated views; preserve source `record_name`, invoice IDs/numbers and saved amounts. UI seasonal projections/discounts are not the same as ledger totals. Explicit quantity zero is not missing quantity. |
| notifications | `notifications_calculated` adds field-ID alias; it does not fix the text-vs-link semantic mismatch discussed in section 3. |
| repairs / mileage_logs / probe_rack | Corresponding calculated views give repair state, odometer total, rack serial/empty status. Serialize underlying option/link fields as needed. |
| contacts / operations / billing_entities / probes / inventory / users / weather_stations / installers / documents | Base tables plus registered option/FK/join hydration. Private credentials never enter normal page DTOs. |
| billing entity → operations; invoice summaries | `billing_entity_operations` and `billing_entity_invoice_totals` are optional read helpers. Operations still derive through contacts; don't invent a stored field.operation FK. Use explicit ordering if preserving first-operation display behavior. |

Keep import autonumbers `water_recs.record_name`, `orders.order_id`, and `order_items.item_id` distinct from primary IDs and `baserow_id`. Normal app creates omit imported crosswalk IDs and let approved counters generate values.

### 1.4 Write boundary and access

Use a table-specific writable-column registry, not unrestricted `update arbitrary table/column`. Row + join changes must be one transaction. Apply FK/unique conflicts as useful 4xx responses; `ON DELETE RESTRICT` is not equivalent to Baserow deletion/unlink behavior. Do not invent cascading deletes to make the UI succeed.

Keep NextAuth initially to avoid bundling a login-system replacement into this switch. The copied `public.users` and `installers` rows are **not Supabase Auth users/sessions**. Rewrite their storage access on the server, retain bcrypt/active/role semantics, and plan secure crew sessions/PIN handling. Existing middleware exempts broad mutation routes and the crew PIN endpoint only returns an OK; these are **cutover blockers** before a privileged Supabase backend is used. Add per-route staff/crew/customer authorization, not just a login screen.

Customer token validation must prove that the target field, season and assignment belong to that operation. `/api/field-info` currently checks token existence but does not establish target ownership. Scope choices through contacts → entities → **field-billing join**; never allow someone who can view a shared field to silently reassign its complete billing membership.

Repository records say RLS is enabled but client grants/policies are deliberately closed. Plan least-privilege backend grants and explicit access rules; do not “fix” permission errors by opening every table or disabling RLS. A server secret/service role can bypass RLS; therefore explicit server authorization remains required. Retain `security_invoker=true` on read views and use caller-permission transactional functions unless a separately reviewed privileged operation is essential. Credentials stay server-only.

This distinction between object grants and row policies is confirmed by [Supabase's API security guide](https://supabase.com/docs/guides/api/securing-your-api). Private-file access must use an authorized request or time-limited link, per [Storage download guidance](https://supabase.com/docs/guides/storage/serving/downloads). The changelog Markdown index could not be retrieved in this restricted session (unsupported browser content type / shell DNS); recheck the current changelog and SDK docs before actual implementation. No SDK version or live grant state is asserted from this planning run.

## 2. API route inventory — all 83 files

All paths below are relative to the repository root. **D** = direct Baserow HTTP/schema/upload calls; **A** = adapter or indirect helper; **—** = no Baserow call. Every D route must lose its Baserow URL, token, `user_field_names`, paging/filter dialect and any schema/upload calls; renaming an environment variable is not sufficient. “CRUD via adapter” includes a validated delete helper and exact existing response envelopes/statuses, not just forwarding arbitrary request bodies.

| File | Access | Size | Current dependency | Required change |
|---|---|---|---|---|
| `app/api/ask/route.ts` | A | B | Reads fields, probes, seasons, contacts, operations, assignments, billing, racks and repairs; AI tools write seasons/probes/assignments/repairs. | Keep tool-facing DTOs through adapter; authorize and validate each tool action, IDs and relation arrays. Do not let AI tool paths bypass normal action services. |
| `app/api/auth/[...nextauth]/route.ts` | A | B | Exports NextAuth handlers; indirect users read/last-login write through auth.ts. | Keep handler contract; migrate auth.ts and enforce server authorization. Not a Supabase Auth session migration. |
| `app/api/backup/route.ts` | D | B | Reads all TABLE_IDS tables except users; emits combined CSV and flattens links/selects. | Read complete adapter datasets with stable headers; preserve admin check. Treat PINs/credentials and Storage manifests separately; CSV is not a complete database/file backup. |
| `app/api/billing-entities/[id]/route.ts` | D | S | PATCH/DELETE billing entities (hardcoded table ID). | CRUD via adapter; validate pass-through body; handle referenced-entity deletion conflicts and invalidate linked labels. |
| `app/api/billing-entities/route.ts` | D | S | POST billing entity, raw request body. | Create via allowlisted adapter; return same row shape; normalize nullable fields. |
| `app/api/billing/enroll/route.ts` | D | B | Find/create invoice, find/update/create line, recalculate invoice amount; link_row_has filters. | One authorized, idempotent transaction; validate chosen entity against field_billing_entities; preserve invoice/line pricing and zero quantities. Existing line lookup only by season can move a line between entities—resolve multi-billing policy, never duplicate or silently move billing. |
| `app/api/bookings/route.ts` | A | S + billing | Season/assignment counts using fields, contacts and operations; first field billing link. | Keep cached DTO aggregation; support all field billing memberships and deduplicate field/assignment counts. Preserve not-returning note tags. |
| `app/api/contacts/[id]/operations/route.ts` | D | B | Read-modify-write contacts.operations array; POST adds, DELETE unlinks. | Atomic contact_operations insert/delete rather than overwriting the full array; preserve other links and ordering. |
| `app/api/contacts/[id]/route.ts` | D | B | PATCH/DELETE contacts, raw body includes operations/billing/customer types. | Validate keys; transact contact scalar data and three joins. Decide referenced-record deletion behavior; refresh derived entity-operation mappings. |
| `app/api/contacts/route.ts` | D | B | POST contacts with dropdowns and multi-links. | Create scalar contact and ordered joins atomically; preserve response labels/options. |
| `app/api/debug/ensure-removal-priority/route.ts` | D | B | Creates Baserow schema/options and stamps hardcoded field-season 2443; token query auth. | Retire/disable this one-shot endpoint in Supabase mode. Do not replay its data mutation or use a Supabase secret in a query string. Priority lookup already exists. |
| `app/api/debug/field-names/route.ts` | D | S | Reads Baserow field definitions and sample season/assignment rows. | Replace with admin-only registry/DTO diagnostics, or disable. Never expose unrestricted schema/sample data publicly. |
| `app/api/debug/health/route.ts` | D | S | Checks raw table/sample access with Baserow configuration. | Backend-specific, non-sensitive admin health checks; do not expose credentials or treat unreadable tables as empty. |
| `app/api/debug/order-items/route.ts` | D | S | Reads orders/items/products Baserow metadata and samples. | Admin-only registry/query diagnostics or disable; no Baserow schema API remains. |
| `app/api/documents/[id]/route.ts` | D | B | DELETE document row. | Authorized row delete with explicit attachment retention/cleanup policy; don't delete a shared object prematurely. Invalidate documents. |
| `app/api/documents/route.ts` | D | B | Multipart Baserow file upload, then document row with [{name}]. | Private Storage upload, persist full reference JSON, compensate/report failed row save; authorized download mapping; support note-only documents. |
| `app/api/elevation/route.ts` | — | N | External elevation helper only. | No database switch change; retain response shape. |
| `app/api/field-info/route.ts` | D | B | Customer token lookup; field/season/billing mutation; creates notification. | Ownership checks for operation + field + season; atomic join-aware billing edits; fix notification semantic mapping. No spaced-key duplication or raw Baserow JSON filters. |
| `app/api/field-seasons/[id]/route.ts` | D | S | PATCH/DELETE season, options/service links; addSpaceVariants. | Decode supplied keys only, update service join if supplied, preserve planning vs actual removal; restrict referenced deletes. Shared join transaction is handled by adapter. |
| `app/api/field-seasons/bulk/route.ts` | D | B | Batch season creates with service links. | Validated transactional bulk create; return matching items/envelope; preserve each season's service links and prevent duplicate retry creates. |
| `app/api/field-seasons/route.ts` | D | S | POST season with field link and service/options. | Create via adapter with ordered services; keep dates/options and defaults; do not reset probe assignments. |
| `app/api/fields/[id]/route.ts` | D | B | GET/PATCH/DELETE field, options, billing scalar→array, optional geographic enrichment. | Use fields_calculated for reads; field_billing_entities for billing; preserve existing links on scalar edit or require explicit full selection; related-delete safeguards. Geo services unchanged. |
| `app/api/fields/route.ts` | D | B | POST field, season and optional probe assignments as chained writes. | One database transaction for row graph/joins; external geo lookups outside transaction. Return existing API shape. Billing solely through join; failed child creation must not leave silent partial setup. |
| `app/api/fields/season-data/route.ts` | A | S + billing | Calls getFieldsData(season). | Retain processed response; central fields-data fixes and full billing representation feed all consumers. |
| `app/api/gdu/route.ts` | — | N | Weather/GDU calculation, no Baserow calls. | No database switch change; do not alter crop math. |
| `app/api/geocode/route.ts` | — | N | US Census geocoding; only Baserow-specific item is a coordinate-rounding comment. | Keep existing six-decimal response; no need to change precision as part of migration. |
| `app/api/install/route.ts` | D | B | Uploads two photo types; reads/updates selected assignment; optionally updates shared season crop. | Private Storage + transactional row action, retry-safe install, correct physical probe link; preserve partial-photo warnings and form response. Do not overwrite siblings or re-upload on retry. |
| `app/api/installer-auth/route.ts` | A | B | Reads installer PIN through installer-pins helper; returns ok/id. | Private credential lookup and a real authorized crew session; copied PIN rows are not Supabase sessions. Never give browser generic table access. |
| `app/api/installer-pins/route.ts` | D | B | GET/helper read installers; POST/PATCH/DELETE names/PINs. | Server-only adapter; admin-only PIN management, no raw PINs in list DTOs; preserve pinSet. Address hashing/session/rate-limit design before cutover. |
| `app/api/installer/assignments/route.ts` | A | S + billing | Joins assignments, seasons, fields, probes, racks, contacts, entities, operations; fresh/cached modes. | Hydrated DTOs preserve installer, options and linked IDs; all-billing membership and effective-location tests; retain fresh=1 behavior. |
| `app/api/installer/fields/route.ts` | A | S + billing | Field/season/assignment/entity picker data. | Retain processed picker DTO; billing membership and scoped crew access. |
| `app/api/installer/history/route.ts` | A | S + billing | Uncached assignment history + cached relation tables. | Keep historical state, option/link labels, removal facts and fresh reads; billing join source. |
| `app/api/installer/locations/route.ts` | A | S + billing | Location records joined through seasons/assignments/contacts/operations. | Preserve processed map DTO; no independent Baserow-shaped UI rewrite; correct billing-operation membership. |
| `app/api/installer/probe-index/route.ts` | A | S | Probes/racks/assignments/seasons/fields index, returned for local cache. | Keep results/builtAt and link resolution; version the browser cache for backend/ID convention. |
| `app/api/installer/probe-search/route.ts` | D | S | Raw probe search/search_mode plus cached relation hydration. | Server serial/text search with equivalent bounded results and decoded DTOs; don't silently search unrelated labels only. |
| `app/api/installer/removals/route.ts` | A | S + billing | Fresh/cached rows and robust select/link value helpers; planned-remover and A/B route filtering. | Retain processed removal DTO, scope and dates, distinguish planned vs actual remover; billing join; test counts independently of UI filtering. |
| `app/api/installer/repairs/route.ts` | A | S | Reads repairs with field/assignment/probe/entity joins. | Same DTO and open/resolved/watch-list semantics; preserve selected assignment, not entire field. |
| `app/api/installer/summary/route.ts` | A | S + billing | Fleet counts from assignments/seasons/probes and CRM links. | Keep aggregate DTO; deduplicate billing joins and preserve fresh reads. |
| `app/api/installer/unassigned-probes/route.ts` | A | S | Probes minus assigned probes. | Keep status objects/link arrays and assignment exclusion logic; same safe numeric API IDs. |
| `app/api/inventory/[id]/route.ts` | D | S | PATCH/DELETE quantity/category/item. | Adapter CRUD and lookup decoding; preserve zero quantity; no option DDL. |
| `app/api/inventory/route.ts` | D | S | POST stock item. | Adapter create, category option resolution, same response. |
| `app/api/invoice-lines/[id]/route.ts` | D | S | PATCH/DELETE invoice line scalar/link inputs. | Adapter CRUD; protect references, invalidate invoice projections; preserve saved rate/quantity. |
| `app/api/invoice-lines/route.ts` | D | S | GET filtered invoice links and POST line. | Translated link filter with complete paging; read calculated line total, write base table; same results envelope. |
| `app/api/invoices/[id]/route.ts` | D | S | PATCH/DELETE invoice status/dates/amounts. | Adapter CRUD, nullable dates and status lookup, referenced-line conflict policy; no automatic cascade. |
| `app/api/invoices/route.ts` | D | S | POST invoice linked to billing entity. | Adapter create, compatible row; retain record_name/number versus row-ID distinctions. |
| `app/api/log-removal/route.ts` | D | B | Find/create a documents note named Probe RMA Records, append description. | Atomic append/upsert under lock or explicit conflict handling; not the actual removal action. No lost concurrent note lines. |
| `app/api/migrate/probe-to-assignments/route.ts` | — | N | GET/POST return migration-complete message; no active data access. | Keep inert/retire later; do not port or execute the retired migration. |
| `app/api/mileage/route.ts` | D | S | GET date/installer logs; POST/PATCH/DELETE mileage rows. | Translate date filters and complete paging; preserve logs envelope, date strings and computed mileage; authorize crew ownership. |
| `app/api/notifications/route.ts` | A | B | GET unread, POST text changed_field + field link, PATCH read flags. | Resolve schema mismatch explicitly; serializer alone cannot store text in changed_field FK. Preserve notifications envelope and mark-read behavior. |
| `app/api/operations/[id]/approval-token/route.ts` | D | B | Read operation; generate/save approval token using hardcoded table ID. | Authorized, race-safe generation through adapter; preserve token values and customer URLs, enforce target ownership on consuming routes. |
| `app/api/operations/[id]/route.ts` | D | S | PATCH/DELETE operation. | Adapter CRUD; preserve notes/token, restrict linked deletes; invalidate contact-derived views. |
| `app/api/operations/route.ts` | D | S | POST operation. | Adapter create, validated body and same row response. |
| `app/api/order-items/[id]/route.ts` | D | S | PATCH/DELETE item price/quantity/notes. | Adapter CRUD; computed line/order totals refreshed; preserve unit-price snapshots and zero. |
| `app/api/order-items/route.ts` | D | S | POST order/product link arrays and item values. | Adapter create and readback; generated item_id remains separate from API row ID. |
| `app/api/orders/[id]/route.ts` | D | S | PATCH/DELETE status/notes/date/entity. | Adapter CRUD; option/link decoding; restrict deletion when items exist unless reviewed action explicitly removes them. |
| `app/api/orders/fulfill/route.ts` | D | B | Reads assignments, writes assignment statuses, marks order fulfilled. | Single scoped action joining assignment→season→field→field_billing_entities. Current code's billing filter returns true without checking membership: do NOT preserve that behavior. Validate order entity and exact selected assignment set before updating. |
| `app/api/orders/route.ts` | D | S | GET list, POST order including entity/status. | Read orders_calculated then DTO, create base row; all-page behavior and totals; preserve raw report labels elsewhere. |
| `app/api/ping/route.ts` | — | N | Connectivity response only. | No migration change. |
| `app/api/plss/lookup/route.ts` | — | N | External PLSS lookup helper. | No migration change. |
| `app/api/probe-assignments/[id]/route.ts` | D | B | PATCH/DELETE assignment, option/link/date/location/approval fields; public-facing callers. | Adapter patch only supplied keys; enforce staff/crew/customer ownership by action; preserve selected assignment, sibling and planned-remover invariants. Explicit safe delete policy. |
| `app/api/probe-assignments/backfill/route.ts` | D | B | Reads all assignments/seasons/fields; writes inherited placement values. | Disable bulk maintenance by default; separately authorized administrator-only replacement if still needed. Never run it as part of cutover. |
| `app/api/probe-assignments/bulk/route.ts` | D | B | Batch assignment patches with spaced aliases. | Atomic or explicitly partitioned validated patches; preserve supplied-key semantics and chosen IDs, not other probes in same season. |
| `app/api/probe-assignments/route.ts` | D | B | GET linked season/field defaults, create assignment, then optional geo patch. | Create with resolved FKs/options; coordinate enrichment outside transaction; preserve defaults, failures and selected-device scope. |
| `app/api/probe-rack/[id]/route.ts` | A | S | PATCH uses updateRow for probe slot link. | Join-shaped input→FK decoder, validate one physical probe; consistent rack move action if source and destination change together. |
| `app/api/probe-rack/route.ts` | D | S | GET via getRows, POST direct row create. | Keep envelope and probe link array; validate rack/slot without converting blanks to invented slots; handle uniqueness/occupancy policy explicitly. |
| `app/api/probe-rack/sync/route.ts` | D | B | Reads probes and rack rows; batch updates rack probe links. | Privileged reconciliation action with transaction/conflict report; not a background side effect of normal reads and not run during migration. |
| `app/api/probes/[id]/route.ts` | D | S | GET/PATCH/DELETE probe plus status, rack, CRM links. | Adapter CRUD and transactional joins; preserve blank serial NULL and unique serial conflicts; protect assignments from unsafe delete. |
| `app/api/probes/route.ts` | D | S | GET search with Baserow results envelope, POST probe/options/multi-links. | Keep bounded search results envelope; adapter create, ordered joins, blank serial NULL; do not force On Order probes to have serials. |
| `app/api/products-services/[id]/route.ts` | D | S | PATCH catalog. | Adapter patch with option lookup; preserve active/status distinction, zero rates and price-history semantics. |
| `app/api/products-services/route.ts` | D | S | GET list, POST catalog entry. | Adapter read/create; keep response envelope and calculated margin; don't reinterpret service links as dropdown options. |
| `app/api/pulled-today/route.ts` | D | B | Direct count using Baserow date_equals_today; cached assignments/seasons for remaining. | SQL count for America/Chicago date plus equivalent remaining-installed rules; keep public aggregate only, not underlying crew records. |
| `app/api/register/route.ts` | D | B | Counts/searches users, creates bcrypt user with role. | Server-only auth storage, bootstrap/admin guard and exact email uniqueness policy; no public privilege escalation. Existing user rows are not Supabase Auth accounts. |
| `app/api/removal/route.ts` | D | B | Schema branch: photo upload + direct assignment patch/webhook; main amendment adds shared action and probe update. | Use approved main shared service with Supabase adapters; private uploads; transaction for selected assignment+probe. Preserve retry history, actual remover, planned-remover/sibling protections, and notify **only source=crew** after commit. |
| `app/api/repairs/[id]/route.ts` | D | S | PATCH/DELETE repair, links, completion and watch-list data. | Adapter CRUD with selected-assignment IDs, NULL dates and booleans; keep crew/desktop parity. |
| `app/api/repairs/route.ts` | D | S | POST repair linked to season/optional assignment. | Adapter create and calculated readback; same defaults and response, no sibling probe changes. |
| `app/api/select-options/route.ts` | D | B | GET options, PATCH whole Baserow field select_options via JWT. | Lookup-table CRUD by allowlisted table/field; transactional rename/reorder/add/retire, preserve IDs/color/order. Decide referenced-option deletion; default retire/reject rather than silently clearing all records. |
| `app/api/soil/route.ts` | — | N | External soil helper only. | No migration change. |
| `app/api/water-recs/[id]/route.ts` | D | S | PATCH/DELETE selected rec row. | Adapter CRUD, text suggested_water_day/report_type unchanged; reject calculated-field writes. |
| `app/api/water-recs/bulk/route.ts` | D | B | Create batch with fallback, then scoped server-read cleanup by date/season/report type. | One transactional replacement/upsert action with concurrency and retry safeguards. Empty submission must not wipe reports; failed writes retain old recs. Exact report_type remains part of scope; return createdIds/deleted/failed/total contract. |
| `app/api/water-recs/field-note/route.ts` | D | S | POST updates field_seasons.field_note. | Adapter patch that column only; preserve NULL/blank clearing, do not change recommendation or assignment data. |
| `app/api/water-recs/route.ts` | D | S | POST rec with season link/date/recommendation/day. | Adapter create; complete DTO return; keep text labels distinct and record_name autonumber generated. |
| `app/api/weather-stations/[id]/route.ts` | D | S | PATCH/DELETE station/entity/options. | Adapter CRUD and single-entity FK resolution; private grants; no field-billing scalar fallback. |
| `app/api/weather-stations/route.ts` | D | S | GET list, POST station. | Adapter read/create with entity link array and status/connectivity objects; same list envelope. |

## 3. Places the adapter cannot make completely unchanged

1. **Direct transport:** all D routes in section 2, plus `auth.ts`, require edits regardless of facade compatibility. Upload, schema metadata, authentication and bulk operations are not just record-shape changes.
2. **Field billing cardinality:** the join is authoritative for all fields, not only the two multi-linked examples recorded in the import. Adapter `Field.billing_entity` must contain all links in `position` order. Current `billing_entity[0]` logic and ProcessedField's single `billingEntityId` are display assumptions, not a primary-billing rule. Extend processed DTOs with full entity IDs/labels; use all links for operation membership and token authorization. Keep existing scalar convenience only for exactly one linked entity, or explicitly label display-only first selection. Existing scalar editors must not replace two links with one without an explicit user choice. Invoice allocation/splitting remains a business decision, not “bill every linked entity.” Test zero, one and multiple links. Known regression fixtures: 47 - 4G and Old Place West; no live records were read for this plan.
3. **Notifications:** inventory section at lines 402–415 and SQL define `field_name text` and `changed_field FK → fields`. App DTO/routes/NotificationBell instead use `changed_field` as a changed-column label and `field` as the link. Propose an explicit app DTO with `field` link and changed-attribute label; choose whether `field_name` is intended to carry that label or needs a separately approved column. Do not infer its meaning from an empty source table, silently cast text to FK, or simply return the view unchanged. `page_type` also differs: inventory options are `field-info/approval`, while producers default to `Field Info`; define and test an explicit mapping, not silent new options.
4. **Editable option schema IDs:** Settings submits Baserow `fieldId`, not an option row ID. Prefer the small coordinated UI/route change to registered `tableName,fieldName`. Keep option object shape, label/color/order and stable row identity. Referenced options use restrictive FKs: retire or reject; do not reproduce the existing “rows using this value will be cleared” promise without an explicit, scoped transaction and approval.
5. **Files:** old upload names/URLs are not Supabase file keys. Multipart routes and private download access must change even if display DTOs remain identical. Keep imported Storage references unchanged; new uploads use the same validated reference format.
6. **IDs and external consumers:** shape parity is not ID-value parity. Browser caches, sessions, bots, bookmarks and CropX webhook integration must use the selected identity convention and explicit crosswalks. Old external IDs must never accidentally hit an unrelated PostgreSQL row.
7. **Security:** broad public mutation routes, PIN-only client state and token-exists checks cannot be carried into a privileged server adapter without route-level authorization. This is not solved by declaring RLS enabled. Keep Auth replacement as a separate decision while making this switch safe.
8. **Atomic actions:** water-rec replace/cleanup, field setup, invoice enrollment, fulfillment, removal and device/rack swaps need transactional boundaries. Keep most UI payloads but do not emulate Baserow partial writes. CropX webhook must occur only after a committed crew removal; a retry must not notify twice.
9. **Schema/UI mismatches already present:** `WaterRec.suggested_water_day` TypeScript says dropdown, while source/schema/routes store text and page already handles both. Preserve real text semantics and update that stale type later; don't invent a new options table. Services are catalog links. Notification mismatch is separate, above. Deletion behavior and original calculated display labels must be contract-tested rather than guessed.

### 3.1 Shared code and server/page readers

These are reads, assemblers and types, not independent write authorization. S assumes the adapter in section 1 exists.

| File | Size | Dependency and required change |
|---|---|---|
| `lib/baserow.ts` | B | Core transport, DTOs, options/schema, CRUD, paging and cache; replace internals as specified in section 1. |
| `lib/fields-data.ts` | B | Central Fields/Planting/Readiness dataset: season filter, option objects, service/probe link arrays, file URLs, numeric coercion. Keep exported getFieldsData and Processed* names, but add complete billing membership instead of only billingEntityId/first operation; preserve record/season separation. |
| `lib/data-mappings.ts` | S + billing | Pure contact→billing→operation mappings, no network. Adapter returns ordered link arrays so helpers mostly stay. Use all-operation maps for membership checks, never the first-operation display map for authorization or invoice allocation. |
| `auth.ts` | B | Raw users search and last_login PATCH, bcrypt comparison and role.value. Replace direct REST with private server lookup/update, preserve NextAuth session contract and active checks; exact email match; old/new user IDs and authorization require explicit handling. |
| `middleware.ts` | B | Indirect auth dependency and broad public API exemptions. Reconcile staff/crew/customer authorization before privileged Supabase calls; database RLS does not make these exemptions safe. |
| `app/page.tsx` | S | Dashboard reads repairs, seasons, assignments, orders, entities, probes; unwraps statuses/services. Keep adapter shapes and dashboard count semantics. |
| `app/approvals/page.tsx` | S + billing | Builds operation approvals from seasons/fields/probes/contacts and assignment options/links. Use all billing memberships for grouping, deduplicate records, preserve per-assignment approvals. |
| `app/approve/[token]/[season]/page.tsx` | B | Token-gated customer payload assembled from CRM/field/season/probe rows. Keep DTO but validate operation ownership and include shared-field membership via all join links; do not authorize from first billing link. |
| `app/billing-entities/page.tsx` | S | Entity/contact/operation mapping; DTO adapter keeps link arrays; no new field-billing scalar. |
| `app/billing/page.tsx` | B | Invoices/lines, live catalog pricing, field seasons and CRM/probe data. Currently selects first field billing entity/service. Full join membership plus explicit charge assignment/splitting policy; preserve saved invoice amounts versus UI projections, avoid double-billing shared fields. |
| `app/contacts/page.tsx` | S | Contacts with multi-links/customer-type options and is_main_contact.value. Adapter shapes preserve contact DTO and editable options. |
| `app/crm/page.tsx` | S + billing | Assembles operations/contacts/entities/fields/probes and dropdowns for CRM tabs. Hydrate all joins; preserve multiple entity/operation membership and no duplicate counts. |
| `app/cropx/page.tsx` | S + billing | Reads CRM/seasons/assignments/probes, filters status and service values, displays CropX inventory relationships. Keep DTOs but field membership through join; no CropX API mutation is implied. |
| `app/documents/page.tsx` | S | Reads document.file[0].url/name/size/mime_type. Storage DTO mapper supplies authorized URL/metadata; page stays if that contract holds. |
| `app/field-info/[token]/[season]/page.tsx` | B | Customer field/season options and billing choices, filtered via first field billing link. Replace membership checks with full join and scoped token authorization; expose multi-billing safely. |
| `app/fields/page.tsx` | S | Delegates to getFieldsData and re-exports Processed* types. Preserve function/export contract; inherits central billing correction. |
| `app/install/page.tsx` | S + billing | Joins assignments/seasons/fields/probes/CRM, option values and install/removal file URLs. Preserve status/date/processed DTO, all-billing membership and signed/private file access. |
| `app/installer/page.tsx` | S | Reads installers to supply crew name choices. Private server fetch and name-only DTO; no PIN leak. |
| `app/inventory/page.tsx` | S | Stock item.category.value and assignment antenna/battery/season links. Keep shaped option arrays and installed/planned usage counts. |
| `app/map/page.tsx` | S | Fetches fields, operations, contacts, assignments, repairs and season-filtered seasons. Continue DTO hydration and validated season filter; no direct REST remains. |
| `app/operations/page.tsx` | S + billing | CRM relationship maps and field/probe counts. Adapter joins plus all-billing membership/deduplication; preserve operation/contact DTOs. |
| `app/orders/page.tsx` | S | Unwraps status/product/category/unit objects, order_link/product/entity arrays and money values. Read calculated totals plus hydrated labels; keep saved price arithmetic. |
| `app/planting/page.tsx` | S | getFieldsData, ProcessedField and serialized options incl. planned installer. Preserve numeric/date/option DTO; inherits central billing correction. |
| `app/probes/page.tsx` | S | Probes, CRM joins, rack slots, assignments and seasons; status/brand/trade option objects. Ordered multi-links and linked IDs must remain consistent. |
| `app/racks/page.tsx` | S + billing | Fresh rack/probe reads with cached CRM/season/assignment mappings; serial/status links. Use all-billing relationships for field labels and preserve fresh occupancy reads. |
| `app/repairs/page.tsx` | S + billing | Repair→assignment/season→field→probe plus entity/operation mappings. Same DTO and open/watch-list rules, multiple billing labels/membership; no all-probes update. |
| `app/review/[token]/[season]/page.tsx` | B | Combines customer field-info and approvals; raw options/link arrays, first-link billing filter. Scope every returned and mutable record to token operation via full join. |
| `app/route/page.tsx` | S + billing | Map locations via field/season/assignment and CRM links; first entity→operation mapping. Return same route DTO but correct full membership and deduplicate stops. |
| `app/season-readiness/page.tsx` | S | Calls getFieldsData and produces readiness DTO. Preserve current saved status/installation facts; migration must not infer or stamp installs from rack placement. |
| `app/settings/page.tsx` | S | Products/services, seasons, operations and getAllSelectOptionsWithMeta. Keep option map plus planned field-key transition; no arbitrary Supabase schema exposure. |
| `app/water-recs/page.tsx` | S + billing | Fresh rec/season reads, cached field/assignment/CRM, dropdown metadata fallback; accepts text-or-object water day. Adapter returns source text and exact report types; all billing links for grower membership, no maturity-math change. |
| `app/weather-stations/page.tsx` | S | Unwraps station status/connectivity and single billing entity link; options helper must provide same dropdown map. |
| `app/workflows/WorkflowScreen.tsx` | S + billing | Builds workflow DTOs from fields/seasons/probes/assignments/CRM/options. Use full billing membership; preserve main amendment's current-season/unremoved uninstall eligibility when later integrated. |

### 3.2 Client components and write callers

Clients mostly call the app's own API, not Baserow directly. Keeping those envelopes avoids broad UI rewrites. They still need regression tests for link IDs, options, file URLs, NULL clears and multi-billing.

| File | Size | Dependency and required change |
|---|---|---|
| `app/DashboardClient.tsx` | S | Reads /api/bookings and patches operation notes. Keep JSON/status envelope and numeric IDs; billing-group counts come from server. |
| `app/approvals/ApprovalsClient.tsx` | S | PATCH selected assignment approval(s), generate operation approval token. Keep request shape; authorize each exact assignment; no implicit season-wide changes. |
| `app/approve/[token]/[season]/ApprovalClient.tsx` | B | Customer assignment patches, grouping by field ID; mostly processed DTO. Pass authenticated/scoped customer context to mutation route; preserve links and per-probe approval state. |
| `app/billing-entities/BillingEntitiesClient.tsx` | S | Entity CRUD and quick field create. API transport can stay; any field creation/edit must write billing join, not deprecated scalar. |
| `app/billing/BillingClient.tsx` | B | Enrolls bills, edits invoice lines/invoices and handles temporary IDs. Explicit charge-to entity selection for multi-billing fields; reconcile returned real IDs and prevent duplicate enrollment. |
| `app/chat/ChatClient.tsx` | S | Sends prompts to /api/ask; no direct Baserow DTOs. Keep response/tool outcome contract; server tool authorization changes. |
| `app/contacts/ContactsClient.tsx` | S | Contact/operation/entity CRUD, relationship arrays and customer-type selections; geocoding independent. Adapter can keep requests, but PATCH must preserve omitted relationships. |
| `app/documents/DocumentsClient.tsx` | S | Multipart upload and row deletion; processed file URL/name/MIME props. Same app endpoint; private download URL refresh/access failure handling as needed. |
| `app/field-info/[token]/[season]/FieldInfoClient.tsx` | B | Saves token, field/season IDs, field key and value; one billing selector. Replace destructive single-value billing edit with explicit supported full selection/guard; include scoped authorization. |
| `app/fields/FieldsClient.tsx` | B | Central create/edit/delete/bulk flows for fields/seasons/assignments/probes; serialized dropdown metadata and numeric link IDs. Most controls survive, but billing single-value assumptions and multi-call workflows require coordinated server actions; never carry old cached IDs across backend switch. |
| `app/install/InstallClient.tsx` | S | Assignment inline edits and multipart /api/install; reads processed photo URLs. Same API contract with server Storage/action replacements and authorized downloads. |
| `app/installer/InstallerApp.tsx` | B | Assignment/search/history/removal/repair/summary/mileage API consumers, XHR upload, link ID writes, locally cached probe index and crew session. Keep processed DTOs; version caches and provide real crew auth. Preserve upload progress and retry UX; do not assume cached ID namespace stays valid. |
| `app/installer/RemovalsScreen.tsx` | S | FormData to /api/removal; processed rows. Preserve main's explicit source=crew, date/remover/photo response and refresh semantics; crew-only webhook tested. |
| `app/installer/RepairsScreen.tsx` | S | Reads installer fields/repairs/unassigned probes and posts/patches repairs. Same DTO and linked assignment IDs, watch-list/completion parity with desktop. |
| `app/installer/pulled/page.tsx` | S | Reads /api/pulled-today aggregate. Keep aggregate JSON and America/Chicago calendar semantics; no private row access. |
| `app/inventory/InventoryClient.tsx` | S | POST/PATCH/DELETE stock items and category inputs. Keep route contract and explicit zero values. |
| `app/map/MapClient.tsx` | S + billing | Client receives raw Baserow-shaped Field/Season/Assignment/Repair/Contact arrays; unwraps options and links, first billing label. Adapter can preserve shapes; use full membership/labels rather than hiding extra billing links. |
| `app/operations/OperationsClient.tsx` | S | Operation CRUD and contact-operation add/remove endpoints; processed DTOs. Preserve request shapes with atomic server join actions. |
| `app/orders/OrdersClient.tsx` | B | Order/item CRUD plus fulfill action; product and entity IDs. Keep most form payloads, but fulfillment must return results for correct billing entity and chosen assignments; no blanket status changes. |
| `app/planting/PlantingClient.tsx` | S | PATCH season crop/planting/readiness/route data via app endpoints. Same processed DTO; preserve omitted-key semantics. |
| `app/probes/ProbesClient.tsx` | B | Probe CRUD, raw rack probe link arrays, status/serial replacement and multi-request rack swaps. Keep DTOs, but transact device/assignment/rack moves to prevent partial state; preserve all CRM joins and other devices. |
| `app/pulled/page.tsx` | S | Legacy aggregate tally client (middleware redirects to installer variant). Keep compatible response while retained; not a data migration writer. |
| `app/racks/RacksClient.tsx` | B | Consumes ProbeRackSlot.probe[0].id/value; writes probes and source/destination rack links with undo. Same shape, but transactional move/undo with occupancy/version checks is needed for safe multi-row writes. |
| `app/repairs/RepairsClient.tsx` | S | Repair create/edit/delete/complete payloads, selected season/assignment. Keep envelopes and selected-probe scope; server relation decoder handles links. |
| `app/review/[token]/[season]/ReviewClient.tsx` | B | Customer field-info/billing and per-assignment approvals. Same two backend route families, with scoped authorization and explicit multi-billing edit handling. |
| `app/season-readiness/SeasonReadinessClient.tsx` | S | Season PATCH from processed fields. Preserve form shape and changed-column-only writes. |
| `app/settings/SettingsClient.tsx` | B | Baserow fieldId/select_options editor, product CRUD, installer PIN CRUD and backup. Field identifiers become allowlisted table/column keys (or explicit compatibility IDs); referenced option retirement/delete behavior must be clear, no Baserow JWT. |
| `app/water-recs/WaterRecsClient.tsx` | S | Rec bulk/create/delete and season-note API payloads, createdIds responses. Keep DTO and exact report types; server transaction redesign handles reliability, not crop formula changes. |
| `app/weather-stations/WeatherStationsClient.tsx` | S | Station create/edit with entity/status/connectivity input. Same form and returned DTO; adapter decodes options and single link. |
| `app/workflows/WorkflowsClient.tsx` | B | Schema branch still has old two-request uninstall; also season planning, RMA replacement, probe registration and rack movement. Later retain approved main removal path source=workflows with NO CropX webhook. Other multi-row actions need shared transactional services; never update planned_remover during actual removal. |
| `components/NotificationBell.tsx` | B | Reads page_type object/string and field link array; renders changed_field as text, marks IDs read. Resolve notification mapping rather than displaying a FK/object as label; preserve unread envelope. |
| `components/fields/AddFieldModal.tsx` | B | Creates field+season and separately enrolls billing; one billing choice, service/probe IDs. Keep most form shape; explicit join membership and idempotent enrollment, clear partial/error handling. |
| `components/fields/AddSeasonModal.tsx` | S + billing | Creates season with field/service IDs then enrolls billing. Same request shape if billing recipient is explicit and validated against join; no automatic charge per linked entity. |
| `components/fields/CreateProbeModal.tsx` | S | Creates physical probe with status/brand and billing/owner links. Adapter accepts existing route format and preserves blank serial NULL. |
| `components/fields/EditSeasonModal.tsx` | B | Changed-only season save; creates/patches selected assignments, field details and billing enrollment. Preserve main's prior safety fix; add complete billing representation/guard before editing multi-linked fields, never reset unrelated statuses. |
| `components/fields/FieldCell.tsx` | S | ProcessedField cell editors pass API field names and nullable values via parent callbacks. Maintain UI keys through allowlisted decoder; billing limitation belongs to parent DTO/editor. |
| `app/layout.tsx` | S | No row read; Baserow dns-prefetch/preconnect hints only. Remove obsolete Baserow hints during implementation, not in this planning task. |
| `lib/OperationFocusContext.tsx` | S | Stores chosen operation ID locally; no database calls. Version/reset old-ID persisted state at cutover; preserve visible focus behavior. |
| `app/installer/removalsRouteFilter.ts` | S | Pure helper assumes season route_order is A/B text; local filter storage. Preserve that contract, not integer assignment route_order. |
| `app/installer/todayPullCounts.ts` | S | Pure removal DTO aggregation: removed/removedOn/removedBy and Chicago dates. Preserve types and actual-vs-planned distinction. |

### 3.3 Indirect renderers, wrappers and checked non-database files

These files were included in the scan so wrappers, map props and generic select controls are not mistaken for undiscovered Baserow connections. **N** means no independent migration edit after their caller's contract is preserved; smoke-test their parent flows. An `id` or DOM `event.target.value` by itself is not a Baserow dependency.

| File | Size | Why / what must remain compatible |
|---|---|---|
| `app/approve/[token]/[season]/ApprovalMap.tsx` | N | Processed approval locations/IDs only; preserve map props and selection callbacks. |
| `app/approve/[token]/[season]/ApprovalPinMap.tsx` | N | Coordinate picker for approvals; no database-shaped rows or transport. |
| `app/chat/page.tsx` | N | Wrapper for ChatClient; backend change remains in /api/ask. |
| `app/crm/CRMClient.tsx` | N | Composes existing CRM clients with processed props; inherits their adapter/billing work. |
| `app/crm/CRMOverview.tsx` | N | Processed CRM summaries; preserve deduplicated counts supplied by parent. |
| `app/cropx/CropXClient.tsx` | N | Processed field/probe/operation display; no database transport; preserve IDs and labels. |
| `app/equipment/error.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/equipment/layout.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/equipment/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/equipment/page.tsx` | N | Re-exports probes page; no second data layer to migrate. |
| `app/equipment/racks/page.tsx` | N | Re-exports racks page; fixes belong to the shared reader/client. |
| `app/equipment/register/page.tsx` | N | Wraps WorkflowScreen in register mode; inherits its adapter/actions. |
| `app/equipment/replace/page.tsx` | N | Wraps WorkflowScreen in replacement mode; inherits its adapter/actions. |
| `app/equipment/supplies/page.tsx` | N | Reuses inventory page; no separate Baserow caller. |
| `app/equipment/weather-stations/page.tsx` | N | Reuses weather-stations page; no separate Baserow caller. |
| `app/error.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/fields/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/global-error.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/installer/FieldMiniMap.tsx` | N | Processed location display; keep coordinates/labels. |
| `app/installer/InstallGpsMap.tsx` | N | GPS/coordinate UI; Storage/database action remains in installer client/API. |
| `app/installer/InstallerMapView.tsx` | N | Processed assignment/removal/repair rows and callbacks; preserve status/location DTOs. |
| `app/installer/InstallerSwRegister.tsx` | N | Registers tile-only service worker; not a database cache or write queue. |
| `app/installer/layout.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/installer/pulled/layout.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/installer/tilePrefetch.ts` | N | Map-tile prefetch only, no row data. |
| `app/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/login/LoginForm.tsx` | N | NextAuth signIn UI; preserve unless separately choosing Supabase Auth; session security changes are server-side. |
| `app/login/page.tsx` | N | Login form wrapper; no data-layer rewrite. |
| `app/map/UnifiedMap.tsx` | N | Processed map layers; raw link/dropdown conversion lives in MapClient. |
| `app/map/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/planting/PlantingMapView.tsx` | N | Processed planting DTO/map callbacks; no direct database access. |
| `app/planting/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/probes/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/pulled/layout.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/racks/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/repairs/RepairsMap.tsx` | N | Processed repair DTO and status helpers; keep desktop/crew display parity. |
| `app/route/RouteClient.tsx` | N | Processed stops/location presentation; preserve props and coordinates. |
| `app/season-readiness/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/water-recs/loading.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `app/workflows/RemovalsMapView.tsx` | N | Processed workflow removal stops; preserve labels/coordinates/action callbacks. |
| `app/workflows/page.tsx` | N | WorkflowScreen wrapper; no separate data access. |
| `components/AppShell.tsx` | N | NextAuth session chrome and NotificationBell; preserve shell, inherit notification/auth fixes. |
| `components/ContactsMap.tsx` | N | Dynamic wrapper for ContactsMapInner, processed props only. |
| `components/ContactsMapInner.tsx` | N | Processed contacts/location display; no direct Baserow shapes. |
| `components/ElevationOverlay.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `components/EmptyState.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `components/FieldsMap.tsx` | N | Processed field/probe locations and status strings; keep map DTO. |
| `components/InlineCell.tsx` | N | Generic scalar/select editor; options are UI props, not a Baserow connection. Keep null clear behavior. |
| `components/InlineProbeCell.tsx` | N | Generic probe picker; IDs/options supplied by parent; keep current public-ID convention. |
| `components/InstallsMap.tsx` | N | Processed install map; no direct row transport. |
| `components/LoadingBar.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `components/LocationPicker.tsx` | N | Calls only elevation, soil and PLSS APIs; coordinates returned to parent. External services unchanged. |
| `components/LocationPickerMap.tsx` | N | Map/overlay UI for coordinates; no Baserow transport. |
| `components/MeasureTool.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `components/PLSSOverlay.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `components/PageSkeleton.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `components/Providers.tsx` | N | NextAuth and operation-focus providers; retain with server auth, reset/version stored operation IDs at cutover. |
| `components/SearchableSelect.tsx` | N | Generic value/label UI; not Baserow option metadata. Keep props. |
| `components/Sidebar.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `components/WeatherStationsMap.tsx` | N | Processed station coordinates/labels; no direct database transport. |
| `components/equipment/EquipmentShell.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `components/ui/index.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `hooks/useResizableColumns.ts` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `lib/SeasonContext.tsx` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `lib/equipment-navigation.ts` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `lib/geo.ts` | N | External soil/elevation calls only; keep geography independent of persistence. |
| `lib/hybrid-maturity.ts` | N | Pure crop calculations, unrelated to migration; no math changes. |
| `lib/measure-geo.ts` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `lib/plss.ts` | N | External PLSS/geography queries, not Baserow; unchanged. |
| `lib/repair-status.ts` | N | Pure shared status/color helpers; unchanged with same DTO status values. |
| `lib/territory-grid.ts` | N | Generic presentation, layout/loading/error, navigation, state, UI utility or geometry helper; no Baserow read/write or Baserow-specific row contract found. Preserve parent props/callbacks; no independent migration change. |
| `public/installer/sw.js` | N | Caches external map tiles only. Do not claim it caches Baserow records or flush tiles as an ID fix; InstallerApp's localStorage probe index is separate. |

### 3.4 Main-only amendment and operational code outside the app census

| File(s) | Size | Required future treatment |
|---|---|---|
| `lib/probe-removal.ts` (main only) | B | Pure shared service from unpushed 5b2c467; preserve input/return contract and source gate. Replace storage adapters, strengthen atomic selected-assignment/probe transaction, and keep crew-only notification after commit. No merge today. |
| `tests/removal.test.mjs`, `tests/removal/baserow-fixture.cjs`, `tests/removal/smoke.mjs`, `tests/removal/README.md` (main only) | B | Retain removal safety/crew-vs-Workflows webhook tests; add Supabase adapter fixtures and transactional failure assertions. Do not hit real CropX from tests. |
| `tests/equipment/baserow-fixture.cjs`, `tests/equipment/smoke.mjs`, `tests/equipment/README.md` | B | Existing fixture intercepts Baserow HTTP; add new-backend fixture/contract tests so a green old fake cannot hide unported direct callers. |
| `scripts/update-planting-data.mjs`, `scripts/update-planting-data-console.js` | B | Operational update tools outside the app runtime; audit/retire or port separately, including hardcoded row IDs. Do not run during this plan or silently keep a Baserow writer after cutover. |
| `scripts/import-baserow.ts` and importer tests/runtime | N for app switch | One-way import tooling is separate. Preserve crosswalks/manifest and source-read-only behavior. A final approved delta copy is a separate operation, not an app page action. |
| `next.config.js`, `netlify.toml`, package manifests | Separate deployment gate | Not changed here. During later implementation verify runtime support, server-only dependency packaging, private image/download hosts and environment names. No Netlify settings/deployment changes authorized by this plan. |

Inventory limit: this is exhaustive for the checked-in app/source scope above, not a claim to have enumerated external Notion bots, CropX webhook consumers or other repositories. Discover those separately before retiring Baserow. The supplied inventory's introductory claim that all access goes “through lib/baserow.ts” is too broad: this code census found the 60 direct API routes above.

## 4. Implementation order proposed for a later approval

1. **Lock the baseline and contracts.** Start a dedicated implementation branch from the approved app baseline, deliberately include the reviewed main removal amendment, and bring over the schema/import documentation without mixing app and live data work. Decide API IDs, multi-billing charge/edit rules, notification labels and option retirement. Capture synthetic contract fixtures for every table shape, response envelope and action. Keep main unchanged until review.
2. **Close access gaps before adding a privileged backend.** Define admin/staff/crew/customer-token authorization for every mutation/read family. Keep NextAuth initially; plan secure crew sessions and restricted token ownership. Approve any required backend grants/policies separately; leave client table access closed by default. Do not deploy half-switched routes with a server secret behind public wildcard paths.
3. **Build the read adapter.** Table registry, ID convention/crosswalk boundaries, scalar serializers, all 8 ordered joins, option maps, calculated-view read routing and full pagination. Implement access-aware caching and private file download projection. Keep function names/import facade. Compare complete synthetic/migration-approved read fixtures, including large water-recs result sets, empty options and missing links.
4. **Move direct read routes and server loaders.** Migrate all D read paths, auth lookups and diagnostics; test the same page/installer JSON contracts. Centralize multi-billing in fields-data and relation helpers, then repair first-link membership checks in customer pages, billing, workflow and grower grouping.
5. **Build validated write decoding and atomic actions.** Route simple creates/patches/deletes through the adapter, then multi-table actions: field setup, season/services, contact links, billing enrollment, water-rec replacement, install/removal, fulfillment, RMA/rack moves and logs. Do not globally translate every legacy DELETE into cascading deletion. Writes invalidate dependent caches only after commit; retry identifiers prevent duplicate inserts.
6. **Replace Storage and option-schema paths.** Private upload references, download authorization/expiry, orphan handling; option CRUD with row identity, color/order and explicit referenced-option behavior. Remove all Baserow user-file/schema/JWT calls. Keep report-type text as-is.
7. **Run full isolated acceptance checks.** TypeScript and production build; table serializer/write-decoder tests; transactional/concurrency tests; desktop and crew mobile smoke tests. No live side effects in regression tests. Review code diff and unresolved data-shape/business decisions with Ryan.
8. **Separate cutover approval.** Only after acceptance: plan a bounded write pause, final authorized delta copy and file verification against the **current** Baserow source, backend/version switch, fresh sessions/caches, smoke tests and rollback criteria. The completed 2026-10-12 import is a snapshot, not proof that current data will still match at switch time. No uncontrolled dual writes. If new Supabase writes occur, rollback needs an approved reconciliation plan—not a blind return to stale Baserow.

## 5. Required acceptance checks

| Area | Proof required before app cutover |
|---|---|
| Complete API inventory | Every one of the 83 route files classified; all 60 direct Baserow transport callers replaced/disabled, plus auth.ts. Scan for `api.baserow.io`, `BASEROW_`, `TABLE_IDS` URL construction, `user_field_names`, schema/file endpoints and Baserow filter strings; allow only deliberately retained importer/legacy metadata references. |
| Function compatibility | Contract tests for every exported fetcher/cache/options helper, create/update readback, getRows all-page semantics, filtering/search/order, error envelopes and null clears. Unsupported filters fail rather than return a wider dataset. |
| Identity | Fixtures where native and Baserow IDs overlap but point to different rows; row IDs, option IDs and nested link IDs all round-trip consistently. Old cache/session/integration IDs cannot mutate the wrong row. Native new rows have no fake Baserow crosswalk. |
| Billing | Zero/one/multiple field links; all from field_billing_entities. Two known multi-link examples survive read/edit unchanged; scalar edits never discard extra links. Same field is not double-counted/double-billed or exposed to an unauthorized token. |
| Relations | Preserve ordering and all link members; resolve a missing relation explicitly, not by name guess. Omitted link in PATCH is unchanged; explicit empty array clears only that relation. Contact-operation add/remove cannot overwrite another concurrent link. |
| Options | Same labels/colors/order, inactive historical options display correctly, select list filters inactive choices, strict column-specific ID resolution, duplicate-value constraints, rename/reorder preserves record linkage; referenced-option delete is safe and explicit. |
| Calculated values | Original ai_ufid/record_name/Field/field labels and source autonumbers; multi-billing season names; totals, saved rates and zero quantity. View labels transformed back into required option/link objects without overwriting base columns. |
| Removal | Same selected-assignment Removed/date/actual remover and linked probe In Stock for both paths; planned_remover untouched, other probes untouched, retry keeps history, reinstalled probe protected. **Workflows sends zero CropX webhooks; crew notifies once after successful commit.** |
| Installs/repairs | Optional photo failures visible, retry-safe install and replace, correct assignment/physical probe, no season edits accidentally resetting installed status; crew/desktop watch-list and completion parity. |
| Water recs | Full history paging; distinct report_type strings retained; scoped atomic save/retry, empty save no wipe, failed replacement retains previous rows, other dates/fields/report types untouched. Copy/report outputs unchanged. |
| Files | All imported private references still resolve under correct permissions; new uploads store bucket/path/name/size/mime, no public bucket or persisted expired URL, unauthorized access denied, stale-page URLs recover safely, failures don't orphan silently or delete shared files. |
| Money/orders/racks | Invoice recipient validation, price snapshots, zero quantities, safe retries; fulfill affects only authorized matching assignments; source/destination rack swap and undo atomic and conflict-aware. |
| Auth/access | Staff roles, inactive users, real crew sessions, admin-only PIN/options/backup/debug actions, customer ownership checks and public aggregate-only endpoints. No password hashes/PINs/server keys in page props or logs; RLS and grants reviewed separately. |
| Cache/mobile | Immediate post-write cache invalidation including joined/calculated dependents; reloaded UI shows new values; installer localStorage IDs versioned; private data not cached across different scopes; long-open mobile forms and signed-file URLs tested. |
| Safety gate | Proposed tests use fixtures/test environment by separate approval, never live CropX. No production writes or deployment until Ryan approves the implementation and cutover. |

## 6. Verification of this document (not implementation)

- Static census: 228 app/support source files; all 83 API route paths listed exactly once in section 2 (60 direct, 16 adapter/indirect, 7 non-database).
- Sections 3.1–3.3 cover the remaining 145 source files; section 3.4 separately tracks main-only removal work and operational/test tooling.
- Checked the proposed field-billing source against the second migration: the join is authoritative; the deprecated scalar remains unusable as a fallback.
- Reviewed database/view/file/auth recommendations using the Supabase skill's security checklist. No database test query or advisor was run because this is planning, not a database implementation.
- Only this Markdown file is to be staged/committed. No tsc/build/import run is needed for a documentation-only change; prior removal build/test results belong to the separate main amendment.
- Append-only Notion journey log records this document's branch and actual commit hash after committing. Do not edit historical entries or push either branch.
