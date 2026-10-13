# Cutover prep — 2026-10-13

**PREP ONLY; source comparison incomplete. No delta was applied.**

Branch: `supabase-schema`. Prep started at `996d12e`. Main remains
`5b2c4672907314fae8fc44f41bcc7b763feb57e3`; stash remains
`65856746e3c4f7b1776f6680aef1dc5b7ba7b408`.

## Live comparison blocker

`node scripts/import-baserow.ts --dry-run` stopped before collection because
`BASEROW_API_TOKEN` is missing from the repo's `.env.local`. The safety reviewer
rejected retrieving the production Netlify token under the explicit instruction
not to touch production. No Netlify secrets were read and no workaround was used.
Requested a local read-only Baserow token from Ryan. Do not interpret this as an
all-clear, reuse the initial-import source counts as fresh counts, or report zero
changes. Current source row/file differences remain **unknown**.

The isolated Supabase read-only check succeeded via `DATABASE_URL_ALT` after
trying the primary connection, confirmed the pinned project, all 65 tables with
RLS, private import bucket, expected columns, and no public/client table grants.
This destination-only check does not establish parity with Baserow.

## Current destination counts

All “unknown” entries require the fresh Baserow collection, not an estimate.

| Table | Supabase rows | New source rows | Changed | Deleted |
|---|---:|---|---|---|
| products_services | 39 | unknown | unknown | unknown |
| inventory | 11 | unknown | unknown | unknown |
| users | 2 | unknown | unknown | unknown |
| installers | 7 | unknown | unknown | unknown |
| mileage_logs | 17 | unknown | unknown | unknown |
| documents | 8 | unknown | unknown | unknown |
| billing_entities | 151 | unknown | unknown | unknown |
| contacts | 117 | unknown | unknown | unknown |
| operations | 66 | unknown | unknown | unknown |
| fields | 594 | unknown | unknown | unknown |
| weather_stations | 63 | unknown | unknown | unknown |
| field_seasons | 663 | unknown | unknown | unknown |
| probes | 597 | unknown | unknown | unknown |
| probe_rack | 576 | unknown | unknown | unknown |
| probe_assignments | 724 | unknown | unknown | unknown |
| repairs | 127 | unknown | unknown | unknown |
| water_recs | 15,767 | unknown | unknown | unknown |
| invoices | 82 | unknown | unknown | unknown |
| invoice_lines | 59 | unknown | unknown | unknown |
| orders | 13 | unknown | unknown | unknown |
| order_items | 32 | unknown | unknown | unknown |
| notifications | 0 | unknown | unknown | unknown |
| **22 base tables** | **19,715** | **unknown** | **unknown** | **unknown** |

The 35 lookup tables contain 165 rows; the 8 joins contain 2,331 rows, giving
22,211 destination rows across all 65 tables. New source files and missing
destination objects are **not yet checked**. Counts alone cannot detect changes.

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

No source writes, live database/Storage writes, production Netlify changes, merge,
push, or stash operations occurred. Fresh source comparison and live end-to-end
delta validation remain blocked pending the local Baserow credential.
