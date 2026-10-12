# Removal parity checks

```sh
node --test tests/removal.test.mjs
npx tsc --noEmit --incremental false
npm run build
node tests/removal/smoke.mjs
```

Smoke checks require Node 24+, Chrome, and Playwright (locally or via `NODE_PATH`).
They copy the production build to a temporary directory and start a private test
server on `127.0.0.1:3198`. All records and credentials are synthetic. The Baserow
preload and browser block external requests; no real database, webhook, or files
are changed. The fixture rejects any field-season/planning writes.

The browser exercises Workflows' required actual-remover field, date picker, and
shared endpoint. Two probes on one field prove that only the selected assignment
and linked device change. A locally intercepted fake webhook proves Workflows
sends no notification while crew submissions notify once (including older crew
clients that omit the source flag). API checks cover source validation and
repeat-save history. Unit tests additionally cover inventory-save retries, validation,
ambiguous/reinstalled probes, and failed photo uploads. Screenshots, synthetic
state, and server logs stay in the printed temporary QA directory.
