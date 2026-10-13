# Cutover prep — 2026-10-13

**PREP ONLY; read-only comparison complete. No delta was applied.**

Branch: `supabase-schema`. Prep started at `996d12e`. Main remains
`5b2c4672907314fae8fc44f41bcc7b763feb57e3`; stash remains
`65856746e3c4f7b1776f6680aef1dc5b7ba7b408`.

## Completed comparison — October 13, 2026, 10:45 AM America/Chicago

The earlier missing-token blocker was resolved when Ryan supplied a credential
directly. It was used only in process memory, not persisted to `.env.local`,
printed, or committed. Production Netlify was not accessed. A fresh full importer
dry run and a separate fresh delta dry run both completed successfully. Their
source fingerprints matched. Baserow was read with GET only; Postgres reads used
server-enforced read-only transactions, and Storage was only read.

**Delta: 4 new water recommendations; 0 changed rows to sync; 0 deleted rows;
0 new files; 0 errors.** The new `water_recs` Baserow IDs are `22508`, `22509`,
`22510`, and `22511`. There are no skipped source rows or missing links/files.
The comparison deliberately preserves one newer Supabase `users.last_login` and
all 7 already-hashed installer PINs; these are not overwrite candidates. Billing
basis snapshots also remain destination-owned. Report-type labels are unchanged.

Verified the approved Supabase project via `DATABASE_URL_ALT` after trying the
primary: all 65 tables retain RLS, all 15 views use security-invoker permissions,
the bucket is private, applied PIN/billing constraints are present, and no client
table grants or unexpected triggers/external-schema references were found.

This is a point-in-time comparison, not an edit freeze or approval to apply it.
Repeat the dry run under the cutover freeze and review a fresh approval hash.
Provision a replacement read-only token securely before the next run; the supplied
token was not saved locally and should be rotated because it was shared in chat.

## Per-table differences

“Changed” means source-owned values that would actually be updated, after the
documented PIN, login-date, and billing-snapshot preservation rules.

| Table | Baserow | Supabase | New | Changed | Deleted |
|---|---:|---:|---:|---:|---:|
| products_services | 39 | 39 | 0 | 0 | 0 |
| inventory | 11 | 11 | 0 | 0 | 0 |
| users | 2 | 2 | 0 | 0 | 0 |
| installers | 7 | 7 | 0 | 0 | 0 |
| mileage_logs | 17 | 17 | 0 | 0 | 0 |
| documents | 8 | 8 | 0 | 0 | 0 |
| billing_entities | 151 | 151 | 0 | 0 | 0 |
| contacts | 117 | 117 | 0 | 0 | 0 |
| operations | 66 | 66 | 0 | 0 | 0 |
| fields | 594 | 594 | 0 | 0 | 0 |
| weather_stations | 63 | 63 | 0 | 0 | 0 |
| field_seasons | 663 | 663 | 0 | 0 | 0 |
| probes | 597 | 597 | 0 | 0 | 0 |
| probe_rack | 576 | 576 | 0 | 0 | 0 |
| probe_assignments | 724 | 724 | 0 | 0 | 0 |
| repairs | 127 | 127 | 0 | 0 | 0 |
| water_recs | 15,771 | 15,767 | 4 | 0 | 0 |
| invoices | 82 | 82 | 0 | 0 | 0 |
| invoice_lines | 59 | 59 | 0 | 0 | 0 |
| orders | 13 | 13 | 0 | 0 | 0 |
| order_items | 32 | 32 | 0 | 0 | 0 |
| notifications | 0 | 0 | 0 | 0 | 0 |
| **22 base tables** | **19,719** | **19,715** | **4** | **0** | **0** |

### Dropdown option tables

| Table | Source options | Supabase | New | Changed | Deleted |
|---|---:|---:|---:|---:|---:|
| contact_customer_type_options | 11 | 11 | 0 | 0 | 0 |
| contact_main_contact_options | 2 | 2 | 0 | 0 | 0 |
| field_water_source_options | 4 | 4 | 0 | 0 | 0 |
| field_fuel_source_options | 9 | 9 | 0 | 0 | 0 |
| field_irrigation_type_options | 7 | 7 | 0 | 0 | 0 |
| field_row_direction_options | 6 | 6 | 0 | 0 | 0 |
| field_drip_tubing_direction_options | 2 | 2 | 0 | 0 | 0 |
| probe_brand_options | 6 | 6 | 0 | 0 | 0 |
| probe_status_options | 13 | 13 | 0 | 0 | 0 |
| probe_rack_options | absent* | 0 | — | — | — |
| probe_trade_year_options | 2 | 2 | 0 | 0 | 0 |
| field_season_crop_options | 6 | 6 | 0 | 0 | 0 |
| field_season_side_dress_options | 10 | 10 | 0 | 0 | 0 |
| field_season_early_removal_options | 11 | 11 | 0 | 0 | 0 |
| field_season_early_install_options | 3 | 3 | 0 | 0 | 0 |
| field_season_ready_to_remove_options | 2 | 2 | 0 | 0 | 0 |
| field_season_planned_installer_options | 3 | 3 | 0 | 0 | 0 |
| field_season_planned_remover_options | 6 | 6 | 0 | 0 | 0 |
| field_season_remover_options | 9 | 9 | 0 | 0 | 0 |
| field_season_removal_priority_options | 2 | 2 | 0 | 0 | 0 |
| field_season_approval_status_options | 3 | 3 | 0 | 0 | 0 |
| assignment_antenna_type_options | 8 | 8 | 0 | 0 | 0 |
| assignment_battery_type_options | 3 | 3 | 0 | 0 | 0 |
| assignment_probe_status_options | 6 | 6 | 0 | 0 | 0 |
| assignment_approval_status_options | 3 | 3 | 0 | 0 | 0 |
| invoice_status_options | 3 | 3 | 0 | 0 | 0 |
| product_category_options | 4 | 4 | 0 | 0 | 0 |
| product_unit_options | 4 | 4 | 0 | 0 | 0 |
| product_status_options | 2 | 2 | 0 | 0 | 0 |
| inventory_category_options | absent* | 0 | — | — | — |
| user_role_options | 2 | 2 | 0 | 0 | 0 |
| weather_station_connectivity_options | 3 | 3 | 0 | 0 | 0 |
| weather_station_status_options | 3 | 3 | 0 | 0 | 0 |
| order_status_options | 5 | 5 | 0 | 0 | 0 |
| notification_page_type_options | 2 | 2 | 0 | 0 | 0 |
| **Total** | **165** | **165** | **0** | **0** | **0** |

