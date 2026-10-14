# Supabase branch checks

Run the full isolated suite from the repository root:

```sh
node --test tests/supabase/contract.test.cjs tests/supabase/pin-migration.test.cjs tests/removal.test.mjs scripts/import-baserow.test.mjs scripts/delta-baserow.test.mjs
npx tsc --noEmit --incremental false
env DATABASE_URL='' DATABASE_URL_ALT='' SUPABASE_SERVICE_ROLE_KEY='' NEXT_TELEMETRY_DISABLED=1 npm run build
node tests/equipment/smoke.mjs
node tests/removal/smoke.mjs
```

The browser scripts require Google Chrome and Playwright, installed locally or supplied through NODE_PATH. They use ports 3197/3198 and refuse an occupied port. No live credentials, database, Storage writes, Baserow API, or real webhook is used. Tests apply every checked-in migration to PGlite (in-memory PostgreSQL), exercise the actual adapter/routes and copy the production build into temporary directories. Production pg Pool is replaced in both CommonJS and ESM loads. External requests are blocked; the fake removal webhook is captured locally. Browser roles use separate cookie jars so rotating admin cookies cannot overwrite the installer fixture.

## Browser fixture audit (cleanup-2)

Only two suites use `browser-preload.cjs`. Both exercise the production-built app against the real Supabase adapter and migrations in isolated PostgreSQL; neither is a retired backend-only test.

| Suite | Checks | Real behavior retained |
| --- | --- | --- |
| `tests/equipment/smoke.mjs` | 13 | Login/installer restrictions, navigation and legacy bookmarks, probe search, inventory/weather, rack moves and undo, registration, RMA/history, responsive layouts, shared billing, repeat quantity edits, complete field billing links, sign-out, and runtime errors. |
| `tests/removal/smoke.mjs` | 4 | Current installation/remover validation, selected-probe scope and planning preservation, Workflows silence versus crew webhook, and retry history/idempotency. |

The preload now imports data-only `tests/equipment/seed-data.cjs` or `tests/removal/seed-data.cjs`. Records and removal snapshots use table names rather than legacy table IDs. Dropdown objects and link arrays remain because they are still the app's public response shapes. No fixture source slicing, VM evaluation, or legacy HTTP mock is needed. All 88 automated tests and 17 browser checks are retained; no useful coverage was removed.

Coverage includes all 22 source-table projections, 35 option catalogs, ordered billing joins, NULL handling, secret-free DTOs, equal charge/discount allocation, repeated quantity edits using a persisted original rate (including reload and catalog changes), atomic rollbacks and invalidation, selected-device removal and notification rules, private-file/key formats, complete pagination, exact report-type scopes, checked rack moves, retired options, customer ownership through any billing link, cross-origin rejection, and exact fulfillment assignment sets. Browser checks exercise Equipment, Billing and removal flows at desktop/tablet/phone sizes. Removal tests check unset/true/false/blank/invalid dry-run settings and no Workflows webhook.

The PIN suite uses real pgcrypto in isolated PGlite and seven synthetic plaintext PINs, not live installer credentials. It verifies cost-12 bcrypt compatibility, independent salts, leading zeros, preservation of existing hashes, rerun safety, blank normalization, invalid-format rollback, and rejection of future plaintext writes. Installer-auth contracts reject plaintext even before the migration is applied. The checked-in PIN and invoice-line basis migrations must be applied separately before deploying this branch; tests do not migrate the live project.

These checks do not replace a separately authorized branch-deploy test of real sign-in, live private files, serverless connection limits and external integrations. See supabase/app-switch-report.md for the deployment gate and environment names.
