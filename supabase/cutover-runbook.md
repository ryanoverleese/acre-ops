# Acre Ops morning cutover runbook

Status: PREP ONLY. Nothing below authorizes a cutover today. Stop at any failed
gate. Target is **acre-ops / junawlttpyztjlnbmvcb** only. Journal is excluded.
Never run a Baserow write from either script. Do not touch the stash
`wip hold for autosave` (`65856746e3c4f7b1776f6680aef1dc5b7ba7b408`).

## Current prep gates

- The fresh Baserow comparison is **not complete**: `BASEROW_API_TOKEN` is absent
  from `.env.local`. Production Netlify secret access was blocked by the prep
  restriction. Ryan must supply a local read-only token before proceeding.
- Read-only Supabase checks succeeded via `DATABASE_URL_ALT`, with all 65 tables
  RLS-enabled and no client table grants. Counts are in `cutover-prep-report.md`.
  These counts do **not** prove source parity or zero changed rows/files.
- No live delta apply has been executed. The delta's apply path is exercised only
  against synthetic, in-memory PostgreSQL. Review the dry run before live use.
- Confirm the CropX webhook receiver accepts **Supabase assignment IDs**, not
  Baserow IDs. Do not disable webhook dry run until this is verified. External
  tools that send old IDs need an explicit crosswalk or updated references.
- Confirm crew, desktop, billing, customer links, files, and all external writers
  passed branch acceptance. A successful build is not sufficient acceptance.

## 1. Freeze edits and establish recovery points

1. Ryan announces and confirms a write freeze. Stop Baserow UI edits, old Acre Ops
   desktop/crew edits and logins, external bots/jobs/integrations, and writes on
   the Supabase branch deployment. Login writes `last_login`; it is not read-only.
   Disable or pause writers through their authorized owners. If a writer cannot
   be stopped, **do not cut over**. The scripts cannot lock Baserow remotely.
2. Take timestamped, private backups/exports of the frozen Baserow source and
   destination Supabase database and Storage manifest/objects. Verify they are
   restorable. Do not commit customer exports, password hashes, PINs, tokens, or
   Netlify settings containing secret values. Do not delete existing backup tables.
3. Record the production deploy ID, deployed commit, remote main commit, local
   main commit, and production environment configuration in secure operations
   records. Preserve the existing Baserow environment settings for recovery.
   During prep the known deployed/remote main was `6bb77d8`; local main was
   `5b2c467`. Recheck in the morning; do not assume these are still current.
