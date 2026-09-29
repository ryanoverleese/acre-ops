# Equipment smoke checks

Requires Node 24+, Google Chrome, and Playwright (installed locally or supplied via `NODE_PATH`).

```sh
npm run build
node tests/equipment/smoke.mjs
```

The runner copies the production build into a temporary directory, starts its own server on `127.0.0.1:3197`, and signs a test-only local session. It refuses to reuse an occupied port. The preload supplies synthetic Baserow records, blocks other external server requests, and the browser blocks external requests and the Apple Notes logging action. No real credentials or records are used. Generated caches, screenshots, and server logs remain in the printed temporary QA directory.

Checks cover login and installer-role restrictions; the four Equipment tabs; legacy redirects and query strings; probe search; supplies and weather-station views; rack move/undo; on-order registration; RMA duplicate rejection and preservation of the original probe and prior-season assignment; phone/tablet layout; and browser runtime errors.
