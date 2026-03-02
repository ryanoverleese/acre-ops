# PLSS Field Location Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store PLSS (Township/Range/Section) data on fields with bidirectional sync between PLSS dropdowns and map coordinates.

**Architecture:** New PLSS lookup API wraps BLM's Esri REST service for forward (T/R/S → coordinates) and reverse (lat/lng → T/R/S) lookups. PLSS fields added to Baserow, ProcessedField, Add Field modal, edit form, and detail panel. LocationPicker auto-populates PLSS on map click alongside existing elevation/soil calls.

**Tech Stack:** Next.js API routes, BLM Esri REST API, Baserow, React

---

### Task 1: PLSS Lookup Library

**Files:**
- Create: `lib/plss.ts`

**Step 1: Create `lib/plss.ts` with forward and reverse lookup functions**

```typescript
const BLM_PLSS_URL = 'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer';

// Layer 1 = Township, Layer 2 = Section

export interface PlssForwardResult {
  lat: number;
  lng: number;
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
}

export interface PlssReverseResult {
  township: number;
  range: number;
  section: number;
}

/**
 * Forward lookup: Township/Range/Section → section center + bounds.
 * Queries BLM section layer (2) by PLSSID + section number.
 * PLSSID format: NE06{TTT}0N0{RRR}0W0 (Nebraska, 6th PM, North, West)
 */
export async function plssForwardLookup(
  township: number,
  range: number,
  section: number,
): Promise<PlssForwardResult | null> {
  const twp = String(township).padStart(3, '0');
  const rng = String(range).padStart(3, '0');
  const sec = String(section).padStart(2, '0');
  const plssId = `NE06${twp}0N0${rng}0W0`;

  const params = new URLSearchParams({
    where: `PLSSID='${plssId}' AND FRSTDIVNO='${section}'`,
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });

  try {
    const res = await fetch(`${BLM_PLSS_URL}/2/query?${params}`);
    const data = await res.json();

    if (!data.features?.length) return null;

    const rings = data.features[0].geometry.rings[0];
    const lats = rings.map((c: number[]) => c[1]);
    const lngs = rings.map((c: number[]) => c[0]);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);

    return {
      lat: (south + north) / 2,
      lng: (west + east) / 2,
      bounds: [[south, west], [north, east]],
    };
  } catch {
    return null;
  }
}

/**
 * Reverse lookup: lat/lng → Township/Range/Section.
 * Uses BLM identify endpoint on both layers.
 */
export async function plssReverseLookup(
  lat: number,
  lng: number,
): Promise<PlssReverseResult | null> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: 'all:1,2',
    tolerance: '0',
    mapExtent: `${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}`,
    imageDisplay: '800,600,96',
    returnGeometry: 'false',
    f: 'json',
  });

  try {
    const res = await fetch(`${BLM_PLSS_URL}/identify?${params}`);
    const data = await res.json();

    if (!data.results?.length) return null;

    let township: number | null = null;
    let range: number | null = null;
    let section: number | null = null;

    for (const result of data.results) {
      const attrs = result.attributes;
      if (result.layerId === 1) {
        // Township layer
        const twpStr = attrs.TWNSHPNO || attrs['Township Number'];
        const rngStr = attrs.RANGENO || attrs['Range Number'];
        if (twpStr) township = parseInt(twpStr, 10);
        if (rngStr) range = parseInt(rngStr, 10);
      } else if (result.layerId === 2) {
        // Section layer
        const secStr = attrs.FRSTDIVNO || attrs['First Division Number'];
        if (secStr) section = parseInt(secStr, 10);
      }
    }

    if (township && range && section) {
      return { township, range, section };
    }
    return null;
  } catch {
    return null;
  }
}
```

Follow the same pattern as `lib/geo.ts` — pure async functions, null on failure, no throw.

**Step 2: Commit**

```bash
git add lib/plss.ts
git commit -m "feat: add PLSS forward/reverse lookup library"
```

---

### Task 2: PLSS API Route

**Files:**
- Create: `app/api/plss/lookup/route.ts`

**Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { plssForwardLookup, plssReverseLookup } from '@/lib/plss';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = params.get('lat');
  const lng = params.get('lng');
  const township = params.get('township');
  const range = params.get('range');
  const section = params.get('section');

  // Reverse lookup: lat/lng → T/R/S
  if (lat && lng) {
    try {
      const result = await plssReverseLookup(Number(lat), Number(lng));
      if (!result) {
        return NextResponse.json({ error: 'No PLSS data found for this location' }, { status: 404 });
      }
      return NextResponse.json(result);
    } catch (error) {
      console.error('PLSS reverse lookup error:', error);
      return NextResponse.json({ error: 'Failed to look up PLSS data' }, { status: 500 });
    }
  }

  // Forward lookup: T/R/S → coordinates
  if (township && range && section) {
    try {
      const result = await plssForwardLookup(Number(township), Number(range), Number(section));
      if (!result) {
        return NextResponse.json({ error: 'Section not found' }, { status: 404 });
      }
      return NextResponse.json(result);
    } catch (error) {
      console.error('PLSS forward lookup error:', error);
      return NextResponse.json({ error: 'Failed to look up section' }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: 'Provide lat+lng (reverse) or township+range+section (forward)' },
    { status: 400 },
  );
}
```

**Step 2: Test manually in browser**

Run: `npm run dev`
Test reverse: `http://localhost:3000/api/plss/lookup?lat=40.7&lng=-99.3`
Expected: `{ "township": 9, "range": 17, "section": 31 }` (or nearby section)

Test forward: `http://localhost:3000/api/plss/lookup?township=14&range=8&section=24`
Expected: `{ "lat": ~41.17, "lng": ~-98.18, "bounds": [[...], [...]] }`

**Step 3: Commit**

```bash
git add app/api/plss/lookup/route.ts
git commit -m "feat: add PLSS lookup API route (forward + reverse)"
```

---

### Task 3: Baserow Schema + Data Model

**Files:**
- Modify: `lib/baserow.ts` — add PLSS fields to `Field` interface (line ~328)
- Modify: `app/fields/page.tsx` — add PLSS fields to `ProcessedField` interface (line ~93) and data mapping (lines ~275, ~348)

**Step 1: Add PLSS fields to Baserow Field interface**

In `lib/baserow.ts`, add to the `Field` interface after `nrcs_field`:

```typescript
plss_township?: number;
plss_range?: number;
plss_section?: number;
plss_description?: string;
```

**Step 2: Add PLSS fields to ProcessedField interface**

In `app/fields/page.tsx`, add after `fieldDirections` (~line 93):

```typescript
plssTownship: number | null;
plssRange: number | null;
plssSection: number | null;
plssDescription: string;
```

**Step 3: Add PLSS to field data processing — default values**

In `app/fields/page.tsx`, in the default ProcessedField construction (~line 275, near the `lat: 0, lng: 0` defaults):

```typescript
plssTownship: null,
plssRange: null,
plssSection: null,
plssDescription: '',
```

**Step 4: Add PLSS to field data processing — actual values**

In `app/fields/page.tsx`, in the field data mapping where `lat`, `lng`, `elevation` are read from the Baserow field (~line 348):

```typescript
plssTownship: field.plss_township ?? null,
plssRange: field.plss_range ?? null,
plssSection: field.plss_section ?? null,
plssDescription: field.plss_description || '',
```

**Step 5: Create the 4 PLSS fields in Baserow**

Manually create these fields in the Baserow `fields` table (817298) via the Baserow UI:
- `plss_township` — Number field
- `plss_range` — Number field
- `plss_section` — Number field
- `plss_description` — Long Text field

**Step 6: Commit**

```bash
git add lib/baserow.ts app/fields/page.tsx
git commit -m "feat: add PLSS fields to Baserow interface and ProcessedField"
```

---

### Task 4: Update Field API Routes

**Files:**
- Modify: `app/api/fields/route.ts` — accept PLSS fields on POST (~line 47)
- Modify: `app/api/fields/[id]/route.ts` — accept PLSS fields on PATCH (~line 52)

**Step 1: Add PLSS fields to POST /api/fields**

In `app/api/fields/route.ts`, after the `lng` handling (~line 47), add:

```typescript
if (body.plss_township !== undefined && body.plss_township !== null && body.plss_township !== '') {
  createData.plss_township = Number(body.plss_township);
}
if (body.plss_range !== undefined && body.plss_range !== null && body.plss_range !== '') {
  createData.plss_range = Number(body.plss_range);
}
if (body.plss_section !== undefined && body.plss_section !== null && body.plss_section !== '') {
  createData.plss_section = Number(body.plss_section);
}
if (body.plss_description !== undefined) {
  createData.plss_description = body.plss_description || '';
}
```

