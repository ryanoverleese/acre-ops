# Supabase branch checks

Run the full isolated suite from the repository root:

```sh
node --test tests/supabase/contract.test.cjs tests/supabase/pin-migration.test.cjs tests/removal.test.mjs scripts/import-baserow.test.mjs
npx tsc --noEmit --incremental false
env DATABASE_URL='' DATABASE_URL_ALT='' SUPABASE_SERVICE_ROLE_KEY='' NEXT_TELEMETRY_DISABLED=1 npm run build
node tests/equipment/smoke.mjs
node tests/removal/smoke.mjs
```

The browser scripts require Google Chrome and Playwright, installed locally or supplied through NODE_PATH. They use ports 3197/3198 and refuse an occupied port. No live credentials, database, Storage writes, Baserow API, or real webhook is used. Tests apply every checked-in migration to PGlite (in-memory PostgreSQL), exercise the actual adapter/routes and copy the production build into temporary directories. Production pg Pool is replaced in both CommonJS and ESM loads. External requests are blocked; the fake removal webhook is captured locally. Browser roles use separate cookie jars so rotating admin cookies cannot overwrite the installer fixture.

Coverage includes all 22 source-table projections, 35 option catalogs, ordered billing joins, NULL handling, secret-free DTOs, equal charge/discount allocation, repeated quantity edits using a persisted original rate (including reload and catalog changes), atomic rollbacks and invalidation, selected-device removal and notification rules, private-file/key formats, complete pagination, exact report-type scopes, checked rack moves, retired options, customer ownership through any billing link, cross-origin rejection, and exact fulfillment assignment sets. Browser checks exercise Equipment, Billing and removal flows at desktop/tablet/phone sizes. Removal tests check unset/true/false/blank/invalid dry-run settings and no Workflows webhook.

The PIN suite uses real pgcrypto in isolated PGlite and seven synthetic plaintext PINs, not live installer credentials. It verifies cost-12 bcrypt compatibility, independent salts, leading zeros, preservation of existing hashes, rerun safety, blank normalization, invalid-format rollback, and rejection of future plaintext writes. Installer-auth contracts reject plaintext even before the migration is applied. The checked-in PIN and invoice-line basis migrations must be applied separately before deploying this branch; tests do not migrate the live project.

These checks do not replace a separately authorized branch-deploy test of real sign-in, live private files, serverless connection limits and external integrations. See supabase/app-switch-report.md for the deployment gate and environment names.
