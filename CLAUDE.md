# Acre Ops — repo rules

## Installer/desktop parity
The installer app (`app/installer/`, used by field crew on phones) and the
desktop pages (`app/repairs/`, `app/probes/`, etc.) are two renderers of the
same Baserow data. **Any new field, status, or state added to repairs or
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

Map tiles: use the Google tile URLs already in the codebase
(`mt1.google.com/vt/lyrs=m` streets, `lyrs=y` hybrid). No API key needed.

## Deploys
The live site is the Netlify build of `main` (ryanoverleese/acre-ops).
UI changes require a push to appear; Baserow data changes show instantly.
Run `npx tsc --noEmit` and `npx next build` before pushing.