**Step 2: Add PLSS fields to PATCH /api/fields/[id]**

In `app/api/fields/[id]/route.ts`, after the existing field mappings (~line 52), add:

```typescript
if (body.plss_township !== undefined) updateData.plss_township = body.plss_township;
if (body.plss_range !== undefined) updateData.plss_range = body.plss_range;
if (body.plss_section !== undefined) updateData.plss_section = body.plss_section;
if (body.plss_description !== undefined) updateData.plss_description = body.plss_description;
```

**Step 3: Commit**

```bash
git add app/api/fields/route.ts app/api/fields/[id]/route.ts
git commit -m "feat: accept PLSS fields in field create/update API routes"
```

---

### Task 5: Add Field Modal — PLSS Inputs

**Files:**
- Modify: `components/fields/AddFieldModal.tsx` — add PLSS fields to form state (~line 7) and render dropdowns (~line 237)

**Step 1: Add PLSS fields to AddFieldForm interface**

In `AddFieldForm` interface (~line 7), add:

```typescript
plss_township: string;
plss_range: string;
plss_section: string;
plss_description: string;
```

**Step 2: Add defaults to initial form state**

Find where the form state is initialized (the `useState<AddFieldForm>` call) and add:

```typescript
plss_township: '',
plss_range: '',
plss_section: '',
plss_description: '',
```

**Step 3: Add PLSS fields to the form submission body**

In the `handleSubmit` function (~line 117), add to the POST body:

```typescript
plss_township: form.plss_township || null,
plss_range: form.plss_range || null,
plss_section: form.plss_section || null,
plss_description: form.plss_description || '',
```

**Step 4: Add PLSS dropdowns and Locate button to the form UI**

Insert above the existing lat/lng `<div className="form-row">` (~line 237):

```tsx
<div className="form-row">
  <div className="form-group">
    <label>Township</label>
    <select value={form.plss_township} onChange={(e) => setForm({ ...form, plss_township: e.target.value })}>
      <option value="">—</option>
      {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>{n}N</option>
      ))}
    </select>
  </div>
  <div className="form-group">
    <label>Range</label>
    <select value={form.plss_range} onChange={(e) => setForm({ ...form, plss_range: e.target.value })}>
      <option value="">—</option>
      {Array.from({ length: 16 }, (_, i) => i + 7).map((n) => (
        <option key={n} value={n}>{n}W</option>
      ))}
    </select>
  </div>
  <div className="form-group">
    <label>Section</label>
    <select value={form.plss_section} onChange={(e) => setForm({ ...form, plss_section: e.target.value })}>
      <option value="">—</option>
      {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  </div>
  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
    <button
      type="button"
      className="btn btn-secondary"
      disabled={!form.plss_township || !form.plss_range || !form.plss_section}
      onClick={async () => {
        const res = await fetch(`/api/plss/lookup?township=${form.plss_township}&range=${form.plss_range}&section=${form.plss_section}`);
        if (res.ok) {
          const data = await res.json();
          onPlssLocate?.(data.lat, data.lng, data.bounds);
        }
      }}
    >
      Locate
    </button>
  </div>
</div>
<div className="form-row">
  <div className="form-group" style={{ flex: 1 }}>
    <label>PLSS Description</label>
    <input
      type="text"
      value={form.plss_description}
      onChange={(e) => setForm({ ...form, plss_description: e.target.value })}
      placeholder="e.g. NE 40 of the NW 1/4"
    />
  </div>
</div>
```

**Step 5: Add `onPlssLocate` prop to the modal**

Add to the modal's props interface:

```typescript
onPlssLocate?: (lat: number, lng: number, bounds: [[number, number], [number, number]]) => void;
```

The parent (`FieldsClient.tsx`) will handle this callback by opening the LocationPicker centered on the section. This is wired up in Task 7.

**Step 6: Commit**

```bash
git add components/fields/AddFieldModal.tsx
git commit -m "feat: add PLSS dropdowns and Locate button to Add Field modal"
```

---

### Task 6: Edit Form + Detail Panel — PLSS Display & Editing

**Files:**
- Modify: `app/fields/FieldsClient.tsx` — add PLSS to edit form (~line 2487), detail panel (~line 2643), and save handler (~line 890)

