# Equipment smoke checks

Requires Node 24+, Google Chrome, and Playwright (installed locally or supplied via `NODE_PATH`).

```sh
npm run build
node tests/equipment/smoke.mjs
```

The runner copies the production build into a temporary directory, starts its own server on `127.0.0.1:3197` (visited as `http://localhost:3197` to match the auth handler's local redirect origin), and signs a test-only local session. It refuses to reuse an occupied port. The Supabase preload runs the actual migrations in PGlite (in-memory PostgreSQL), seeds synthetic records, and blocks external requests. The browser also blocks external requests and the Apple Notes logging action. No real credentials or records are used. Generated caches, screenshots, and server logs remain in the printed temporary QA directory.

Checks cover login and installer-role restrictions (in separate account contexts); the four Equipment tabs; legacy redirects and query strings; probe search; supplies and weather-station views; rack move/undo; on-order registration; RMA duplicate rejection and preservation of the original probe and prior-season assignment; phone/tablet layout; a saved 50/50 field charge displayed beneath both linked billing entities; quantity 2 entered repeatedly before and after reloading without compounding; shared Fields billing labels, canceling a membership edit, and saving unrelated field details with the complete billing join preserved after reloading; and browser runtime errors.

The staff sign-out regression verifies that neither page/prefetch middleware nor the CSRF endpoint renews the session cookie, sign-out expires it without appending a replacement, the session becomes anonymous, and Fields, Equipment, Billing, Documents, and protected data/file APIs deny access until a new login. All auth requests use the real built handlers and synthetic local sessions.