### Relationship tables

| Table | Source links | Supabase | New | Changed | Deleted |
|---|---:|---:|---:|---:|---:|
| field_billing_entities | 595 | 595 | 0 | 0 | 0 |
| contact_operations | 92 | 92 | 0 | 0 | 0 |
| contact_billing_entities | 128 | 128 | 0 | 0 | 0 |
| contact_customer_types | 246 | 246 | 0 | 0 | 0 |
| probe_contacts | 424 | 424 | 0 | 0 | 0 |
| probe_billing_entities | 528 | 528 | 0 | 0 | 0 |
| probe_owner_operations | absent* | 0 | — | — | — |
| field_season_services | 318 | 318 | 0 | 0 | 0 |
| **Total** | **2,331** | **2,331** | **0** | **0** | **0** |

*The source fields `probes.rack`, `inventory.category`, and
`probes.owner_operation` are absent. Their three destination tables are empty and
are deliberately left unmanaged/unchanged, not interpreted as source deletions.
The delta compares 62 source-backed tables; the full importer checks counts and
schema for all 65. No destination-native rows were found in the managed tables.

Current destination total: **22,211**. Expected total after this particular delta:
**22,215**. Journal remains excluded. Nothing has been loaded.

### Files and fingerprints

- Existing references verified: **250** (302,539,823 bytes).
- New references / missing objects / uploaded files: **0 / 0 / 0**.
- Failed files / data errors / skipped source rows: **0 / 0 / 0**.
- Existing file hashes and sizes matched the preserved import manifest.
- Source fingerprint (same in both fresh collections):
  `745290cd6ce8ef5f6380a7c30749d3761a0cc7c1d3ba517efe1ed6ff060f6a06`.
- Destination fingerprint:
  `68bc20d9cf0efff7f239b319410eabc141556055a2fe36f5a9652d9ca97d4d0b`.
- Point-in-time plan fingerprint (not authorization to apply):
  `699af164e59392ee4ab53794bed6ac1c183a76de0ff5d815cc47b93a210978d6`.
- Private machine-readable report: `scripts/delta-report.json` (Git-ignored,
  mode 0600). No manifest or existing import-error/report files were rewritten.

## Prepared changes

- `scripts/delta-baserow.ts`: read-only comparison, explicit approved-plan apply
  guard, source/destination fingerprints, restartable private Storage transfers,
  targeted INSERT/UPDATE/DELETE, crosswalk remapping, option and join differences,
  hashed PIN preservation/conversion, native-row and billing-snapshot safety,
  atomic related SQL changes, error logging, and post-write value/count checks.
  The live apply command was **not run**.
- `scripts/delta-baserow.test.mjs`: isolated tests for canonical comparisons,
  native/skipped-row preservation, PINs/billing, all-table planning, missing
  files/links, FK deletion protection, approval/write guards, new ID remapping,
  rollback, concurrent changes, and restart behavior.
- `scripts/import-baserow.ts`: recognizes the already-applied billing columns,
  shares existing source/file/connection safeguards with the delta, checks
  preexisting object bytes during dry runs, and blocks obsolete full-import apply.
- `scripts/import-baserow.README.md`, `scripts/.gitignore`: document the cutover
  entry point and keep the new private delta report out of Git.
- `supabase/cutover-runbook.md`: freeze/backup, compare/approve/sync/verify,
  production environment **names only**, merge/push, smoke testing, and explicit
  recovery to Baserow without losing post-cutover writes. It includes main's
  local `5b2c467` and its existing branch equivalent `ed1cd5c`.

## Merge conflicts

Read-only merge-tree analysis found five conflicts; no merge was performed:

- `app/api/removal/route.ts` (content)
- `lib/probe-removal.ts` (add/add)
- `tests/removal.test.mjs` (add/add)
- `tests/removal/README.md` (add/add)
- `tests/removal/smoke.mjs` (add/add)

Use the Supabase branch implementations as the resolution basis, retain crew-only
notify and the source flag from `5b2c467`, and review auto-merged Workflows screens.
Details and verification commands are in the runbook. Do not reset local main.

## Verification

TypeScript and the production build passed with live database credentials disabled.
The build retains the existing middleware-to-proxy deprecation warning. The 87
automated tests (13 new delta tests plus the existing 74) and 15 isolated browser
checks pass. All apply-path tests use synthetic local PostgreSQL, not the live
project; browser checks block external traffic.

TypeScript, build, all 87 automated tests, and all 15 browser checks were rerun
successfully during this follow-up. No application or script code was
changed in this follow-up; only this report and the runbook were updated.

No source writes, live database/Storage writes, production Netlify changes, merge,
push, or stash operations occurred. Live delta apply remains intentionally unrun.
