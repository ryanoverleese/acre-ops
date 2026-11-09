# Grower app plan

Checked against the Acre Ops schema and app code on 2026-11-09. Nothing in this document is built yet. The live database was not opened.

A grower signs in and sees only their own farm: fields, field outlines, probes, and water recommendations. Read-only. Plain type, plain labels, no decoration.

## Build it inside Acre Ops

Put the grower screens in this repo, on their own pages, with their own login.

The map, the gray hillshade, the field outlines, and the farm-to-field link are already here. A second app would copy them, and the two copies would drift. Acre Ops is already one Netlify site. A second site would be a second set of secrets.

A second app would not, by itself, keep growers out of other farms' data. This app connects as the database owner (`postgres` only; see `lib/supabase/database.ts`). That login can read every row. Row rules are turned on and then left with no allow-rules (`supabase/migrations/001_init.sql`). The owner skips those rules anyway. Safety is a second, weaker database login used only by the grower pages.

Do not add growers to `users`. That table is the office and installer password list. Anyone who is not an installer is treated as office staff and can open the whole site.

Do not use `operations.approval_token` as the password. That token is one shared link per farm (`/approve`, `/review`, `/field-info`). It is not tied to a person. Those pages can still change the approval answer and the planned pin. Keep them for that seasonal form. The new app does not write.

The approval pages load every farm and then hide some. Do not copy that. Grower pages ask only for the signed-in contact's rows, on the server, before the page is sent.

## How a grower reaches their fields

There is no operation column on a field. The link already used by the approval pages and by `assertCustomerField` in `lib/supabase/api.ts` is:

1. The person is a row in `contacts` (name, email, phone).
2. `contact_operations` ties that contact to one or more farms (`operations`).
3. `contact_billing_entities` ties that same contact to one or more billing names (`billing_entities`).
4. `field_billing_entities` ties those billing names to fields. This is the real field link.

`fields.billing_entity_id` is an old column. The migration says to leave it empty and not use it.

A field can have more than one billing name. A billing name can reach more than one farm when two contacts connect them. Both farms then see that field. That is how the approval link works today.

Customer type is a tag on the contact (`contact_customer_types`), not a lock on the farm. The contact screens use the labels Current Customer and Past Customer. A contact can have more than one tag. Email is not required to be unique.

`probe_owner_operations` is who owns the probe in inventory. It is not "which probe is in this field."

## What v1 shows

**Fields.** `fields.name`, the pin `fields.lat` / `fields.lng`, and the outline in `field_boundaries`. One outline per field (`field_id`). The shape column is `geometry` (longitude, then latitude). It can come from CropX, a shapefile, or a hand drawing. The map already reads these through `readBoundaryFeatures`.

**Probes, per field.** A probe in a field is a `probe_assignments` row for a `field_seasons` row (that field in one year), pointing at `probes`.

| What the grower sees | Where it actually is |
| --- | --- |
| Serial number | `probes.serial_number`. The view `probe_assignments_calculated` copies it as `probe_serial_number`. It is not a column on the assignment. |
| Install date | `probe_assignments.install_date` (date and time). |
| Map pin | `install_lat` / `install_lng` once it is in the ground. Otherwise `placement_lat` / `placement_lng`. The view's `effective_placement_lat` / `effective_placement_lng` falls back to the field pin and ignores the install pin. Use the install pin first. |
| Status | `probe_status` on that same view (from `probe_status_id`). The app uses Installed, Assigned, Unassigned, and Removed. The shop status on `probes` (rack, in stock) is a different thing. Do not show it. |
| Which probe on a multi-probe field | `probe_number` and `label` (for example NE). |
| Year | `field_seasons.season`, copied onto the view as `season`. |

**Probe age.** Nothing is stored as an age. Three different dates exist: `probes.year_new` (the Probes page column "Year New"), `probes.date_created` (when the probe record was added), and the earliest `probe_assignments.install_date` for that probe (first time it went in the ground). Ryan picks which one "age" means before that screen is built.

**Elevation and soil at the probe.** These are numbers and a name already saved for a point, not a map. `probe_assignments_calculated.effective_elevation` is `probe_assignments.elevation`, or else `fields.elevation`. `effective_soil_type` is the assignment's `soil_type`, or else the field's. Elevation is feet from USGS. Soil text is the USDA map-unit name and symbol, saved like `Name (symbol)` by `lib/geo.ts`. If the cell is empty, say it was not recorded. Do not look it up live on the grower's page.

**Water recommendations.** One table, `water_recs`. Columns that matter: `field_season_id`, `date`, `recommendation`, `suggested_water_day`, `report_type`. The view `water_recs_calculated` adds the field name. Sort by `date`, newest first.

`report_type` is not all grower-facing. The office screen treats them like this:

- `full` — the real per-field recommendation.
- `update` — a short water-day change.
- `overview` — a farm note stored on whichever field happens to be first for that farm. It is not that field's recommendation.
- `farm_insight` — a draft note, also stored on the first field. The office screen does not treat it as a saved field rec.
- `full_report` and `water_day_update` — machine suggestions. The office screen hides them from the saved-rec list.

Show `full` and `update` on the field. Show `overview` once, at the farm level, only if Ryan wants it. Leave the other three off.

## Phase 2

Do not build these until v1 is in growers' hands and Ryan picks an order.

**Elevation map.** Already in the repo. `components/ElevationOverlay.tsx` draws USGS 3DEP inside the field outline (color, gray shade, or 2 ft contours). Pull request #37 made the gray shade solid. The picture is clipped to the outline in the browser. It is not a saved elevation file. Point elevation in feet is already stored, from the USGS point service in `lib/geo.ts`. Reuse the overlay. Open question: is that existing picture what growers should see?

**Soil map.** The repo only has a soil name at one point (USDA Soil Data Access, used by `/api/soil`). It does not download soil shapes or cut them to a field outline. A soil map would be USDA SSURGO map-unit shapes for that field. Open questions: point name versus a colored map, whether to save the shapes, and how the shapes get cut to the outline. Do not pick a method here.

**Drainage pathways.** Not in the repo. No flow lines. The height pictures come from USGS 3DEP, which could be the height source, but turning height into drainage lines needs a method checked on a real field. Open questions: surface flow lines, known tile lines, or both; which fields to test; what "good enough" means.

The boundary migration files say they were not applied to the live project by the commit that added them. The app expects `field_boundaries`. Confirm the table is on the live project before the map step. This plan did not check.

## Build order

Each step is one pull request. Do not start the next until the previous one is reviewed. Look: clean sans-serif, no gradients, plain labels, on every screen step.

1. **The lock, with no screen.** Add a weaker database login that can only read grower views. Row rules on those views allow a row only when it belongs to a farm linked to that contact through the billing-name join above. Grower code must use this login. Office pages keep the owner login. Tests: contact A cannot read contact B's field, even when the request names B's field id; a field with two billing names is included when one matches; `fields.billing_entity_id` is ignored. Done when those tests pass and the office app still opens.

2. **Login.** Email link to `contacts.email`. Allow it only for a contact tagged Current Customer who has an email and at least one farm. If two contacts share an email, refuse and tell Ryan. Do not guess. A signed-in grower who opens an office page (`/fields`, `/water-recs`, `/billing`, and the rest) is sent back to the grower home, and those APIs return forbidden. Done when a past-customer email is refused, a current-customer email can sign in, and the office pages stay closed.

3. **Turn it on for a short list only.** A list of pilot contact ids. No other current customer can sign in yet. Done when only those contacts get in.

4. **My fields.** List the fields for the signed-in farm, for one year (`field_seasons.season`; the office app defaults to the current calendar year). Done when the list matches the fields the approval page would show for that farm and that year, and no others. A farm with no fields for that year sees an empty state.

5. **Field map.** Reuse the existing map pieces (`components/FieldsMap.tsx`, `components/fields/FieldDetailMap.tsx`). Load maps with a dynamic import, the way the rest of the app does. Draw `field_boundaries` and the field pin. A field with no outline still shows the pin. Done when another farm's outline never appears.

6. **Probes.** On the field: serial, install date, assignment status, probe number, label, and the pin (install pin, otherwise planned pin). Age uses the rule from the questions below. A probe that is only on the shop rack does not appear. Done when the serial and install date match the office field page.

7. **Elevation and soil numbers.** Show the stored point values next to the probe. Feet for elevation. "Not recorded" when empty. Done when the numbers match the office field page.

8. **Water recommendations.** Per field, newest first, `full` and `update` only, until Ryan changes that. Farm overview once at the top, only if he says yes. Done when the list matches the office history for that field, and an overview row does not show up as that field's recommendation.

9. **Pilot.** Ryan and the pilot growers use it. Fix only what they hit. Done when each grower confirms they see only their own fields.

## Questions for Ryan

Answer in order. 1 blocks step 2. 2 blocks step 6. 3 blocks step 8. The rest can wait until that step.

1. Past customers: no login at all? (Recommended. A history mode can come later.)
2. Probe age: year the probe was new, the date the probe record was created, or the first install date?
3. Water recs: which years, and should the farm overview note be shown?
4. Which 2 or 3 growers go first?
5. A person on two farms: a farm switcher, or one farm only?
6. A field billed to two farms shows for both today. Keep that?
7. Phase 2 order, after v1: elevation picture, soil map, drainage lines?
8. Is the hillshade already on the office map the elevation picture growers should see?

## Not in v1

Invoices and billing. Editing anything. Install photos. Shop rack and probe inventory status. CropX live moisture charts. Valley pivot controls. Drainage, soil shapes, and any new elevation product.
