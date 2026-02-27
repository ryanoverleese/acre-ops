# Measure Tool for Fields Map

## Overview
Add Google Earth-style measurement tools to the FieldsMap component. Users can measure distances (lines/paths) and areas (polygons/circles) directly on the satellite map.

## Requirements
- **Distance (Line/Path):** Click points to draw a path. Shows segment distances + running total. Units: feet (< 1000ft) or miles.
- **Area (Polygon):** Click points to draw a polygon. Shows enclosed area in acres.
- **Area (Circle):** Click center, then click/drag to set radius. Shows area in acres.
- **Temporary only:** Measurements are not saved to the database. Cleared on exit or via Clear button.
- **Fields section only:** Only added to FieldsMap.tsx.

## UI Design
- Ruler icon button added to existing top-right controls bar (next to PLSS, Brightness, Fullscreen)
- Clicking opens a small dropdown with 3 mode buttons: Line, Polygon, Circle
- Active mode gets highlighted styling
- While measuring:
  - Shapes drawn in bright dashed style (yellow #facc15 with white outline)
  - Tooltip follows cursor showing live measurement
  - Click to add points; double-click or Finish button completes measurement
  - Result label stays on shape until cleared
- Clear button removes all measurements
- X/Cancel exits measure mode
- Escape key also exits measure mode

## Architecture
- New file: `components/MeasureTool.tsx`
- React-leaflet child component using `useMap()` hook
- Uses Leaflet native: `L.Polyline`, `L.Polygon`, `L.Circle`, `L.Tooltip`
- Haversine formula for distance calculations
- Shoelace/Surveyor's formula for polygon area
- Zero new npm dependencies

## Integration
- Rendered inside `<MapContainer>` in FieldsMap.tsx
- Measure mode disables marker popup interactions so clicks go to measure tool
- Controlled via state in FieldsMap parent component

## Approach
Custom component built on raw Leaflet events. Chosen over leaflet-draw (bloated, unmaintained) and leaflet-measure plugins (react-leaflet 5 compatibility issues) for zero dependencies, full control, and consistency with existing codebase patterns.