4. Confirm a clean `supabase-schema` worktree and unchanged stash/main refs. Use
   Node 24+ for the standalone scripts (Netlify's app runtime is separate).
   Keep `.env.local` private. It needs `BASEROW_API_TOKEN`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and optionally `DATABASE_URL_ALT`.
   The script pins both connection choices and Storage to the approved project.
   It tries the primary first; the alternate currently works. Never print URLs
   containing passwords, pass keys in command arguments, or paste secrets in logs.

## 2. Compare, approve, and apply the frozen delta

Run from the Acre Ops repo on `supabase-schema`:

```sh
node scripts/import-baserow.ts --dry-run
node scripts/delta-baserow.ts --dry-run --report
```

The first command validates the original import mappings and files. It is now
dry-run only: legacy `--apply` is disabled because it predates hashed PINs and
billing snapshots. The second command compares all 22 source tables, 35 option
tables, and 8 joins. It reports source/eligible/destination counts, added/changed/
deleted IDs, changed column names, native rows preserved, and new files/missing
objects. `--report` only writes local, Git-ignored `scripts/delta-report.json`;
no database, Storage, manifest, or source writes happen in dry run.

Review every difference, especially removals, deletions, PIN changes, and billing.
This is a two-way comparison, **not a historical three-way merge**: differing
values could be Baserow edits or branch-test edits. Baserow is authoritative for
its mapped columns. Reconcile meaningful Supabase test edits before approval.
Rows without `baserow_id` are retained, never treated as source deletions.
Hashed PINs that match are unchanged, newer Supabase `last_login` is retained,
and billing basis snapshots are never overwritten. Incompatible billing edits
on snapshot-backed charges are blockers. All field billing uses
`field_billing_entities`, including fields with only one entity.

All file/link errors are blocking: the delta does not clear valid existing data
after a failed download. Blank rack/rack-slot rows are logged and skipped only;
an existing destination rack with that source ID is retained. Missing source
columns/options tables are left unchanged. Review any skipped rack explicitly.
Dropdown labels and `water_recs.report_type` are not merged or normalized.

After Ryan approves the exact new/changed/deleted counts and files, substitute the
fresh report's `approval` hash (not its source-only fingerprint):

```sh
node scripts/delta-baserow.ts --apply --expected-plan=REVIEWED_64_CHARACTER_HASH --freeze-confirmed
```

If and only if the reviewed plan contains approved row/relationship/option
deletions, add `--allow-deletes`. Without it, **all writes are refused** if a
deletion is present. A changed source, destination, or file check invalidates
the approval and requires a fresh dry run. Apply collects Baserow again before
writing; the operational freeze is still essential after this last read.

Restart behavior:

- Existing private-bucket objects are byte-checked and reused. Only missing
  objects are uploaded; removed source attachments are detached from rows but
  Storage objects are retained for recovery. The existing import manifest is
  preserved and updated atomically after successful uploads.
- File transfers and PIN hashing finish before database locks. Unlike the full
  initial import, the delta uses **one atomic database transaction** for its
  related changes; a failure cannot leave half of a deletion/link replacement.
  It takes the app's advisory lock and table write locks, rechecks the reviewed
  destination snapshot, applies only changed rows/columns, and verifies values
  and counts before commit. Reads remain available. No HTTP calls occur while
  holding database locks. An unchanged table receives no INSERT/UPDATE/DELETE.
- Deletions are explicit: obsolete joins first, child rows before parents,
  options last. A retained row referencing a deletion blocks the plan, including
  native rows and cascading joins. Unexpected triggers/external-schema references
  also block. Unique-value transfers between different rows may require manual
  reconciliation; SQL failures roll back, never force-delete around constraints.
- Identity/autonumber counters only advance for tables receiving new rows; they
  never rewind. Sequence gaps after rollback are normal and harmless.
- Errors go to private `scripts/import-errors.json`. Failed database work rolls
  back; already-uploaded files are safe to reuse. For any interruption or unknown
  commit result, keep the freeze, run another dry run, review its new hash, then
  retry only the remaining differences. Do not reuse a stale approval or delete
  the manifest. Remove a stale `scripts/import.lock` only after proving its PID
  is not running; never remove an active lock.

## 3. Verify before configuring production

```sh
node scripts/delta-baserow.ts --dry-run --report
```

Require zero remaining new/changed/deleted rows and missing objects, with no
blocking errors. Review any intentionally skipped rack or destination-only row.
Compare all 65 table counts, eligible Baserow ID sets, joins, option values, and
file references; raw source counts can differ only by documented skips/native
rows. Confirm all 65 tables still have RLS, no client grants were added, the 15
views retain `security_invoker`, and the bucket remains private. Spot-check
serials, dates, actual vs planned removers, multi-entity billing shares, and files.
Keep the last successful pre/post reports privately with the backup.

## 4. Configure production Netlify (future approved action only)

Do this only after the frozen delta passes. Target the linked Acre Ops site
`b30f7623-6647-4a17-9bc2-c5fb49172a6c`, **production context only**, with appropriate
server-side Builds/Functions scopes. No values belong in Git or `netlify.toml`.
Do not reuse the preview authentication URL or accidentally edit all contexts.

Variable names:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `AUTH_TRUST_HOST`
- `REMOVAL_WEBHOOK_URL`
- `REMOVAL_WEBHOOK_KEY`
- `REMOVAL_WEBHOOK_DRY_RUN`

Use the verified project and working session-pooler connection. Generate a new
production auth secret so old Baserow-ID sessions cannot be reused against native
Supabase IDs; users must log in again. Configure authentication for the actual
production origin. Set **`REMOVAL_WEBHOOK_DRY_RUN=false`** only after receiver ID
compatibility is confirmed. The branch-deploy override must remain **true**.
Workflows must never notify; only crew removals notify after a successful commit.
Retain existing unrelated integrations and the securely recorded Baserow settings.
Changing settings does not by itself prove a new deploy used them.

## 5. Merge plan (do not execute during prep)

Local main's `5b2c4672907314fae8fc44f41bcc7b763feb57e3` is the crew-only removal
amendment. Its equivalent was cherry-picked onto Supabase as
`ed1cd5c385270affb74f3bd528fe1106b1bfbe57`, then adapted for Supabase transactions
and authorization. **Do not reset local main to origin/main or omit 5b2c467.**
The future merge must have local main, including 5b2c467, as its first parent and
the reviewed Supabase tip as its second parent. Do not cherry-pick 5b2c467 twice.

Read-only `git merge-tree --write-tree main supabase-schema` found these conflicts:

| Path | Conflict | Planned resolution |
|---|---|---|
| `app/api/removal/route.ts` | Content | Supabase route/auth/transaction, crew-only callback, env-controlled dry run |
| `lib/probe-removal.ts` | Add/add | Supabase branch version; retain source flag and crew-only notify |
| `tests/removal.test.mjs` | Add/add | Supabase branch version; retain no-webhook Workflows regression |
| `tests/removal/README.md` | Add/add | Supabase fixture documentation |
| `tests/removal/smoke.mjs` | Add/add | Supabase isolated-browser version, including webhook checks |

Workflows components auto-merge, but inspect their results: the `workflows` source
flag, actual remover input, and shared endpoint call must survive. Keep Supabase
authorization/transaction/file support. Never restore Baserow fetches to resolve
a conflict. Main and the stash were not modified by the merge simulation.

After a separately approved cutover and refreshed remote-state/conflict review:

```sh
git fetch origin
git status --short --branch
git log --oneline --left-right main...origin/main
git switch main
git merge --no-ff --no-commit supabase-schema
```

Stop if origin/main gained new changes or the worktree isn't clean; reconcile
those first with Ryan. Resolve the five listed paths deliberately (the Supabase
versions are the intended basis), review the full staged diff, and ensure:

```sh
git diff --check
git diff --cached --check
npx tsc --noEmit --incremental false
env DATABASE_URL='' DATABASE_URL_ALT='' SUPABASE_SERVICE_ROLE_KEY='' NEXT_TELEMETRY_DISABLED=1 npm run build
node --test scripts/import-baserow.test.mjs scripts/delta-baserow.test.mjs tests/supabase/contract.test.cjs tests/supabase/pin-migration.test.cjs tests/removal.test.mjs
```

Also rerun equipment/removal browser smoke tests with their documented isolated
fixtures. Build with live database credentials disabled. Never run delta after
the merge (the branch guard intentionally refuses it on main). Confirm the merge
contains 5b2c467 and both protections: no planned-remover/sibling-probe writes,
and no Workflows webhook. Commit the reviewed merge, record its SHA and both
parents, then—with Ryan's cutover authorization—`git push origin main`.

## 6. Verify the deploy, smoke test, then reopen

1. Wait for the production build to be **ready**, verify the exact merge SHA and
   production context, and inspect build/secret-scan logs. A failed build does not
   publish; leave the freeze in place and fix the failure.
2. Initially use read-only/anonymous checks: login rendering, correct production
   auth URLs, protected-page redirects, unauthorized API/file denial, and no PIN
   or credential values in browser responses. Clear stale mobile caches/tabs.
3. Then controlled staff/crew login (which writes `last_login`) with fresh
   sessions. Check Fields, CRM, Water Recs, Inventory, racks, and private photos.
   Verify all billing recipients/shares, no quantity compounding, editable options,
   customer-link scope, and correct displayed record links. Old bookmarked IDs
   and external integrations must be checked via the crosswalk, not assumed.
4. Test writes only with designated test records and explicit approval. Workflows
   removal must send no webhook, touch only the chosen assignment/probe, preserve
   `planned_remover`, and set actual remover/date/Removed/In Stock. Test the live
   crew webhook only for a genuinely approved physical removal, never as a dummy
   action on a real probe. A dry-run receiver test belongs before step 4 above.
5. Record the first post-cutover write timestamp. On acceptance, reopen **only
   the Supabase app's** approved writers. Keep Baserow frozen/read-only; do not
   restart old Baserow bots. Announce the new source of truth and document results
   in the Notion journey log. Do not retire Baserow or backups yet.

## Rollback to Baserow: freeze and fix forward

- Trigger: failed critical smoke checks, missing records/files, authorization
  failure, incorrect billing/removal effects, or a receiver-ID mismatch. Stop
  all app/automation writes and crew webhooks immediately through authorized
  operators. Preserve logs and snapshots; do not erase the Supabase database.
- **If the new deploy failed to publish:** the preceding deploy is still live;
  there is no published deploy to restore. Keep the freeze and restore compatible
  production env configuration as needed before a subsequent rebuild.
- **Before any Supabase post-cutover writes:** the frozen Baserow snapshot can
  still be authoritative. Make a new revert commit that reverses the cutover
  merge relative to its first parent (`git revert -m 1 CUTOVER_MERGE_SHA`). That
  keeps main's 5b2c467 crew-only removal fix. Review for any later commits before
  reverting; do not reset or force-push. Restore compatible Baserow production
  env settings from the secure record, use a fresh auth secret to invalidate
  Supabase-ID sessions, run checks, and push the revert with Ryan's approval.
  Let Git CI build/publish the fix-forward deploy; do not restore/publish an old
  Netlify deploy through the dashboard or API. Record the revert/deploy SHA.
- **After any Supabase writes, including login, invoice, or removal writes:**
  Baserow may be stale. Export all post-cutover changes/files and prepare an
  audited reconciliation using `baserow_id`. Native rows have no old ID and need
  explicit mapping. Obtain Ryan's separate approval for any Baserow recovery
  writes; these one-way scripts must NEVER write to Baserow. Do not simply reopen
  the stale source and lose those edits. If reconciliation isn't ready, keep
  writers paused and fix the Supabase app forward instead.
- Reconcile any real CropX webhook effects separately: reverting application
  code does not undo a physical/device operation or an external notification.
- Verify the Baserow recovery deploy and smoke-test both removal paths before
  reopening writers. Preserve data, manifests, stash, and history throughout.

## Technical references

The Supabase guidance informed private Storage, verified TLS/project identity,
RLS checks, and fail-closed relationships. Network work precedes SQL locks and
the entire transaction uses one client, following
[node-postgres transactions](https://node-postgres.com/features/transactions).
Netlify's deploy skill requires a new revert/fix-forward deploy, not restoring
an old deploy; see [deploy failure guidance](https://docs.netlify.com/resources/troubleshooting/fix-a-failed-deploy/).
