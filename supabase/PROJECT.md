# Acre Ops Supabase project

## Current state

- Project name: `acre-ops`
- Project ref: `junawlttpyztjlnbmvcb`
- Project URL: [https://junawlttpyztjlnbmvcb.supabase.co](https://junawlttpyztjlnbmvcb.supabase.co)
- Dashboard: [Open acre-ops](https://supabase.com/dashboard/project/junawlttpyztjlnbmvcb)
- Organization: Acre Insights (`bcjwjhlwqewrgtlicybl`)
- Region: `us-east-1`
- Role: **sole live record system for Acre Ops** (Baserow is retired)

No keys, passwords, or connection strings containing credentials are stored
here. App code reads `DATABASE_URL` / `SUPABASE_URL` from the environment
(Netlify / local). Server access goes through `lib/supabase/` with RLS left
default-deny for `anon` / `authenticated`; route handlers use the server
database role.

Schema changes land as files under `supabase/migrations/` and must be applied
to this project before code that depends on them ships.

## Historical notes

This project was created 2026-10-12 as an isolated migration destination, then
cut over from Baserow. Finished one-shot cutover scripts and planning reports
were removed from the repo after cutover completed. Provenance for the original
schema still appears in comments inside `supabase/migrations/001_init.sql`
(`baserow_id` columns remain for lineage only).

Do not reintroduce Baserow API clients, cutover importers, or docs that claim
the live app still reads Baserow.
