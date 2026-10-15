# Valley / AgSense365 — read-only Water Recs

Status: local implementation, disabled by default. No production deployment,
live database migration, field links, or pivot commands are included.

Read-only live connection verified October 15, 2026: device discovery returned
31 pivots and one latest-status request returned position, power and direction
(HTTP 200). The saved AgSense365 login worked. Partner API credentials were
used in memory for this check, not saved in source or the local env file.
This verifies access, not all devices, field matching, or all device models.

Ryan's scope is a small icon beside each field name in both Full Report and
Water Day Update. It shows reported pivot angle (north at zero), ON/OFF/IDLE,
and FWD/REV (or lateral direction). It never changes copied grower reports.
IDLE remains IDLE: the vendor defines it as power available without safety
engaged. Power is not a promise that water is being applied. FWD/REV are not
silently translated to clockwise/counterclockwise.

## Setup gate

1. Rotate the vendor-issued API key/IV before production activation: a setup
   email excerpt was accidentally displayed during discovery. No values belong
   in this document, source, test fixtures, or the journey log.
2. Supply server-only environment variables (never NEXT_PUBLIC):
   `VALLEY_APID`, `VALLEY_API_KEY`, `VALLEY_API_IV`,
   `AGSENSE365_USERNAME`, `AGSENSE365_PASSWORD`.
   Legacy `VALLEY_USERNAME` / `VALLEY_PASSWORD` are also accepted.
3. Confirm access using GET-only device discovery and a latest-reading check.
   Growers must authorize Acre's API partner in AgSense365. Validate real
   response envelopes, serials, device time zones and north/angle orientation
   before enabling badges; documentation alone is not a live connection test.
4. Separately review/apply
   `supabase/migrations/20261015220225_field_valley_pivots.sql` in Acre Ops only.
   Populate reviewed field ID + AgSense account username + pivot serial links.
   Do not infer links from similar names. Multiple pivots per field are allowed.
   No mapping write UI or data migration is shipped in this change.
5. Enable `VALLEY_READ_ONLY_ENABLED=true` only in an approved test deployment
   first. Leaving it unset hides the badges and prevents Valley requests.
   Disabling it is the rollback; other app workflows are unaffected.

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
108 tests, with TypeScript and the production build passing as well.
