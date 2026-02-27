'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  haversineDistance,
  polygonArea,
  formatDistance,
  formatArea,
} from '../lib/measure-geo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeasureMode = 'line' | 'polygon' | 'circle' | null;

interface MeasureToolProps {
  mode: MeasureMode;
  onModeChange: (mode: MeasureMode) => void;
  clearSignal?: number;
}

// ---------------------------------------------------------------------------
// Style constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the running total distance along a polyline of latlngs. */
function totalDistance(points: L.LatLng[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversineDistance(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
  }
  return d;
}

/** Create a permanent tooltip bound to a layer. */
function addResultTooltip(layer: L.Layer, text: string, latlng: L.LatLng) {
  layer.bindTooltip(text, {
    permanent: true,
    direction: 'center',
    className: 'measure-tooltip',
  });
  // For shapes that already have a position this is enough; for circle we pass the center
  if ((layer as L.Circle).getLatLng) {
    (layer as L.Circle).openTooltip();
  } else if ((layer as L.Polyline).getCenter) {
    (layer as L.Polyline).openTooltip((layer as L.Polyline).getCenter());
  } else {
    (layer as L.Polyline).openTooltip(latlng);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MeasureTool({ mode, onModeChange, clearSignal }: MeasureToolProps) {
  const map = useMap();

  // Refs for drawing state (never put L.Layer in React state)
  const pointsRef = useRef<L.LatLng[]>([]);
  const previewLineRef = useRef<L.Polyline | null>(null);
  const previewShapeRef = useRef<L.Polygon | L.Circle | null>(null);
  const vertexGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const cursorTooltipRef = useRef<L.Tooltip | null>(null);

  // Completed measurements live here
  const completedGroupRef = useRef<L.LayerGroup>(L.layerGroup());

  // Track whether double-click zoom was enabled before measuring
  const dblClickZoomEnabledRef = useRef<boolean>(true);

  // Store the current mode in a ref so event handlers always see the latest value
  const modeRef = useRef<MeasureMode>(mode);
  modeRef.current = mode;

  // ------------------------------------------------------------------
  // Cursor tooltip that follows the mouse
  // ------------------------------------------------------------------

  const showCursorTooltip = useCallback(
    (latlng: L.LatLng, text: string) => {
      if (cursorTooltipRef.current) {
        cursorTooltipRef.current.setLatLng(latlng).setContent(text);
        if (!map.hasLayer(cursorTooltipRef.current as unknown as L.Layer)) {
          (cursorTooltipRef.current as unknown as L.Layer).addTo(map);
        }
      } else {
        cursorTooltipRef.current = L.tooltip({
          permanent: true,
          direction: 'right',
          offset: [15, 0],
          className: 'measure-cursor-tooltip',
        })
          .setLatLng(latlng)
          .setContent(text)
          .addTo(map);
      }
    },
    [map],
  );

  const hideCursorTooltip = useCallback(() => {
    if (cursorTooltipRef.current) {
      map.removeLayer(cursorTooltipRef.current as unknown as L.Layer);
      cursorTooltipRef.current = null;
    }
  }, [map]);

  // ------------------------------------------------------------------
  // Utility: add vertex marker
  // ------------------------------------------------------------------

  const addVertex = useCallback(
    (latlng: L.LatLng) => {
      const marker = L.circleMarker(latlng, VERTEX_STYLE);
      vertexGroupRef.current.addLayer(marker);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Finish helpers — move active layers into the completed group
  // ------------------------------------------------------------------

  const finishLine = useCallback(() => {
    const pts = pointsRef.current;
    if (pts.length < 2) return;

    const line = L.polyline(pts, MEASURE_STYLE);
    const dist = totalDistance(pts);
    addResultTooltip(line, formatDistance(dist), line.getCenter());

    // Add vertex markers to completed group
    pts.forEach((p) => {
      completedGroupRef.current.addLayer(L.circleMarker(p, VERTEX_STYLE));
    });
    completedGroupRef.current.addLayer(line);
  }, []);

  const finishPolygon = useCallback(() => {
    const pts = pointsRef.current;
    if (pts.length < 3) return;

    const poly = L.polygon(pts, MEASURE_FILL);
    const coords: [number, number][] = pts.map((p) => [p.lat, p.lng]);
    const area = polygonArea(coords);
    addResultTooltip(poly, formatArea(area), poly.getCenter());

    pts.forEach((p) => {
      completedGroupRef.current.addLayer(L.circleMarker(p, VERTEX_STYLE));
    });
    completedGroupRef.current.addLayer(poly);
  }, []);

  const finishCircle = useCallback((center: L.LatLng, edge: L.LatLng) => {
    const radius = haversineDistance(center.lat, center.lng, edge.lat, edge.lng);
    const circle = L.circle(center, { ...MEASURE_FILL, radius });
    const area = Math.PI * radius * radius;
    addResultTooltip(
      circle,
      `${formatArea(area)}\nr = ${formatDistance(radius)}`,
      center,
    );

    completedGroupRef.current.addLayer(L.circleMarker(center, VERTEX_STYLE));
    completedGroupRef.current.addLayer(L.circleMarker(edge, VERTEX_STYLE));
    completedGroupRef.current.addLayer(circle);
  }, []);

  // ------------------------------------------------------------------
  // Tear down active (in-progress) drawing layers
  // ------------------------------------------------------------------

  const clearActiveDrawing = useCallback(() => {
    if (previewLineRef.current) {
      map.removeLayer(previewLineRef.current);
      previewLineRef.current = null;
    }
    if (previewShapeRef.current) {
      map.removeLayer(previewShapeRef.current);
      previewShapeRef.current = null;
    }
    vertexGroupRef.current.clearLayers();
    hideCursorTooltip();
    pointsRef.current = [];
  }, [map, hideCursorTooltip]);

  // ------------------------------------------------------------------
  // Map event handlers
  // ------------------------------------------------------------------

  const handleClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const currentMode = modeRef.current;
      if (!currentMode) return;

      const latlng = e.latlng;

      if (currentMode === 'line' || currentMode === 'polygon') {
        pointsRef.current.push(latlng);
        addVertex(latlng);

        // Ensure vertex group is on the map
        if (!map.hasLayer(vertexGroupRef.current)) {
          vertexGroupRef.current.addTo(map);
        }
      }

      if (currentMode === 'circle') {
        if (pointsRef.current.length === 0) {
          // First click — center
          pointsRef.current.push(latlng);
          addVertex(latlng);
          if (!map.hasLayer(vertexGroupRef.current)) {
            vertexGroupRef.current.addTo(map);
          }
        } else {
          // Second click — edge → finish
          addVertex(latlng);
          finishCircle(pointsRef.current[0], latlng);
          clearActiveDrawing();
          onModeChange(null);
        }
      }
    },
    [map, addVertex, finishCircle, clearActiveDrawing, onModeChange],
  );

  const handleMouseMove = useCallback(
    (e: L.LeafletMouseEvent) => {
      const currentMode = modeRef.current;
      if (!currentMode) return;

      const pts = pointsRef.current;
      const latlng = e.latlng;

      if (currentMode === 'line' && pts.length > 0) {
        const allPts = [...pts, latlng];
        if (previewLineRef.current) {
          previewLineRef.current.setLatLngs(allPts);
        } else {
          previewLineRef.current = L.polyline(allPts, {
            ...MEASURE_STYLE,
            opacity: 0.6,
          }).addTo(map);
        }
        const dist = totalDistance(allPts);
        showCursorTooltip(latlng, formatDistance(dist));
      }

      if (currentMode === 'polygon' && pts.length > 0) {
        const allPts = [...pts, latlng];
        if (previewShapeRef.current && previewShapeRef.current instanceof L.Polygon) {
          previewShapeRef.current.setLatLngs(allPts);
        } else {
          if (previewShapeRef.current) map.removeLayer(previewShapeRef.current);
          previewShapeRef.current = L.polygon(allPts, {
            ...MEASURE_FILL,
            opacity: 0.6,
            fillOpacity: 0.1,
          }).addTo(map);
        }
        if (allPts.length >= 3) {
          const coords: [number, number][] = allPts.map((p) => [p.lat, p.lng]);
          const area = polygonArea(coords);
          showCursorTooltip(latlng, formatArea(area));
        } else {
          showCursorTooltip(latlng, 'Click to add points');
        }
      }

      if (currentMode === 'circle' && pts.length === 1) {
        const center = pts[0];
        const radius = haversineDistance(center.lat, center.lng, latlng.lat, latlng.lng);

        if (previewShapeRef.current && previewShapeRef.current instanceof L.Circle) {
          previewShapeRef.current.setRadius(radius);
        } else {
          if (previewShapeRef.current) map.removeLayer(previewShapeRef.current);
          previewShapeRef.current = L.circle(center, {
            ...MEASURE_FILL,
            radius,
            opacity: 0.6,
            fillOpacity: 0.1,
          }).addTo(map);
        }
        const area = Math.PI * radius * radius;
        showCursorTooltip(
          latlng,
          `${formatArea(area)}\nr = ${formatDistance(radius)}`,
        );
      }
    },
    [map, showCursorTooltip],
  );

  const handleDblClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const currentMode = modeRef.current;
      if (!currentMode) return;

      // Prevent the double-click zoom
      L.DomEvent.stop(e);

      // A double-click fires two click events first, so the second click has
      // already pushed a duplicate of the first click's latlng. Remove it so
      // the finished shape doesn't have a doubled end-point.
      if (pointsRef.current.length > 1) {
        pointsRef.current.pop();
      }

      if (currentMode === 'line') {
        finishLine();
        clearActiveDrawing();
        onModeChange(null);
      }

      if (currentMode === 'polygon') {
        finishPolygon();
        clearActiveDrawing();
        onModeChange(null);
      }
      // Circle does not use double-click (it finishes on second single click)
    },
    [finishLine, finishPolygon, clearActiveDrawing, onModeChange],
  );

  // ------------------------------------------------------------------
  // Escape key handler
  // ------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modeRef.current) {
        clearActiveDrawing();
        onModeChange(null);
      }
    },
    [clearActiveDrawing, onModeChange],
  );

  // ------------------------------------------------------------------
  // Effect: manage event listeners when mode changes
  // ------------------------------------------------------------------

  useEffect(() => {
    // Ensure completed group is always on the map
    if (!map.hasLayer(completedGroupRef.current)) {
      completedGroupRef.current.addTo(map);
    }

    if (mode) {
      // Disable double-click zoom while measuring
      dblClickZoomEnabledRef.current = map.doubleClickZoom.enabled();
      map.doubleClickZoom.disable();

      // Set crosshair cursor
      map.getContainer().style.cursor = 'crosshair';

      // Attach map event listeners
      map.on('click', handleClick);
      map.on('mousemove', handleMouseMove);
      map.on('dblclick', handleDblClick);

      // Attach keyboard listener
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      // Remove map event listeners
      map.off('click', handleClick);
      map.off('mousemove', handleMouseMove);
      map.off('dblclick', handleDblClick);

      // Remove keyboard listener
      document.removeEventListener('keydown', handleKeyDown);

      // Restore cursor
      map.getContainer().style.cursor = '';

      // Restore double-click zoom if it was enabled before
      if (dblClickZoomEnabledRef.current) {
        map.doubleClickZoom.enable();
      }

      // Clean up active drawing (preview layers, vertices, cursor tooltip)
      clearActiveDrawing();
    };
  }, [mode, map, handleClick, handleMouseMove, handleDblClick, handleKeyDown, clearActiveDrawing]);

  // ------------------------------------------------------------------
  // Effect: clear completed measurements when clearSignal changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (clearSignal === undefined) return;
    completedGroupRef.current.clearLayers();
  }, [clearSignal]);

  // ------------------------------------------------------------------
  // Effect: cleanup on unmount
  // ------------------------------------------------------------------

  useEffect(() => {
    const completed = completedGroupRef.current;
    const vertices = vertexGroupRef.current;

    return () => {
      // Remove layer groups from map on unmount
      if (map.hasLayer(completed)) {
        map.removeLayer(completed);
      }
      if (map.hasLayer(vertices)) {
        map.removeLayer(vertices);
      }
    };
  }, [map]);

  // This component renders no React DOM — only Leaflet layers
  return null;
}
