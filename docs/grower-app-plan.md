# Grower app plan

Checked against the Acre Ops schema and app code on 2026-11-09. Nothing in this document is built yet. The live database was not opened.

A grower signs in and sees only their own farm: fields, field outlines, elevation on the map, probes, and this year's water recommendations. Read-only. Plain type, plain labels, no decoration.

## Decisions locked in

- **Login:** by farm name (`operations.name`). One farm per session. No per-person grower accounts in v1.
- **Past customers:** no login at all. A farm with no contact tagged Current Customer is refused, even if someone types the name.
- **Pilot:** Fishell Farms only (match `operations.name`; confirm the exact spelling when the allow-list is written).
- **Probe age:** `probes.year_new` (the Probes page column "Year New"). Some probes will be blank — show "Not recorded."
- **Water recs:** current calendar year only. Field rows with `report_type` `full` and `update`. No farm overview note in v1.
- **v1 map:** field boundary, elevation picture inside the boundary (reuse the office hillshade), and the most recent probe pin.

## Build it inside Acre Ops

Put the grower screens in this repo, on their own pages, with their own login.

The map, the gray hillshade, the field outlines, and the farm-to-field link are already here. A second app would copy them, and the two copies would drift. Acre Ops is already one Netlify site. A second site would be a second set of secrets.

A second app would not, by itself, keep growers out of other farms' data. This app connects as the database owner (`postgres` only; see `lib/supabase/database.ts`). That login can read every row. Row rules are turned on and then left with no allow-rules (`supabase/migrations/001_init.sql`). The owner skips those rules anyway. Safety is a second, weaker database login used only by the grower pages.

Do not add growers to `users`. That table is the office and installer password list. Anyone who is not an installer is treated as office staff and can open the whole site.

Do not use `operations.approval_token` as the password. That token is one shared link per farm (`/approve`, `/review`, `/field-info`). Those pages can still change the approval answer and the planned pin. Keep them for that seasonal form. The new app does not write. Farm name alone is not a secret (names are guessable). Ryan still picks what proves it is them — a short PIN per farm, a shared password, or something else. That answer is below.

The approval pages load every farm and then hide some. Do not copy that. Grower pages ask only for the signed-in farm's rows, on the server, before the page is sent.

## How a farm reaches its fields

There is no operation column on a field. The link already used by the approval pages and by `assertCustomerField` in `lib/supabase/api.ts` is:

1. The grower is signed in as one farm (`operations`).
2. Contacts linked to that farm (`contact_operations`) carry the billing names (`contact_billing_entities` → `billing_entities`).
3. `field_billing_entities` ties those billing names to fields. This is the real field link.

`fields.billing_entity_id` is an old column. The migration says to leave it empty and not use it.

A field can have more than one billing name. A billing name can reach more than one farm when two contacts connect them. Both farms then see that field. That is how the approval link works today. With login by farm name, that still means: sign in as farm A, see A's fields; sign in as farm B, see B's fields. Shared fields show for both.

Customer type is a tag on the contact (`contact_customer_types`). Labels used in the contact screens: Current Customer and Past Customer. Login requires at least one linked contact tagged Current Customer. Past customers get no login.

`probe_owner_operations` is who owns the probe in inventory. It is not "which probe is in this field."

Farm names are not unique in the schema today. If two farms share a name, refuse the login and tell Ryan. Do not guess which one.

## What v1 shows

**Fields.** `fields.name`, the pin `fields.lat` / `fields.lng`, and the outline in `field_boundaries`. One outline per field (`field_id`). The shape column is `geometry` (longitude, then latitude). It can come from CropX, a shapefile, or a hand drawing. The map already reads these through `readBoundaryFeatures`.

