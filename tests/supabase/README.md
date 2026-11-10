# Supabase branch checks

Run the full isolated suite from the repository root:

```sh
node --test tests/supabase/contract.test.cjs tests/supabase/pin-migration.test.cjs tests/supabase/grower-lock.test.cjs tests/supabase/grower-login.test.cjs tests/removal.test.mjs
npx tsc --noEmit --incremental false
env DATABASE_URL='' DATABASE_URL_ALT='' SUPABASE_SERVICE_ROLE_KEY='' NEXT_TELEMETRY_DISABLED=1 npm run build
node tests/equipment/smoke.mjs
node tests/removal/smoke.mjs
```

The browser scripts require Google Chrome and Playwright, installed locally or
supplied through `NODE_PATH`. They use ports 3197/3198 and refuse an occupied
port. No live credentials, database, Storage writes, or real webhook is used.
Tests apply every checked-in migration to PGlite (in-memory PostgreSQL),
exercise the actual adapter/routes, and copy the production build into temporary
directories. Production `pg` Pool is replaced in both CommonJS and ESM loads.
External requests are blocked; the fake removal webhook is captured locally.
Browser roles use separate cookie jars so rotating admin cookies cannot
overwrite the installer fixture.

## Browser fixture audit

Only two suites use `browser-preload.cjs`. Both exercise the production-built
app against the real Supabase adapter and migrations in isolated PostgreSQL.

| Suite | Checks | Real behavior retained |
| --- | --- | --- |
| `tests/equipment/smoke.mjs` | 13 | Login/installer restrictions, navigation and legacy bookmarks, probe search, inventory/weather, rack moves and undo, registration, RMA/history, responsive layouts, shared billing, repeat quantity edits, complete field billing links, sign-out, and runtime errors. |
| `tests/removal/smoke.mjs` | 4 | Current installation/remover validation, selected-probe scope and planning preservation, Workflows silence versus crew webhook, and retry history/idempotency. |

The preload imports data-only `tests/equipment/seed-data.cjs` or
`tests/removal/seed-data.cjs`. Records and removal snapshots use table names
rather than legacy table IDs. Dropdown objects and link arrays remain because
they are still the app's public response shapes.

Coverage includes source-table projections, option catalogs, ordered billing
joins, NULL handling, secret-free DTOs, equal charge/discount allocation,
repeated quantity edits, atomic rollbacks and invalidation, selected-device
removal and notification rules, private-file/key formats, pagination, rack
moves, customer ownership through billing links, and cross-origin rejection.
Browser checks exercise Equipment, Billing and removal flows at
desktop/tablet/phone sizes.

The PIN suite uses real pgcrypto in isolated PGlite and synthetic plaintext
PINs, not live installer credentials. It verifies bcrypt compatibility,
independent salts, leading zeros, preservation of existing hashes, rerun
safety, blank normalization, invalid-format rollback, and rejection of future
plaintext writes.

These checks do not replace a separately authorized branch-deploy test of real
sign-in, live private files, serverless connection limits, and external
integrations.
