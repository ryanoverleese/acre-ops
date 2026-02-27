# Measure Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Earth-style measurement tools (distance line, area polygon, area circle) to the Fields map.

**Architecture:** A single `MeasureTool.tsx` component rendered inside FieldsMap's `<MapContainer>`. Uses `useMap()` to attach click/move handlers directly to the Leaflet map instance. Pure geometry math for Haversine distance and Shoelace area — zero new dependencies.

**Tech Stack:** React 19, react-leaflet 5, Leaflet 1.9.4, TypeScript, Next.js 16

---

### Task 1: Create geo utility functions

**Files:**
- Create: `lib/measure-geo.ts`

**Step 1: Create the geometry utility file**

This file contains all measurement math — Haversine for distance, Shoelace for polygon area, and circle area from radius. Keeping these pure functions separate from the component.

```typescript
// lib/measure-geo.ts

/** Haversine distance between two lat/lng points, returns meters */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Polygon area using Shoelace formula on spherical coordinates, returns square meters */
export function polygonArea(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[j];
    total += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((total * R * R) / 2);
}

/** Convert square meters to acres */
export function sqMetersToAcres(sqm: number): number {
  return sqm / 4046.8564224;
}

/** Format distance for display: feet if < 1000ft, otherwise miles */
export function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = feet / 5280;
  return `${miles.toFixed(2)} mi`;
}

/** Format area for display in acres */
export function formatArea(sqMeters: number): string {
  const acres = sqMetersToAcres(sqMeters);
  if (acres < 0.01) {
    return `${Math.round(sqMeters * 10.7639)} sq ft`;
  }
  return `${acres.toFixed(2)} ac`;
}
```

**Step 2: Commit**

```bash
git add lib/measure-geo.ts
git commit -m "feat: add geometry utility functions for measure tool"
```

---

### Task 2: Create MeasureTool component

**Files:**
- Create: `components/MeasureTool.tsx`

**Step 1: Create the MeasureTool component**

This is a react-leaflet child component that uses `useMap()` to interact with the Leaflet map. It manages three measurement modes (line, polygon, circle) and renders shapes + labels directly on the map using Leaflet primitives.

