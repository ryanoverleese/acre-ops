# Valley / AgSense365 — read-only Water Recs

Status: release prepared October 22, 2026; enabled only through server-side
configuration. No pivot commands are included.

Read-only live connection rechecked October 22, 2026: all 31 discovered pivots
returned a latest status. Names, operation membership and vendor center
coordinates were checked against Acre fields; Ryan confirmed the shared-field
pairs and the remaining name mismatch. Thirty devices have 34 reviewed field
links. An old duplicate device remains unlinked in favor of its replacement.
Private account/field mapping records are stored in the database, not Git.

Ryan's scope is a small icon beside each field name in both Full Report and
Water Day Update. It shows reported pivot angle (north at zero), ON/OFF/IDLE,
and FWD/REV (or lateral direction). It never changes copied grower reports.
IDLE remains IDLE: the vendor defines it as power available without safety
engaged. Power is not a promise that water is being applied. FWD/REV are not
silently translated to clockwise/counterclockwise.

## Setup gate

1. Ryan approved using the existing partner credentials and storing them with
   the AgSense365 login as secret, server-only Netlify environment variables
   for the test deploy and production on October 22, 2026. A precautionary
   rotation was discussed and declined; no credentials were changed. No values
   belong in this document, source, test fixtures, or the journey log.
2. Supply server-only environment variables (never NEXT_PUBLIC):
   `VALLEY_APID`, `VALLEY_API_KEY`, `VALLEY_API_IV`,
   `AGSENSE365_USERNAME`, `AGSENSE365_PASSWORD`.
   Legacy `VALLEY_USERNAME` / `VALLEY_PASSWORD` are also accepted.
3. Confirm access using GET-only device discovery and a latest-reading check.
   Growers must authorize Acre's API partner in AgSense365. Validate real
   response envelopes, serials, device time zones and north/angle orientation
   before enabling badges; documentation alone is not a live connection test.
4. `supabase/migrations/20261022185404_field_valley_pivots.sql` was applied only
   to Acre Ops (`junawlttpyztjlnbmvcb`) and 34 reviewed field ID + AgSense account
   username + pivot serial links were populated separately. Future links also
   require review: do not infer them from similar names. Multiple pivots per
   field are allowed. No mapping write UI is shipped in this change.
5. Enable `VALLEY_READ_ONLY_ENABLED=true` only in an approved test deployment
   first. Leaving it unset hides the badges and prevents Valley requests.
   Disabling it is the rollback; other app workflows are unaffected.

Netlify secrets scanning has a narrow `SECRETS_SCAN_OMIT_KEYS` exception for
`VALLEY_APID` and `AGSENSE365_USERNAME`: both are the public company identifier
already present in an existing contact email. The first two preview builds
stopped on those false positives. The API key, IV and password remain secret
and scanned; no files or other variables are excluded and scanning stays on.

The existing Water Recs eligibility rules are unchanged: current calendar
season plus an installed, unremoved probe. At the October 22 release check,
none of the mapped fields has an installed 2026 probe (the 2025 records do).
Consequently those field cards are currently hidden by the existing filter.
Links are permanent field-level links and will work when eligible field cards
appear. Do not change installation records just to display a pivot icon.

## Boundaries and freshness

- Only HTTPS GET `/json/GetDevices/pivot/` and `/json/GetDeviceStatus/` at
  `api.wagnet.net` exist in the client. No control/upload endpoints, command
  forwarding, custom upstream URL, redirect following, or public API route.
- Each vendor request gets a new Rijndael-256 CBC token. This protocol uses a
  256-bit **block**, not AES-256-CBC. The password MD5 is required by the vendor
  protocol, not used for Acre's authentication. `rijndael-js` is pinned to 2.0.0.
- Vendor credentials/tokens stay server-side. Error messages never include raw
  vendor responses or URLs (the vendor puts auth in query parameters).
- The staff-authenticated endpoint SELECTs the field link table only. RLS is
  enabled with no browser grants. `service_role` receives SELECT only.
- Fetch only the selected operation's fields in batches of eight, with at most
  four upstream requests at once and a 12-second batch deadline. Server memory
  caches successful readings for five minutes; failures are not cached.
- Badge refreshes do not reload the page, reset forms, or save recommendations.
  Background tabs pause new requests. Switching operations aborts old requests.
- Devices generally report every 30 minutes; polling cannot force a reading.
  Vendor `behind=1` or age over 90 minutes is labeled **Old reading**. Missing
  UTC offset, absent time, or implausibly future time is **Age unknown**.
  A partial device failure is visibly unavailable, never an all-clear. Lateral
  devices do not get a misleading circular arm position.

## Evidence and checks

Implementation uses the privately supplied AgSense/Wagnet API manual v1.2.9,
June 11, 2024, authentication/device/status sections, and the July 20, 2026 API
email clarification about approval and reading frequency. Do not commit the
private source documents or the credentials email.

`tests/valley.test.cjs` exercises protocol vectors, normalization, timestamps,
auth, URL/error handling, caching, concurrency, RLS/FKs and SELECT-only routes
using synthetic data and in-memory PostgreSQL. It does not connect to Valley
or the live Supabase database. Run alongside the existing full isolated suites.

`tests/valley/smoke.mjs` checks the actual production-built screen at desktop,
tablet and phone sizes with synthetic readings. Its six checks cover both
report views, background refresh without draft loss, copy text unchanged,
stale/unknown/unavailable states and GET-only calls. Existing Equipment (13)
and Removal (4) browser checks also pass. The full automated suite passes
110 tests, with TypeScript and the production build passing as well.

The release also updates Next.js from 16.4.0 to 16.4.2 for its published security
fixes. No CropX, removal, billing, or recommendation-save behavior is changed.