**Step 1: Add PLSS to the edit form (Location Data section)**

In the edit form's "Location Data" section (~line 2487), add before the Elevation field:

```tsx
<div className="form-row">
  <div className="form-group">
    <label>Township</label>
    <select value={editForm.plssTownship || ''} onChange={(e) => setEditForm({ ...editForm, plssTownship: e.target.value ? parseInt(e.target.value) : null })}>
      <option value="">—</option>
      {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>{n}N</option>
      ))}
    </select>
  </div>
  <div className="form-group">
    <label>Range</label>
    <select value={editForm.plssRange || ''} onChange={(e) => setEditForm({ ...editForm, plssRange: e.target.value ? parseInt(e.target.value) : null })}>
      <option value="">—</option>
      {Array.from({ length: 16 }, (_, i) => i + 7).map((n) => (
        <option key={n} value={n}>{n}W</option>
      ))}
    </select>
  </div>
  <div className="form-group">
    <label>Section</label>
    <select value={editForm.plssSection || ''} onChange={(e) => setEditForm({ ...editForm, plssSection: e.target.value ? parseInt(e.target.value) : null })}>
      <option value="">—</option>
      {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  </div>
</div>
<div className="form-group">
  <label>PLSS Description</label>
  <input
    type="text"
    value={editForm.plssDescription || ''}
    onChange={(e) => setEditForm({ ...editForm, plssDescription: e.target.value })}
    placeholder="e.g. NE 40 of the NW 1/4"
  />
</div>
```

**Step 2: Add PLSS to the detail panel (display-only)**

In the Location Data display section (~line 2643), add before the Elevation display row. Also update the conditional that guards this section to include PLSS:

```tsx
{(selectedField.plssTownship || selectedField.elevation || selectedField.soilType || selectedField.placementNotes) && (
```

Add inside the section, before the elevation row:

```tsx
{selectedField.plssTownship && (
  <div className="detail-row">
    <span className="detail-label">PLSS Location</span>
    <span className="detail-value">
      T{selectedField.plssTownship}N R{selectedField.plssRange}W Sec {selectedField.plssSection}
      {selectedField.plssDescription ? ` — ${selectedField.plssDescription}` : ''}
    </span>
  </div>
)}
```

**Step 3: Add PLSS to the save handler**

In `handleSave` (~line 890), add to the PATCH body:

```typescript
plss_township: editForm.plssTownship ?? null,
plss_range: editForm.plssRange ?? null,
plss_section: editForm.plssSection ?? null,
plss_description: editForm.plssDescription || '',
```

Also update the local state update after save to include the new fields (in the `setFields` / `setSelectedField` calls around line 926):

```typescript
plssTownship: editForm.plssTownship ?? selectedField.plssTownship,
plssRange: editForm.plssRange ?? selectedField.plssRange,
plssSection: editForm.plssSection ?? selectedField.plssSection,
plssDescription: editForm.plssDescription ?? selectedField.plssDescription,
```

**Step 4: Commit**

```bash
git add app/fields/FieldsClient.tsx
git commit -m "feat: add PLSS to field edit form and detail panel"
```

---

### Task 7: LocationPicker — Reverse PLSS Auto-Population

**Files:**
- Modify: `components/LocationPicker.tsx` — add PLSS reverse lookup on position change (~line 74), add PLSS to callback (~line 16)

**Step 1: Update LocationPickerProps to include PLSS data**

In `LocationPickerProps` interface (~line 16), update the callback signature:

```typescript
onLocationChange: (
  lat: number,
  lng: number,
  elevation?: number | null,
  soilType?: string | null,
  plss?: { township: number; range: number; section: number } | null,
) => void | Promise<void>;
```

Also add optional props for initial center (for Locate button):

```typescript
initialCenter?: [number, number];
initialZoom?: number;
```

**Step 2: Add PLSS state and fetch**

Add state variables alongside the existing elevation/soil state (~line 56):

```typescript
const [plss, setPlss] = useState<{ township: number; range: number; section: number } | null>(null);
const [plssLoading, setPlssLoading] = useState(false);
```

In the position-change effect (~line 74), alongside the elevation and soil fetches, add:

```typescript
// PLSS reverse lookup
setPlssLoading(true);
fetch(`/api/plss/lookup?lat=${lat}&lng=${lng}`)
  .then(res => res.ok ? res.json() : null)
  .then(data => setPlss(data))
  .catch(() => setPlss(null))
  .finally(() => setPlssLoading(false));
```

