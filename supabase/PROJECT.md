# Acre Ops Supabase project

## Project identity

- Project name: `acre-ops`
- Project ref: `junawlttpyztjlnbmvcb`
- Project URL: [https://junawlttpyztjlnbmvcb.supabase.co](https://junawlttpyztjlnbmvcb.supabase.co)
- Dashboard: [Open acre-ops](https://supabase.com/dashboard/project/junawlttpyztjlnbmvcb)
- Organization: Acre Insights (`bcjwjhlwqewrgtlicybl`)
- Region: `us-east-1` — East US (North Virginia)
- Plan: Free — **$0/month**, confirmed before creation using the organization's Free plan, available active-project allowance, and [Supabase's published pricing](https://supabase.com/pricing).
- Project status verified: `ACTIVE_HEALTHY`
- PostgreSQL version reported: `17.11.0.003`
- Created and verified: 2026-10-12
- Purpose: isolated migration destination; the live Acre Ops app still uses Baserow.

The setup verification below records the initial empty project. Subsequent
approved changes are recorded chronologically at the end of this file.

No keys, passwords, or connection strings containing credentials are stored here. Ryan completed the database-password and final project-creation steps in the Supabase dashboard.

The Supabase dashboard's `main` label names this new project's default database branch; it is not the repository's Git `main` branch.

## Applied migration

- Source branch: `supabase-schema`
- Source commit: `368e25de179b6dd7a688d3a9632bd0349037a6fb`
- Source file: `supabase/migrations/001_init.sql`
- Source Git blob: `30e6830c574c03deab1f4bd3d7142a3e8cb913c0`
- Source file SHA-256: `a2c0dbb2fb41acc05d356ccf068a43eaf1d7c854d84ca3d300d91ac42981e6c3`
- Supabase migration name: `001_init`
- Supabase migration version: `20261012180039`

The SQL was read directly from the specified commit and applied without edits, once, to this project only. The public schema and migration history were empty before application. The migration's historical “draft/not executed” comments describe its original authoring stage; this document records its subsequent authorized application.

## Verification

Read-only database checks after application confirmed:

- Exactly **64 public tables**: 22 Baserow source tables, 35 editable options tables, and 7 join tables. Names match the committed migration.
- **RLS enabled on all 64 tables** (`pg_class.relrowsecurity = true`); no public table is missing RLS.
- Exactly **15 public views**, all with `security_invoker=true`. Views use the caller's permissions and underlying-table RLS; views do not have a separate RLS switch.
- Exact `COUNT(*)` queries returned **0 rows for every table and view**. No business data or dropdown values were imported.
- Neither `anon` nor `authenticated` has table/view privileges on any of the 79 public relations. Client access intentionally remains closed.
- Security Advisor returned only 64 informational `rls_enabled_no_policy` findings. This is the migration's deliberate default-deny starting point, not public access. Grants and access policies require a separately reviewed migration before app use. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- The new project's “Automatically expose new tables” setting was disabled during setup. The migration itself explicitly enables RLS on each table and revokes client privileges.

Counts above cover the migration's `public` schema, not Supabase-managed internal schemas.

## Tables

All tables below are in `public`, are empty, and have RLS enabled.

### Baserow source tables (22)

- `billing_entities`
- `contacts`
- `documents`
- `field_seasons`
- `fields`
- `installers`
- `inventory`
- `invoice_lines`
- `invoices`
- `mileage_logs`
- `notifications`
- `operations`
- `order_items`
- `orders`
- `probe_assignments`
- `probe_rack`
- `probes`
- `products_services`
- `repairs`
- `users`
- `water_recs`
- `weather_stations`

### Editable options tables (35)

- `assignment_antenna_type_options`
- `assignment_approval_status_options`
- `assignment_battery_type_options`
- `assignment_probe_status_options`
- `contact_customer_type_options`
- `contact_main_contact_options`
- `field_drip_tubing_direction_options`
- `field_fuel_source_options`
- `field_irrigation_type_options`
- `field_row_direction_options`
- `field_season_approval_status_options`
- `field_season_crop_options`
- `field_season_early_install_options`
- `field_season_early_removal_options`
- `field_season_planned_installer_options`
- `field_season_planned_remover_options`
- `field_season_ready_to_remove_options`
- `field_season_removal_priority_options`
- `field_season_remover_options`
- `field_season_side_dress_options`
- `field_water_source_options`
- `inventory_category_options`
- `invoice_status_options`
- `notification_page_type_options`
- `order_status_options`
- `probe_brand_options`
- `probe_rack_options`
- `probe_status_options`
- `probe_trade_year_options`
- `product_category_options`
- `product_status_options`
- `product_unit_options`
- `user_role_options`
- `weather_station_connectivity_options`
- `weather_station_status_options`

### Join tables (7)

- `contact_billing_entities`
- `contact_customer_types`
- `contact_operations`
- `field_season_services`
- `probe_billing_entities`
- `probe_contacts`
- `probe_owner_operations`

## Views (15)

All views below are in `public`, use `security_invoker=true`, and returned zero rows when checked.

- `billing_entity_invoice_totals`
- `billing_entity_operations`
- `field_seasons_calculated`
- `fields_calculated`
- `invoice_lines_calculated`
- `invoices_calculated`
- `mileage_logs_calculated`
- `notifications_calculated`
- `order_items_calculated`
- `orders_calculated`
- `probe_assignments_calculated`
- `probe_rack_calculated`
- `products_services_calculated`
- `repairs_calculated`
- `water_recs_calculated`

## Supporting function

- `public.storage_file_refs_valid(jsonb)` validates the Storage-reference arrays. This is the function from the committed migration, not an additional schema change.

## Scope kept unchanged

- No other Supabase project was modified, including `reminders`, `acre-fertility`, or `MeterCalc`.
- No data, files, users, or passwords were imported; no Storage buckets were created.
- No Baserow records or schemas were changed.
- No application code, migration source, or `main` branch was changed.
- No repository push or app deployment was performed.
- This documentation file is saved locally on `supabase-schema`; no new commit was requested for this provisioning step.

## 2026-10-12: billing relationships and import preparation

- Applied the separately approved `field_billing_entities` correction only to
  this project (server migration `20261012183525`; repository migration
  `supabase/migrations/20261012183218_field_billing_entities.sql`). The schema now
  has **65 tables** (22 source, 35 options, 8 joins) and 15 views.
- Every field's billing links, including single-entity fields, belong in
  `field_billing_entities`. The deprecated `fields.billing_entity_id` stays NULL.
  The app must read/write billing through this join when switching to Supabase.
- The full importer dry run verified all 65 tables were empty and RLS-enabled,
  with client access still closed. It found 19,715 source records, 165 dropdown
  options, and 2,331 join links: **22,211 expected destination rows**. Journal's
  five inventory records are excluded. The supplied inventory headline is
  overstated by 1,000; its individual table counts sum to 19,720 including journal.
- All 250 attachment references passed download checks (302,539,823 bytes),
  with zero errors and zero skipped rack rows. No data or files were written
  during that dry run. All 31 importer tests and TypeScript checking passed.
- Import reads `.env.local` without printing credentials; Postgres tries
  `DATABASE_URL` first, then `DATABASE_URL_ALT` only on connection failure.
  The alternate passed verification, with TLS validation enabled.
- Ryan approved committing the importer on `supabase-schema` without pushing,
  followed by the real run. The completed run's results will be appended below;
  approval is not a claim that the import has completed.
