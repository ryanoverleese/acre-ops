# Acre Ops — repo rules

## Data source
Supabase project `junawlttpyztjlnbmvcb` is the sole record system.
Baserow is retired — do not call it, restore cutover scripts, or treat
`baserow_id` columns as the app's identity. Enduring field identity is
`public.fields.id`.

## Installer/desktop parity
The installer app (`app/installer/`, used by field crew on phones) and the
desktop pages (`app/repairs/`, `app/probes/`, etc.) are two renderers of the
same Supabase data. **Any new field, status, or state added to repairs or
installs must be rendered in BOTH the installer app and the matching desktop
page before it ships.** (We got burned: `watch_list` existed for weeks but only
the installer showed it.)

Shared status colors live in `lib/repair-status.ts` — import from there instead
of hardcoding hex values, so a new state automatically looks the same in both
apps.

## Maps
Every map component must be loaded with
`dynamic(() => import('./X'), { ssr: false })` — **never** React `lazy()`.
Leaflet touches `window` at import time and crashes server rendering; a plain
`lazy()` still lands in the SSR bundle (this broke all maps on 2026-07-01).

Map tiles: import `STREET_URL` / `SAT_URL` / `GOOGLE_ATTR` from
`lib/map-tiles.ts` (Google `mt1` streets/hybrid). No API key needed.

## Caching (`lib/supabase/adapter.ts`)
Server reads go through `getCachedRows` (`unstable_cache`, tag
`acre-supabase-native-v1`); every write must call `bustTableCache(table)` so
edits show immediately.
**The bust must use `revalidateTag(tag, { expire: 0 })` — never `'max'`.**
`'max'` is stale-while-revalidate: it serves the OLD data one more time after a
save, so users see their edit vanish when they navigate back (bit us on water
recs 2026-07-06). Pages where Ryan actively edits-and-returns fast (water-recs)
read their editable tables uncached on top of that.

Thin authenticated create/update/delete API routes should use
`crudCollection` / `crudItem` from `lib/supabase/crud-route.ts` instead of
copy-pasting `dataRequest` + `bustTableCache` wrappers. Keep domain logic
(install, removal, probe defaults, geo backfill, field-boundary import) in
dedicated routes.

## Deploys
The live site is the Netlify build of `main` (ryanoverleese/acre-ops).
UI changes require a push to appear; Supabase data changes show immediately.
Run `npx tsc --noEmit` and `npx next build` before pushing.
