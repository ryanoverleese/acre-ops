# Grower QA / release gate — Iteration 1

**Verdict: NOT customer-ready.** Fixture suite is green for scoped cases; isolated browser preview against a live DB is **BLOCKED**; production still lacks dedicated `DATABASE_URL_GROWER` (required by the QA branch fix below).

## Exact candidate

| Item | Value |
| --- | --- |
| Audited production tip | `7c035e92fa40183dd018044a932df24e20a7197e` (`origin/main`) |
| Contents | Squash of PR **#44** (grower v1) + PR **#46** (Date.slice fix) |
| QA workstream branch | `cursor/grower-qa-gate-cffe` (this doc + hardening; **not merged**) |
| Spec source | `docs/grower-app-plan.md` on `cursor/grower-app-plan-cffe` (PR **#39** still open — **not on main**) |
| Design research | PR **#45** open on plan base — **not on main** |

### PR stack (do not assume past reports)

| PR | Title | State vs main |
| --- | --- | --- |
| #39 | Plan | OPEN (docs only) |
| #41 | Data lock | OPEN but **superseded** (code in #44 squash) |
| #42 | Login PIN | OPEN but **superseded** |
| #43 | Fishell + fields | OPEN but **superseded** |
| #44 | Map / probes / recs | **MERGED** → `6df180c…` |
| #45 | Design system research | OPEN (docs) |
| #46 | Date.slice crash | **MERGED** → `7c035e9…` |

## Spec lock (Ryan) — still current in plan + code

- Farm name + **4–6 digit PIN**; Fishell-only pilot; past customers out; duplicate names refuse
- Probe age: `(year − year_new + 1)` seasons; blank → Not recorded
- Water: current year, `full` + `update` only
- Map: boundary + elevation + probe pin (install else placement; not field center)
- Read-only grower; billing join only; ignore `fields.billing_entity_id`

## Test environment provenance

| Layer | What | Real services? |
| --- | --- | --- |
| `tests/supabase/grower-*.cjs` | PGlite + synthetic farms/PINs | **Fixtures only** (no live DB, no Netlify) |
| `npx tsc --noEmit` | Typecheck | Local |
| Deploy Preview (e.g. #46) | Netlify preview URL | **BLOCKED for grower data** — `POST /api/grower-auth` → `Database connection is not configured` (preview context has no `DATABASE_URL`) |
| Production `acre-ops.netlify.app` | Live site | **Out of scope for mutation under this gate**; not used as pass evidence |

### Isolated preview URL

- Attempted: `https://deploy-preview-46--acre-ops.netlify.app/grower/login` → page **200**, auth API **503** (no DB).
- **No reachable isolated grower preview with DB** in this agent environment. Label: **BLOCKED**.

Supported path for Tech Team: private Netlify Deploy Preview / branch deploy with `DATABASE_URL`, `DATABASE_URL_GROWER`, `AUTH_SECRET`, `SUPABASE_URL` set for **deploy-preview** (and a non-prod DB), or local `next dev` with gitignored env.

## Fixes in this QA iteration (branch only — not merged)

1. **Production requires `DATABASE_URL_GROWER`** unless `GROWER_ALLOW_OWNER_FALLBACK=1` (closes owner-pool fallback on prod).
2. **Pinless probes** still appear in the facts list; map markers only when coords exist.
3. Regression tests for both; `scripts/grower-qa-mint-cookie.mjs` for local cookie minting (**no PIN**, needs local `AUTH_SECRET`).

## Fixture tests actually run

```text
node --test tests/supabase/grower-lock.test.cjs \
  tests/supabase/grower-login.test.cjs \
  tests/supabase/grower-fields.test.cjs \
  tests/supabase/grower-pool-config.test.cjs
→ 17 pass / 0 fail
npx tsc --noEmit → exit 0
```

### Coverage vs gate checklist (fixture evidence)

| Check | Result | Evidence |
| --- | --- | --- |
| Farm A ⊄ farm B fields / water / probes / boundaries | PASS (fixture) | grower-lock |
| `fields.billing_entity_id` ignored | PASS (fixture) | grower-lock |
| Shared billing → both farms see field | PASS (fixture) | grower-lock |
| Past customer refused | PASS (fixture) | grower-login |
| Duplicate farm name refuse | PASS (fixture) | grower-login |
| Fishell pilot allow-list | PASS (fixture) | grower-login |
| Wrong PIN fails; hash not in public DTO | PASS (fixture) | grower-login |
| Grower actor blocked from office APIs | PASS (fixture) | grower-login authorizeActor |
| Probe age seasons + water full/update only | PASS (fixture) | grower-fields |
| install_date → YYYY-MM-DD string | PASS (fixture) | grower-fields |
| Pinless probe listed | PASS (fixture) | grower-fields |
| Prod without DATABASE_URL_GROWER → 503 | PASS (fixture) | grower-pool-config |
| In-memory login throttle under multi-instance | **GAP** | Map in `grower-auth` route — not durable on Netlify |
| Cookie CSRF beyond Origin check | PARTIAL | Origin check in `withApiAuth`; no CSRF token on grower login |
| Session revocation before expiry | **GAP** | Cookie maxAge 12h; no server-side revoke list |
| Browser E2E phone / WebKit | **BLOCKED** | No preview DB; Playwright/WebKit not wired in repo |
| Map elevation tiles | **BLOCKED** (isolated) | Uses public `/api/usgs-elevation`; needs running app + network |
| Office/installer regression full suite | **UNTESTED** this iteration | Only grower + tsc run |
| `npm run build` | **UNTESTED** this iteration | |
| Removed-status probe policy | **UNTESTED** / product open | Code still returns Removed assignments if present |

## Independent browser testing (no PIN/token in chat)

1. **Preferred:** In a **non-production** DB + preview/local app, create a synthetic Current Customer farm (not a real customer). Set its grower PIN yourself via the office UI (`/api/operations/[id]/grower-pin` as staff). Sign in at `/grower/login`. Never paste the PIN into Slack/chat.
2. **Cookie mint (local secret only):**  
   `AUTH_SECRET=… node scripts/grower-qa-mint-cookie.mjs --operation-id <id> --name 'QA Grower Farm'`  
   Only works against an instance that shares that `AUTH_SECRET`. Do not commit the cookie. Do not paste `AUTH_SECRET` into chat.
3. **Forbidden under this gate:** production PIN changes, production data writes, customer email, CropX/JD writes, Baserow.

## Remaining blockers before “customer-ready”

1. **BLOCKED** — Isolated preview with DB + `DATABASE_URL_GROWER` for Tech Team browser E2E  
2. **BLOCKED / required** — Set dedicated `acre_grower` `DATABASE_URL_GROWER` on the target deploy (QA branch enforces this in production)  
3. **GAP** — Durable rate limiting (not in-memory Map)  
4. **GAP** — Plan/design docs not on main (#39 / #45)  
5. **UNTESTED** — Real browser phone viewport, WebKit, full office/installer regression, production build  
6. **Do not declare ready** until the above have evidence, not green CI alone  

## Checklist tied to SHAs

- [x] Establish stack merge reality (`7c035e9` tip; #41–43 superseded; #39/#45 open)  
- [x] Fixture IDOR / login / pilot / age / water / date-normalize (`7c035e9` + QA branch tests)  
- [x] Fix pinless probe omission + prod grower URL requirement (QA branch)  
- [ ] Isolated browser E2E with synthetic farm — **BLOCKED**  
- [ ] Durable throttle + session revocation design  
- [ ] Merge plan docs; configure preview secrets (Tech Team / ops — not done by this gate)  
- [ ] Customer-ready sign-off — **NO**
