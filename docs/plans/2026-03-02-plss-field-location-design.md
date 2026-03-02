# PLSS Field Location Storage

## Problem

When adding new fields, customers describe locations using PLSS (Public Land Survey System) references like "NE 40 of the NW 1/4 of 5-2-22." Currently there's no way to store this data in acre-ops — the PLSS grid is display-only on the map. The installer has to visually find the right section on the map before placing a pin.

## Design

### Data Model

4 new fields on the Baserow `fields` table (817298):

| Field | Baserow Type | Values | Example |
|-------|-------------|--------|---------|
| `plss_township` | Number | 1–14 | 5 |
| `plss_range` | Number | 7–22 | 2 |
| `plss_section` | Number | 1–36 | 22 |
| `plss_description` | Long Text | Freeform | NE 40 of the NW 1/4 |

All values are 6th Principal Meridian, Township North, Range West (south-central Nebraska). Directions are implicit and not stored.

### Bidirectional Sync

**PLSS → Map (forward lookup):**
- User fills in Township, Range, Section dropdowns in the Add Field modal
- Clicks a "Locate" button
- App queries BLM Esri REST API to get the section's bounding box/center
- Location picker map auto-centers and zooms to that section
- User clicks the exact probe spot within the section
- Elevation and soil type auto-populate as they already do

**Map → PLSS (reverse lookup):**
- User clicks the map to set lat/lng (existing flow)
- App queries BLM Esri REST API with those coordinates
- Auto-fills Township, Range, Section dropdowns
- Description field left empty (user fills manually if they have a legal description)
- Same pattern as existing elevation/soil auto-population

### API

**New endpoint: `GET /api/plss/lookup`**

Forward mode (PLSS → coordinates):
- Params: `township`, `range`, `section`
- Returns: `{ lat, lng, bounds }` (section center + bounding box)
- Calls BLM Esri REST API query on the PLSS CadNSDI MapServer (same service used by PLSSOverlay)

Reverse mode (coordinates → PLSS):
- Params: `lat`, `lng`
- Returns: `{ township, range, section }`
- Calls BLM Esri REST API identify operation

**Existing endpoints updated:**
- `POST /api/fields` — accepts 4 new PLSS fields, passes to Baserow
- `PATCH /api/fields/[id]` — same

### UI Changes

**Add Field Modal (`components/fields/AddFieldModal.tsx`):**

New PLSS row above lat/lng fields:
```
Township [▾ 1-14]  Range [▾ 7-22]  Section [▾ 1-36]  [Locate]
Description [________________________________]
```

- Dropdowns are padded beyond current 6-county range for future flexibility
- "Locate" button centers the location picker on the selected section
- All fields optional — you can still add a field with just lat/lng

**Field Detail Panel (`app/fields/FieldsClient.tsx`):**

Display in Location Data section as formatted string:
```
T5N R2W Sec 22 — NE 40 of the NW 1/4
```

Editable when in edit mode (same dropdowns + text input).

**Location Picker (`components/LocationPicker.tsx`):**

When a map position is set, call the reverse PLSS lookup alongside the existing elevation/soil calls. Auto-fill T/R/S on the parent form.

### ProcessedField Interface

Add to `app/fields/page.tsx`:
```typescript
plssTownship: number | null;
plssRange: number | null;
plssSection: number | null;
plssDescription: string;
```

### What This Doesn't Do

- No parsing or validation of the freeform description
- No quarter-level map highlighting (we center on the full section)
- No validation that description matches T/R/S
- No parcel boundary overlay (future enhancement — county GIS or Regrid data)

## Future Enhancement: Parcel Boundaries

Overlay actual property/ownership boundary lines on the map, similar to the existing PLSS grid toggle. Potential data sources:
- County assessor/GIS portals (Buffalo, Kearney, Adams, Phelps, Harlan, Franklin)
- Regrid (nationwide parcel aggregator, paid API)
- Nebraska state GIS data
