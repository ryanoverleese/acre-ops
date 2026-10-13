# Acre Ops cutover execution — October 13, 2026

Status: **Local merge verified; waiting for Ryan's explicit "push".**
Production is still the Baserow deployment. Do not reopen editing or call this
cutover complete until the new deployment and live smoke tests pass.

## Approved exceptions

- Ryan confirmed the writer freeze, then instructed: skip delta sync because
  water recommendations 22508–22511 are not needed. No delta apply was run.
  Baserow has 19,719 base rows; Supabase retains 19,715. The sole difference is
  15,771 versus 15,767 water recommendations. Nothing was deleted from Baserow.
- Production and branch-deploy `REMOVAL_WEBHOOK_DRY_RUN` are **true**.
  Grok Bot must verify the receiver's native Supabase assignment-ID handling
  before Ryan separately approves false. No webhook was fired by this cutover.
- Main's existing clean worktree at `/private/tmp/acre-ops-removal.xSETkI`
  is used for the merge; the primary repository remains on `supabase-schema`.
  The protected `wip hold for autosave` stash remains
  `65856746e3c4f7b1776f6680aef1dc5b7ba7b408`.

## Recovery and comparison

The private recovery export completed at `2026-10-13T22:13:35.616Z`.
All 65 public tables were restored and compared in an isolated local
PostgreSQL-compatible instance. All 250 private Storage objects were downloaded
and byte-verified, totaling 302,539,823 bytes. The export also contains the source
snapshot, identity sequence state, migrations, schema metadata, file manifest,
and private Netlify recovery records. It is an application-data recovery export,
not a managed-service/cluster backup; existing live backup tables were untouched.
Private locations are recorded in the Notion log, not committed exports.

The full importer dry run and detailed delta dry run passed. The latter finished
at `2026-10-13T22:15:11.428Z`, with only the four waived additions, no changed or
deleted rows, no new/missing files, no skipped rack rows, and no errors. Newer
destination login time and all seven bcrypt PINs were preserved. Security checks
confirmed RLS on all 65 tables, 15 security-invoker views, closed client table
grants, the private bucket, and the applied PIN/billing constraints.

Fingerprints:

- Source: `745290cd6ce8ef5f6380a7c30749d3761a0cc7c1d3ba517efe1ed6ff060f6a06`
- Destination: `68bc20d9cf0efff7f239b319410eabc141556055a2fe36f5a9652d9ca97d4d0b`
- Reviewed comparison: `699af164e59392ee4ab53794bed6ac1c183a76de0ff5d815cc47b93a210978d6`

No live database or Storage writes occurred. The 165 dropdown-option rows and
2,331 join rows match, including all 595 field-billing links. Supabase contains
22,211 rows across the 65 tables below; the unwaived source-derived total would
be 22,215. The journal remains excluded. These are pre-push frozen counts.

| Table | Baserow / derived expected | Supabase | Result |
|---|---:|---:|---|
| assignment_antenna_type_options | 8 | 8 | Match |
| assignment_approval_status_options | 3 | 3 | Match |
| assignment_battery_type_options | 3 | 3 | Match |
| assignment_probe_status_options | 6 | 6 | Match |
| billing_entities | 151 | 151 | Match |
| contact_billing_entities | 128 | 128 | Match |
| contact_customer_type_options | 11 | 11 | Match |
| contact_customer_types | 246 | 246 | Match |
| contact_main_contact_options | 2 | 2 | Match |
| contact_operations | 92 | 92 | Match |
| contacts | 117 | 117 | Match |
| documents | 8 | 8 | Match |
| field_billing_entities | 595 | 595 | Match |
| field_drip_tubing_direction_options | 2 | 2 | Match |
| field_fuel_source_options | 9 | 9 | Match |
| field_irrigation_type_options | 7 | 7 | Match |
| field_row_direction_options | 6 | 6 | Match |
| field_season_approval_status_options | 3 | 3 | Match |
| field_season_crop_options | 6 | 6 | Match |
| field_season_early_install_options | 3 | 3 | Match |
| field_season_early_removal_options | 11 | 11 | Match |
| field_season_planned_installer_options | 3 | 3 | Match |
| field_season_planned_remover_options | 6 | 6 | Match |
| field_season_ready_to_remove_options | 2 | 2 | Match |
| field_season_removal_priority_options | 2 | 2 | Match |
| field_season_remover_options | 9 | 9 | Match |
| field_season_services | 318 | 318 | Match |
| field_season_side_dress_options | 10 | 10 | Match |
| field_seasons | 663 | 663 | Match |
| field_water_source_options | 4 | 4 | Match |
| fields | 594 | 594 | Match |
| installers | 7 | 7 | Match |
| inventory | 11 | 11 | Match |
| inventory_category_options | 0 | 0 | Unmanaged, remains empty |
| invoice_lines | 59 | 59 | Match |
| invoice_status_options | 3 | 3 | Match |
| invoices | 82 | 82 | Match |
| mileage_logs | 17 | 17 | Match |
| notification_page_type_options | 2 | 2 | Match |
| notifications | 0 | 0 | Match |
| operations | 66 | 66 | Match |
| order_items | 32 | 32 | Match |
| order_status_options | 5 | 5 | Match |
| orders | 13 | 13 | Match |
| probe_assignments | 724 | 724 | Match |
| probe_billing_entities | 528 | 528 | Match |
| probe_brand_options | 6 | 6 | Match |
| probe_contacts | 424 | 424 | Match |
| probe_owner_operations | 0 | 0 | Unmanaged, remains empty |
| probe_rack | 576 | 576 | Match |
| probe_rack_options | 0 | 0 | Unmanaged, remains empty |
| probe_status_options | 13 | 13 | Match |
| probe_trade_year_options | 2 | 2 | Match |
| probes | 597 | 597 | Match |
| product_category_options | 4 | 4 | Match |
| product_status_options | 2 | 2 | Match |
| product_unit_options | 4 | 4 | Match |
| products_services | 39 | 39 | Match |
| repairs | 127 | 127 | Match |
| user_role_options | 2 | 2 | Match |
| users | 2 | 2 | Match |
| water_recs | 15771 | 15767 | 4 rows intentionally omitted |
| weather_station_connectivity_options | 3 | 3 | Match |
| weather_station_status_options | 3 | 3 | Match |
| weather_stations | 63 | 63 | Match |