**Elevation on the map.** Reuse `components/ElevationOverlay.tsx` (USGS 3DEP; pull request #37 made the gray shade solid). Clip to the field outline. Point elevation in feet is also stored: `probe_assignments_calculated.effective_elevation` is `probe_assignments.elevation`, or else `fields.elevation`. Show that number next to the probe. "Not recorded" when empty. Do not look up elevation live on the grower's page.

**Probes, per field.** A probe in a field is a `probe_assignments` row for a `field_seasons` row (that field in one year), pointing at `probes`. Current calendar year only for v1.

| What the grower sees | Where it actually is |
| --- | --- |
| Serial number | `probes.serial_number`. The view `probe_assignments_calculated` copies it as `probe_serial_number`. It is not a column on the assignment. |
| Install date | `probe_assignments.install_date` (date and time). |
| Most recent map pin | Prefer `install_lat` / `install_lng`. If those are empty, use `placement_lat` / `placement_lng`. Do not fall back to the field pin for the probe marker. If more than one probe is on the field this year, show each pin. |
| Status | `probe_status` on that same view (from `probe_status_id`). The app uses Installed, Assigned, Unassigned, and Removed. The shop status on `probes` (rack, in stock) is a different thing. Do not show it. |
| Which probe on a multi-probe field | `probe_number` and `label` (for example NE). |
| Year new (age) | `probes.year_new`. Blank is allowed — show "Not recorded." |
| Year | `field_seasons.season`, copied onto the view as `season`. |

**Soil at the probe (number only).** `effective_soil_type` on the same view (assignment, or else field). Saved like `Name (symbol)` by `lib/geo.ts`. No soil map in v1.

**Water recommendations.** One table, `water_recs`. Columns that matter: `field_season_id`, `date`, `recommendation`, `suggested_water_day`, `report_type`. The view `water_recs_calculated` adds the field name. Only rows whose field season is the current calendar year. Sort by `date`, newest first.

`report_type` is not all grower-facing. The office screen treats them like this:

- `full` — the real per-field recommendation. Show these.
- `update` — a short water-day change. Show these.
- `overview` — a farm note stored on whichever field happens to be first for that farm. Hide in v1.
- `farm_insight` — a draft note. Hide.
- `full_report` and `water_day_update` — machine suggestions. Hide.

## Phase 2

Do not build these until Fishell is using v1 and Ryan picks an order.

**Soil map.** The repo only has a soil name at one point (USDA Soil Data Access, used by `/api/soil`). It does not download soil shapes or cut them to a field outline. A soil map would be USDA SSURGO map-unit shapes for that field. Open questions: point name versus a colored map, whether to save the shapes, and how the shapes get cut to the outline. Do not pick a method here.

**Drainage pathways.** Not in the repo. No flow lines. The height pictures come from USGS 3DEP, which could be the height source, but turning height into drainage lines needs a method checked on a real field. Open questions: surface flow lines, known tile lines, or both; which fields to test; what "good enough" means.

The boundary migration files say they were not applied to the live project by the commit that added them. The app expects `field_boundaries`. Confirm the table is on the live project before the map step. This plan did not check.

## Build order

Each step is one pull request. Do not start the next until the previous one is reviewed. Look: clean sans-serif, no gradients, plain labels, on every screen step.

1. **The lock, with no screen.** Add a weaker database login that can only read grower views. Row rules on those views allow a row only when it belongs to the signed-in farm through the billing-name join above. Grower code must use this login. Office pages keep the owner login. Tests: farm A cannot read farm B's field, even when the request names B's field id; a field with two billing names is included when one matches; `fields.billing_entity_id` is ignored. Done when those tests pass and the office app still opens.

2. **Login by farm name.** The grower enters `operations.name` plus the secret Ryan picks (see questions). Match the name case-insensitive after trimming spaces. Exactly one farm must match; zero or two-plus means refuse. Refuse if the farm has no contact tagged Current Customer. The session stores that farm's id only. A signed-in grower who opens an office page (`/fields`, `/water-recs`, `/billing`, and the rest) is sent back to the grower home, and those APIs return forbidden. Done when the wrong secret fails, a past-customer-only farm is refused, a duplicate farm name fails safely, and the office pages stay closed.

3. **Fishell only.** Allow-list the Fishell Farms operation id. No other farm can sign in yet. Done when only that farm gets in.

4. **My fields.** List the fields for the signed-in farm, for the current calendar year (`field_seasons.season`). Done when the list matches the fields the approval page would show for that farm and that year, and no others. A farm with no fields for that year sees an empty state.

5. **Field map: boundary, elevation, probe pin.** Reuse `components/FieldsMap.tsx`, `components/fields/FieldDetailMap.tsx`, and `components/ElevationOverlay.tsx`. Load maps with a dynamic import, the way the rest of the app does. Draw the outline, the elevation picture clipped to it, and each current-year probe pin (install pin, otherwise planned pin — not the field center). A field with no outline still shows the probe pin; elevation picture stays off until there is an outline. Done when another farm's outline never appears, and Fishell's boundary, shade, and probe pins match the office map for that field.

6. **Probe details.** On the field: serial, install date, status, probe number, label, and year new. "Not recorded" when year new is blank. A probe that is only on the shop rack does not appear. Done when the serial, install date, and year new match the office field page.

7. **Elevation and soil numbers.** Show the stored point values next to the probe. Feet for elevation. "Not recorded" when empty. Done when the numbers match the office field page.

8. **Water recommendations.** Per field, current year only, newest first, `full` and `update` only. Done when the list matches this year's office history for that field, and overview / suggestion rows do not appear.

9. **Fishell pilot.** Ryan and Fishell use it. Fix only what they hit. Done when Fishell confirms they see only their own fields.

## Questions still open

Answer in order. 1 blocks step 2. The rest can wait.

1. Farm name alone is not enough. What proves it is them: a short PIN Ryan sets per farm, a shared password per farm, or something else?
2. A field billed to two farms shows for both today. Keep that?
3. After Fishell is happy, which comes first: soil map or drainage lines?

## Not in v1

Invoices and billing. Editing anything. Install photos. Shop rack and probe inventory status. CropX live moisture charts. Valley pivot controls. Soil shapes. Drainage lines. Farm overview water-rec notes. Any year except the current one.
