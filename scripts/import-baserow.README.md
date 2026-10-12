# One-way Baserow import

Run with Node 24 or newer from branch `supabase-schema`. App dependencies and
configuration, migrations, policies and grants are not changed by the importer. It is
pinned to the SHA-256 of `001_init.sql` at commit `368e25d` and the approved
`20261012183218_field_billing_entities.sql` correction. Both must already be applied.

Source: Baserow database **360377**, the 22 inventory table IDs only. The Baserow
client exposes **GET only**. `journal` is excluded. Destination is hard-coded to
**acre-ops / junawlttpyztjlnbmvcb**, organization `bcjwjhlwqewrgtlicybl`.

## Credentials

The script loads the ignored `.env.local` in the repo root. Existing process
environment variables take precedence. Set:

```dotenv
BASEROW_API_TOKEN=read-only-source-token
DATABASE_URL=acre-ops-postgres-connection-string
DATABASE_URL_ALT=optional-acre-ops-session-pooler-connection-string
SUPABASE_URL=https://junawlttpyztjlnbmvcb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=acre-ops-sb_secret-key-or-legacy-service-role-JWT
```

`SUPABASE_SECRET_KEY` may replace `SUPABASE_SERVICE_ROLE_KEY`. These are **not** the
anonymous/publishable key or another project's keys. The Postgres password belongs
only in `DATABASE_URL` / `DATABASE_URL_ALT`, never in the Storage key variable.
Keep the environment file private (`chmod 600 .env.local`).
Never paste values into chat or commit them. The script never displays them.

No management token or Management API is used. Parameterized SQL uses one `pg`
client over the Postgres protocol. The connection must be pinned to
`db.junawlttpyztjlnbmvcb.supabase.co` (user `postgres`) or the Supabase session
pooler (user `postgres.junawlttpyztjlnbmvcb`), port 5432 and database `postgres`.
The primary connection is tried first; the alternate is used only if connecting
fails, not to bypass schema or Storage validation. TLS certificate verification
stays enabled using the bundled public Supabase Root 2021 CA in
`scripts/import-runtime/supabase-ca.crt`, scoped to this Postgres client only.
Its official source is the certificate URL in Supabase's
[dashboard configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json):
[public CA download](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).
This is a public trust certificate, not a key or password. Do not disable
certificate or hostname checks. Never print connection URLs.
Storage authenticates either key format via GET at the fixed Acre Ops Storage
API; JWT claims are not decoded or trusted. No client grants or RLS changes occur.

## Run

```sh
npm ci --prefix scripts/import-runtime --ignore-scripts
node --test scripts/import-baserow.test.mjs
node scripts/import-baserow.ts --dry-run
```

The full dry run reads all source pages and metadata, checks field mappings,
values, options, cross-links, duplicate serials and autonumbers, verifies the
destination identity/schema/RLS, counts its tables, and downloads attachments to
memory (or verifies previously copied attachments). It writes **nothing**: no
rows, buckets, files, manifest, error log, lock or local report.

It prints the source fingerprint, per-table counts, file counts and issues. Review
these first. Missing links/files are nonblocking; incompatible scalar values,
duplicate unique values, missing required fields, or unmodeled source columns
block the whole import before writes. No data is invented or silently truncated.

Then copy the fingerprint from that **full** dry run:

```sh
node scripts/import-baserow.ts --apply --expected-fingerprint=THE_64_CHARACTER_HASH
```

Apply repeats preflight and refuses a changed source fingerprint. Live source
edits are not locked: use a quiet window, and rerun dry/apply if source data
changes. A completed import represents its collected source snapshot, not later
edits. There is no Baserow mutation or live-app cutover.

If only the Baserow token is available, this supplementary command checks the
source. It is **not** a completed full dry run and cannot verify Supabase access:

```sh
node scripts/import-baserow.ts --source-only
```

## Restart and reconciliation

- Lookup tables precede the requested 22-table dependency order; all eight joins
  are last. Options use exact values, not IDs, when resolving dropdown links.
  `water_recs.report_type` remains its exact original label (no merging).