Key behaviors:
- Attaches `click` and `mousemove` handlers to the map when a mode is active
- Draws `L.Polyline` for distance, `L.Polygon` for area, `L.Circle` for circle area
- Shows a live tooltip following the cursor with current measurement
- Double-click finishes a line/polygon measurement
- For circle: first click = center, second click = edge (radius)
- All shapes use yellow (#facc15) dashed styling with white outline
- Permanent tooltips show final measurements on completed shapes
- `clear()` removes all drawn layers
- Escape key or clicking X exits measure mode

```typescript
// components/MeasureTool.tsx
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  haversineDistance,
  polygonArea,
  formatDistance,
  formatArea,
} from '../lib/measure-geo';

export type MeasureMode = 'line' | 'polygon' | 'circle' | null;

interface MeasureToolProps {
  mode: MeasureMode;
  onModeChange: (mode: MeasureMode) => void;
}

const MEASURE_STYLE: L.PolylineOptions = {
  color: '#facc15',
  weight: 3,
  dashArray: '8, 6',
  opacity: 1,
};

const MEASURE_FILL: L.PathOptions = {
  ...MEASURE_STYLE,
  fillColor: '#facc15',
  fillOpacity: 0.15,
};

const VERTEX_STYLE: L.CircleMarkerOptions = {
  radius: 5,
  fillColor: '#ffffff',
  fillOpacity: 1,
  color: '#facc15',
  weight: 2,
};

export default function MeasureTool({ mode, onModeChange }: MeasureToolProps) {
  const map = useMap();
  const pointsRef = useRef<L.LatLng[]>([]);
  const activeLayerRef = useRef<L.Layer | null>(null);
  const previewLayerRef = useRef<L.Layer | null>(null);
  const vertexLayersRef = useRef<L.CircleMarker[]>([]);
  const completedLayersRef = useRef<L.LayerGroup>(L.layerGroup());
  const tooltipRef = useRef<L.Tooltip | null>(null);
  const [cursorTooltip, setCursorTooltip] = useState<string>('');

  // Add completed layers group to map once
  useEffect(() => {
    completedLayersRef.current.addTo(map);
    return () => {
      completedLayersRef.current.remove();
    };
  }, [map]);

  // Cleanup active drawing state
  const cleanupActive = useCallback(() => {
    if (activeLayerRef.current) {
      map.removeLayer(activeLayerRef.current);
      activeLayerRef.current = null;
    }
    if (previewLayerRef.current) {
      map.removeLayer(previewLayerRef.current);
      previewLayerRef.current = null;
    }
    vertexLayersRef.current.forEach((v) => map.removeLayer(v));
    vertexLayersRef.current = [];
    if (tooltipRef.current) {
      map.removeLayer(tooltipRef.current as unknown as L.Layer);
      tooltipRef.current = null;
    }
    pointsRef.current = [];
    setCursorTooltip('');
  }, [map]);

  // Clear all measurements
  const clearAll = useCallback(() => {
    cleanupActive();
    completedLayersRef.current.clearLayers();
  }, [cleanupActive]);

  // Expose clearAll on the map instance for FieldsMap to call
  useEffect(() => {
    (map as unknown as Record<string, unknown>)._measureClearAll = clearAll;
    return () => {
      delete (map as unknown as Record<string, unknown>)._measureClearAll;
    };
  }, [map, clearAll]);

  // Finalize the current measurement shape
  const finalizeMeasurement = useCallback(() => {
    const points = pointsRef.current;
    if (!points.length) return;

    let label = '';
    let shape: L.Layer | null = null;

    if (mode === 'line' && points.length >= 2) {
      let totalDist = 0;
      for (let i = 1; i < points.length; i++) {
        totalDist += haversineDistance(
          points[i - 1].lat, points[i - 1].lng,
          points[i].lat, points[i].lng
        );
      }
      label = formatDistance(totalDist);
      shape = L.polyline(points, MEASURE_STYLE);
    } else if (mode === 'polygon' && points.length >= 3) {
      const coords: [number, number][] = points.map((p) => [p.lat, p.lng]);
      const area = polygonArea(coords);
      label = formatArea(area);
      shape = L.polygon(points, MEASURE_FILL);
    } else if (mode === 'circle' && points.length === 2) {
      const radius = haversineDistance(
        points[0].lat, points[0].lng,
        points[1].lat, points[1].lng
      );
      const area = Math.PI * radius * radius;
      label = formatArea(area);
      shape = L.circle(points[0], { ...MEASURE_FILL, radius });
    }

    if (shape && label) {
      shape.bindTooltip(label, { permanent: true, direction: 'center', className: 'measure-tooltip' });
      completedLayersRef.current.addLayer(shape);
      // Add vertex dots to completed group
      points.forEach((p) => {
        const dot = L.circleMarker(p, VERTEX_STYLE);
        completedLayersRef.current.addLayer(dot);
      });
    }

    cleanupActive();
  }, [mode, cleanupActive]);

  // Main map event handlers
  useEffect(() => {
    if (!mode) return;

    // Change cursor
    map.getContainer().style.cursor = 'crosshair';

    const onClick = (e: L.LeafletMouseEvent) => {
      const latlng = e.latlng;
      const points = pointsRef.current;

      if (mode === 'circle') {
        if (points.length === 0) {
          points.push(latlng);
          // Draw center dot
          const dot = L.circleMarker(latlng, VERTEX_STYLE).addTo(map);
          vertexLayersRef.current.push(dot);
        } else {
          // Second click finalizes circle
          points.push(latlng);
          finalizeMeasurement();
        }
        return;
      }

      // Line / Polygon mode
      points.push(latlng);
      const dot = L.circleMarker(latlng, VERTEX_STYLE).addTo(map);
      vertexLayersRef.current.push(dot);

      // Update active polyline/polygon
      if (activeLayerRef.current) {
        map.removeLayer(activeLayerRef.current);
      }
      if (points.length >= 2) {
        if (mode === 'line') {
          activeLayerRef.current = L.polyline(points, MEASURE_STYLE).addTo(map);
        } else {
          activeLayerRef.current = L.polygon(points, MEASURE_FILL).addTo(map);
        }
      }
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e);
      if (mode === 'line' || mode === 'polygon') {
        finalizeMeasurement();
      }
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const points = pointsRef.current;
      if (!points.length) {
        if (mode === 'circle') {
          setCursorTooltip('Click to set center');
        } else {
          setCursorTooltip('Click to start measuring');
        }
        return;
      }

      const lastPoint = points[points.length - 1];
      const curPoint = e.latlng;

      // Draw preview line
      if (previewLayerRef.current) {
        map.removeLayer(previewLayerRef.current);
      }

      if (mode === 'circle') {
        const radius = haversineDistance(
          points[0].lat, points[0].lng,
          curPoint.lat, curPoint.lng
        );
        previewLayerRef.current = L.circle(points[0], {
          ...MEASURE_FILL,
          radius,
          dashArray: '8, 6',
        }).addTo(map);
        const area = Math.PI * radius * radius;
        setCursorTooltip(`${formatArea(area)} (${formatDistance(radius)} radius)`);
      } else {
        previewLayerRef.current = L.polyline(
          [lastPoint, curPoint],
          { ...MEASURE_STYLE, opacity: 0.6 }
        ).addTo(map);

        if (mode === 'line') {
          let totalDist = 0;
          for (let i = 1; i < points.length; i++) {
            totalDist += haversineDistance(
              points[i - 1].lat, points[i - 1].lng,
              points[i].lat, points[i].lng
            );
          }
          totalDist += haversineDistance(
            lastPoint.lat, lastPoint.lng,
            curPoint.lat, curPoint.lng
          );
          setCursorTooltip(formatDistance(totalDist));
        } else {
          // Polygon: show area preview
          const previewPoints: [number, number][] = [...points, curPoint].map(
            (p) => [p.lat, p.lng]
          );
          if (previewPoints.length >= 3) {
            const area = polygonArea(previewPoints);
            setCursorTooltip(formatArea(area));
          } else {
            setCursorTooltip('Click to add points');
          }
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanupActive();
        onModeChange(null);
      }
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.on('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);

    // Disable double-click zoom while measuring
    map.doubleClickZoom.disable();

    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      map.off('mousemove', onMouseMove);
      document.removeEventListener('keydown', onKeyDown);
      map.getContainer().style.cursor = '';
      map.doubleClickZoom.enable();
      cleanupActive();
    };
  }, [map, mode, finalizeMeasurement, cleanupActive, onModeChange]);

  // Cursor tooltip (follows mouse)
  useEffect(() => {
    if (!mode || !cursorTooltip) return;

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (tooltipRef.current) {
        map.removeLayer(tooltipRef.current as unknown as L.Layer);
      }
      tooltipRef.current = L.tooltip({
        permanent: true,
        direction: 'right',
        offset: [15, 0],
        className: 'measure-cursor-tooltip',
      })
        .setLatLng(e.latlng)
        .setContent(cursorTooltip)
        .addTo(map);
    };

    map.on('mousemove', onMouseMove);
    return () => {
      map.off('mousemove', onMouseMove);
      if (tooltipRef.current) {
        map.removeLayer(tooltipRef.current as unknown as L.Layer);
        tooltipRef.current = null;
      }
    };
  }, [map, mode, cursorTooltip]);

  return null; // This component only adds Leaflet layers, no React DOM
}
```

**Step 2: Commit**

```bash
git add components/MeasureTool.tsx
git commit -m "feat: add MeasureTool component with line, polygon, circle modes"
```

---

### Task 3: Integrate MeasureTool into FieldsMap

**Files:**
- Modify: `components/FieldsMap.tsx`

**Step 1: Add MeasureTool imports and state to FieldsMap**

At the top of `FieldsMap.tsx`, add a dynamic import for `MeasureTool` and the type import for `MeasureMode`. Add state for `measureMode`. Add a ref for accessing the map's clearAll function.

Changes needed in `FieldsMap.tsx`:

1. After the existing dynamic imports (line ~99), add:
```typescript
const MeasureTool = dynamic(
  () => import('./MeasureTool'),
  { ssr: false }
);
```

2. Add type import at top:
```typescript
import type { MeasureMode } from './MeasureTool';
```

3. Inside the component, after `const [showPLSS, setShowPLSS] = useState(false);` (line 105), add:
```typescript
const [measureMode, setMeasureMode] = useState<MeasureMode>(null);
const [showMeasureMenu, setShowMeasureMenu] = useState(false);
```

**Step 2: Add measure toolbar UI to the controls area**

In the top-right controls div (line 213), add the measure toolbar button BEFORE the PLSS Grid toggle. This is a button with a ruler icon that shows a dropdown with Line/Polygon/Circle mode buttons + Clear.

Insert before the PLSS Grid label:
```tsx
{/* Measure tool */}
<div style={{ position: 'relative' }}>
  <button
    onClick={() => setShowMeasureMenu(!showMeasureMenu)}
    style={{
      ...controlStyle,
      color: measureMode ? '#facc15' : 'var(--text-secondary)',
      background: measureMode ? 'var(--bg-secondary)' : 'var(--bg-primary)',
    }}
    title="Measure tool"
  >
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18M3 21V3l4 4 4-4 4 4 4-4v18" />
    </svg>
    Measure
  </button>
  {showMeasureMenu && (
    <div style={{
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: '4px',
      background: 'var(--bg-primary)',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      padding: '4px',
      zIndex: 1001,
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      minWidth: '140px',
    }}>
      {([
        { key: 'line', label: 'Distance', icon: '📏' },
        { key: 'polygon', label: 'Area (Polygon)', icon: '⬡' },
        { key: 'circle', label: 'Area (Circle)', icon: '⊙' },
      ] as { key: MeasureMode; label: string; icon: string }[]).map(({ key, label, icon }) => (
        <button
          key={key}
          onClick={() => {
            setMeasureMode(measureMode === key ? null : key);
            setShowMeasureMenu(false);
          }}
          style={{
            ...controlStyle,
            width: '100%',
            justifyContent: 'flex-start',
            background: measureMode === key ? 'var(--bg-secondary)' : 'transparent',
            color: measureMode === key ? '#facc15' : 'var(--text-secondary)',
            boxShadow: 'none',
            padding: '8px 10px',
          }}
        >
          <span style={{ width: '20px' }}>{icon}</span>
          {label}
        </button>
      ))}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border-primary)', margin: '2px 0' }} />
      <button
        onClick={() => {
          // Call clearAll exposed on the map instance
          const mapContainer = mapRef.current?.querySelector('.leaflet-container');
          if (mapContainer) {
            const leafletMap = (mapContainer as unknown as { _leaflet_map?: Record<string, unknown> })._leaflet_map;
            // We'll use a different approach — see MeasureTool's clearAll via callback
          }
          setMeasureMode(null);
          setShowMeasureMenu(false);
        }}
        style={{
          ...controlStyle,
          width: '100%',
          justifyContent: 'flex-start',
          background: 'transparent',
          color: 'var(--accent-red, #dc2626)',
          boxShadow: 'none',
          padding: '8px 10px',
        }}
      >
        <span style={{ width: '20px' }}>✕</span>
        Clear All
      </button>
    </div>
  )}
</div>
```

**Step 3: Add MeasureTool inside MapContainer**

After `<PLSSOverlay show={showPLSS} />` (line 289), add:
```tsx
<MeasureTool mode={measureMode} onModeChange={setMeasureMode} />
```

**Step 4: Improve clear mechanism**

Replace the clear button approach with a `clearMeasurements` state counter that MeasureTool watches. Add state:
```typescript
const [clearMeasureCounter, setClearMeasureCounter] = useState(0);
```

Pass to MeasureTool:
```tsx
<MeasureTool mode={measureMode} onModeChange={setMeasureMode} clearSignal={clearMeasureCounter} />
```

Update MeasureTool props to accept `clearSignal: number` and watch it with useEffect to call clearAll.

The Clear All button simply does:
```typescript
setClearMeasureCounter((c) => c + 1);
setMeasureMode(null);
setShowMeasureMenu(false);
```

**Step 5: Commit**

```bash
git add components/FieldsMap.tsx components/MeasureTool.tsx
git commit -m "feat: integrate measure tool into Fields map toolbar"
```

---

### Task 4: Add measure tool CSS

**Files:**
- Modify: `app/globals.css`

**Step 1: Add measure tooltip styles**

Add at the end of the map-related CSS section (after the existing `.fields-map` styles):

```css
/* Measure tool tooltips */
.measure-tooltip {
  background: rgba(0, 0, 0, 0.8) !important;
  border: 1px solid #facc15 !important;
  border-radius: 4px !important;
  color: #facc15 !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  padding: 4px 8px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
}

.measure-tooltip::before {
  display: none !important;
}

.measure-cursor-tooltip {
  background: rgba(0, 0, 0, 0.75) !important;
  border: 1px solid rgba(250, 204, 21, 0.6) !important;
  border-radius: 4px !important;
  color: #fff !important;
  font-size: 12px !important;
  padding: 3px 6px !important;
  pointer-events: none !important;
}

.measure-cursor-tooltip::before {
  display: none !important;
}
```

**Step 2: Commit**

```bash
git add app/globals.css
git commit -m "style: add measure tool tooltip CSS"
```

---

### Task 5: Manual verification in dev mode

**Step 1: Start dev server and test**

Run: `npm run dev`
Navigate to: `http://localhost:3000/fields`

**Verify:**
1. Open the Fields map (click "Show Map" or however the map is toggled)
2. See the "Measure" button in the top-right controls bar
3. Click it — dropdown shows Distance, Area (Polygon), Area (Circle), Clear All
4. **Test Distance:** Select Distance, click 2+ points on map, see yellow dashed line with running distance. Double-click to finish. Permanent label shows total distance.
5. **Test Polygon:** Select Area (Polygon), click 3+ points, see polygon fill. Double-click to finish. Label shows acres.
6. **Test Circle:** Select Area (Circle), click center, move mouse to see radius preview, click again to finish. Label shows acres + radius.
7. **Test Clear:** Click Measure > Clear All. All shapes removed.
8. **Test Escape:** Start a measurement, press Escape. Mode exits, partial drawing cleared.
9. Verify existing map features still work (markers, popups, PLSS, brightness, fullscreen)

**Step 2: Final commit if any fixes needed**

---

## Execution Notes

- No new npm dependencies
- Only 3 files created/modified: `lib/measure-geo.ts`, `components/MeasureTool.tsx`, `components/FieldsMap.tsx`, `app/globals.css`
- All measurement is client-side, temporary, no database changes
- User will review in dev mode before any push