## Production environment

Configured only the production context on Netlify site
`b30f7623-6647-4a17-9bc2-c5fb49172a6c`. Server secrets use Builds/Functions
scopes; existing scope settings were preserved. Names set (no values recorded):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `AUTH_TRUST_HOST`
- `REMOVAL_WEBHOOK_DRY_RUN`

The database connection uses the working session pooler from local
`DATABASE_URL_ALT`, pinned to `junawlttpyztjlnbmvcb`. A new production auth
secret invalidates old Baserow-ID sessions once deployed; users must log in again.
The production auth origin is the production site, not the branch URL.
Existing `REMOVAL_WEBHOOK_URL` / `REMOVAL_WEBHOOK_KEY`, Baserow credentials,
unrelated variables, all non-production values, and all existing scopes were
verified unchanged. Netlify secrets remain masked on readback; write requests
succeeded and production contexts are present. No build or deploy was triggered.

Published production remains deploy `6acd1054119fbe676a5b71b8`, commit
`6bb77d8f426a24fcc7e4f360864643df259ef2fa`. Daily Brief remains disabled and
there were no unfinished water-rec workflow runs. The separate manual workflow
remains enabled but is included in Ryan's freeze.

## Local merge and verification

- First parent: main `5b2c4672907314fae8fc44f41bcc7b763feb57e3`.
- Second parent: supabase-schema `65ad28ab099db6a010c120de2dcb9ca294db07af`,
  which adds the approved cutover exceptions and push gate to the runbook.
- Resolved the five predicted conflicts with the reviewed Supabase versions:
  removal route, shared removal service, removal unit tests, removal README,
  and removal browser checks. Both Workflows components auto-merged and match
  the tested Supabase branch exactly.
- Every runtime-code file matches the reviewed Supabase branch. Extra merge
  edits are this execution report and whitespace-only cleanup in
  `supabase/baserow-inventory.md` and `supabase/app-switch-report.md`.
- Both removal paths retain Removed/date/actual-remover/In Stock writes,
  selected-probe scope, and planned-remover protection. Only crew requests
  schedule a webhook, after a successful transaction, using native assignment
  IDs and the configured dry-run flag.
- `npx tsc --noEmit --incremental false`: passed.
- Production build with live database credentials disabled: passed.
- Importer, delta, Supabase contracts, PIN migration, removal tests:
  **87 passed, 0 failed**.
- Isolated browser checks: **11 equipment/billing + 4 removal passed**.
- Lockfile dependency install/audit: **0 vulnerabilities**.
- Final diff/conflict checks: passed. No app behavior changes were introduced
  while resolving the merge.
- Non-blocking warnings: Next's middleware-to-proxy convention deprecation,
  and Node module-type warnings in standalone TypeScript test scripts.

## Next gate

Show the merge commit and summary, then wait for Ryan's explicit **push**.
No push, production deploy, or live login/mutation smoke tests have occurred.
After approval: push main, verify Netlify's production build and exact SHA,
then smoke-test login, fields, probes, billing, documents, and installer login.
Keep Baserow and other writers frozen until acceptance. Recovery remains the
runbook's reviewed revert/fix-forward procedure, not restoring an old Netlify
deployment. Preserve Baserow, private backups, and the stash.