- **Every field's billing links go into `field_billing_entities`**, including
  fields with exactly one billing entity. This join is the sole authoritative
  billing relationship. The importer leaves the deprecated `fields.billing_entity_id`
  NULL for all fields; it does not choose a primary entity. When the app switches
  to Supabase, it **must read/write billing through the join table**. The corrected
  season view derives billing and original multi-entity record names from it.
- Every source row is upserted on `baserow_id`. Foreign keys use the destination
  crosswalk, never old IDs directly. Join endpoints form their conflict key.
  Read and write batches are 200 rows, including `water_recs`.
- Each lookup, source, and join table uses exactly one write transaction across
  all its batches. A failure rolls back that table; previously committed tables
  stay intact. Files are transferred before the table transaction opens and the
  manifest permits their reuse on retry. Identity counters advance after that
  table's rows, in the same transaction; PostgreSQL sequence changes themselves
  are nontransactional, so harmless gaps can remain after rollback. No sequence
  is rewound. Dry-run SQL uses explicit READ ONLY transactions as well as a
  read-only session default; write-transaction and upload guards remain closed.
- Blank text/serials become `NULL`. Optional columns absent from the live source
  are not overwritten; their schema defaults/current values remain. Calculated
  columns and reverse links are not copied; existing views/forward links own them.
- Missing source links become `NULL` (or are omitted from a join), with an error.
  Failed attachment references are omitted but the rest of the row is imported.
- A `probe_rack` row with blank `rack` or `rack_slot` is the explicit exception:
  only that row is skipped and its Baserow ID/missing columns are logged in
  `import-errors.json`. Counts distinguish raw source rows from expected rows
  after skips. A valid zero slot is not blank. Other source tables keep strict
  required-value validation. Rerunning imports a previously skipped rack once
  its source location is supplied; no row is deleted from Baserow.
- Actual attachment bytes are copied to private bucket `baserow-import`.
  References contain only `{bucket,path,name,size,mime}`. Deterministic paths and
  the SHA-256 manifest prevent duplicate uploads. A rerun checks existing bytes,
  skips intact objects, and recovers an upload completed before a manifest save.
  Conflicting objects are not overwritten. Downloads have a 50 MiB cap and a
  narrow HTTPS Baserow host allowlist; unexpected hosts are logged for review.
- All 60 identity counters (including the three source autonumbers) are advanced
  past imported maxima and are never rewound. Gaps in identities are normal.
- An interrupted run may leave already-upserted rows/files. Repeating dry/apply
  resumes safely. Each failed table rolls back, but there is no global rollback
  across tables or Storage and no deletion of prior data.
  Source-deleted rows/links are not deleted from Supabase; reconciliation reports
  extra records instead. This is an importer, not destructive synchronization.
- After applying, counts for every table, base-table `baserow_id` sets, bucket
  privacy and all-table RLS are verified. A nonzero error count is explicitly
  reported and exits with code 2. Failures/blockers exit 1; a clean result exits 0.

Runtime files are ignored by Git and written with private permissions:

| File | Purpose |
|---|---|
| `scripts/import-manifest.json` | Durable successful file-copy state; preserve it |
| `scripts/import-errors.json` | Current apply-run errors (no raw API bodies/keys) |
| `scripts/import-report.json` | Final structured reconciliation |
| `scripts/import-report.md` | Side-by-side per-table counts |
| `scripts/import.lock` | One local apply process at a time |

The error/report files describe the latest apply run. After a crash, verify that
the recorded PID is no longer running before removing **only** `scripts/import.lock`.
Do not remove the manifest to retry a failed file. Keep the same source and
destination credentials on reruns. Do not run simultaneous imports from another
machine; the lock is local, not a cross-machine database lock.

Legacy password hashes, installer PINs and approval tokens remain private source
data in their designated tables. This does not migrate users into Supabase Auth.
No credentials or source row values are printed. Error responses are reduced to
safe status codes/context because Postgres errors can echo sensitive row data.

The Supabase skill informed the parameterized batched upserts, RLS verification,
and Storage-API-only file writes. API references checked during implementation:
[Postgres transactions](https://node-postgres.com/features/transactions),
[Storage client implementation](https://github.com/supabase/storage-js/tree/master/src/packages),
[API keys](https://supabase.com/docs/guides/getting-started/api-keys).