**Step 3: Update handleSave to include PLSS**

In `handleSave` (~line 102):

```typescript
const handleSave = async () => {
  if (position) {
    await onLocationChange(position[0], position[1], elevation, soilType, plss);
    onClose();
  }
};
```

**Step 4: Optionally display PLSS in the info panel**

If the LocationPicker has a panel showing elevation/soil, add PLSS there too:

```tsx
{plssLoading ? 'Loading PLSS...' : plss ? `T${plss.township}N R${plss.range}W Sec ${plss.section}` : ''}
```

**Step 5: Update all callers of LocationPicker**

In `FieldsClient.tsx` (~line 2961), update the `onLocationChange` callback to accept and use the new `plss` parameter:

```typescript
onLocationChange={async (lat, lng, elevation, soilType, plss) => {
  if (locationPickerTarget === 'edit' && selectedField) {
    setEditForm(prev => ({
      ...prev,
      lat, lng, elevation, soilType,
      plssTownship: plss?.township ?? prev.plssTownship,
      plssRange: plss?.range ?? prev.plssRange,
      plssSection: plss?.section ?? prev.plssSection,
    }));
  } else if (locationPickerTarget === 'add') {
    setAddFieldLatLng({ lat: lat.toString(), lng: lng.toString() });
    setAddFieldPlss(plss); // New state — see step 6
  } else if (locationPickerTarget === 'probeAssignment' && editingProbeAssignmentLocation) {
    await handleProbeAssignmentLocationSave(
      editingProbeAssignmentLocation.id,
      lat, lng, elevation, soilType
    );
  }
}}
```

**Step 6: Wire up PLSS from LocationPicker to AddFieldModal**

Add state in FieldsClient for passing PLSS to the add modal:

```typescript
const [addFieldPlss, setAddFieldPlss] = useState<{ township: number; range: number; section: number } | null>(null);
```

Pass to AddFieldModal as a prop and have the modal update its form state when this prop changes (via useEffect).

**Step 7: Wire up the Locate button (forward lookup)**

Handle the `onPlssLocate` callback from AddFieldModal in FieldsClient. When Locate is clicked:

```typescript
onPlssLocate={(lat, lng, bounds) => {
  setLocationPickerTarget('add');
  setShowLocationPicker(true);
  // Pass initial center/zoom to LocationPicker
  setLocationPickerInitialCenter([lat, lng]);
  setLocationPickerInitialZoom(14);
}}
```

Add the corresponding state and pass to LocationPicker:

```typescript
const [locationPickerInitialCenter, setLocationPickerInitialCenter] = useState<[number, number] | undefined>();
const [locationPickerInitialZoom, setLocationPickerInitialZoom] = useState<number | undefined>();
```

**Step 8: Update LocationPickerMap to use initialCenter/initialZoom**

In `components/LocationPickerMap.tsx`, accept `initialCenter` and `initialZoom` props and use them for the map's initial view instead of the default center when provided.

**Step 9: Commit**

```bash
git add components/LocationPicker.tsx components/LocationPickerMap.tsx app/fields/FieldsClient.tsx components/fields/AddFieldModal.tsx
git commit -m "feat: bidirectional PLSS sync — auto-populate on map click, Locate centers map"
```

---

### Task 8: Manual Testing & Polish

**Step 1: Test reverse lookup flow**
1. Open Fields page, click a field, click Edit
2. Click "Pick Location on Map", click a spot in Nebraska
3. Verify T/R/S auto-populate in the edit form after saving
4. Verify PLSS shows in the detail panel display

**Step 2: Test forward lookup flow**
1. Click "Add Field", fill in a billing entity and name
2. Set Township=14, Range=8, Section=24
3. Click "Locate"
4. Verify the map opens centered on that section
5. Click a spot in the section
6. Verify lat/lng are set

**Step 3: Test persistence**
1. Add a field with PLSS data
2. Refresh the page
3. Verify PLSS data shows in the detail panel
4. Edit the field, verify PLSS dropdowns are pre-filled

**Step 4: Test edge cases**
- Add a field without any PLSS data (should work as before)
- Set only T/R/S without description
- Set only description without T/R/S
- Click Locate with incomplete T/R/S (button should be disabled)

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish PLSS integration after manual testing"
```
