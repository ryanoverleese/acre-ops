'use client';

import { useEffect, useRef } from 'react';
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
  clearSignal?: number;
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

function totalDistance(points: L.LatLng[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversineDistance(
      points[i - 1].lat, points[i - 1].lng,
      points[i].lat, points[i].lng,
    );
  }
  return d;
}

export default function MeasureTool({ mode, onModeChange, clearSignal }: MeasureToolProps) {
  const map = useMap();

  // All mutable state in refs — no useCallback, no dependency churn
  const modeRef = useRef<MeasureMode>(mode);
  const onModeChangeRef = useRef(onModeChange);
  const pointsRef = useRef<L.LatLng[]>([]);
  const previewLineRef = useRef<L.Polyline | null>(null);
  const previewShapeRef = useRef<L.Polygon | L.Circle | null>(null);
  const vertexGroupRef = useRef<L.LayerGroup>(L.layerGroup());
  const cursorTooltipRef = useRef<L.Tooltip | null>(null);
  const completedGroupRef = useRef<L.LayerGroup>(L.layerGroup());

  // Keep refs in sync with props
  modeRef.current = mode;
  onModeChangeRef.current = onModeChange;

  // ------------------------------------------------------------------
  // Imperative helpers (no hooks, just functions that read refs)
  // ------------------------------------------------------------------

  function hideCursorTooltip() {
    if (cursorTooltipRef.current) {
      map.removeLayer(cursorTooltipRef.current as unknown as L.Layer);
      cursorTooltipRef.current = null;
    }
  }

  function showCursorTooltip(latlng: L.LatLng, text: string) {
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
      }).setLatLng(latlng).setContent(text).addTo(map);
    }
  }

  function clearActiveDrawing() {
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
  }

  function finishLine() {
    const pts = pointsRef.current;
    if (pts.length < 2) return;
    const line = L.polyline([...pts], MEASURE_STYLE);
    const dist = totalDistance(pts);
    line.bindTooltip(formatDistance(dist), {
      permanent: true, direction: 'center', className: 'measure-tooltip',
    });
    pts.forEach((p) => completedGroupRef.current.addLayer(L.circleMarker(p, VERTEX_STYLE)));
    completedGroupRef.current.addLayer(line);
  }

  function finishPolygon() {
    const pts = pointsRef.current;
    if (pts.length < 3) return;
    const poly = L.polygon([...pts], MEASURE_FILL);
    const coords: [number, number][] = pts.map((p) => [p.lat, p.lng]);
    const area = polygonArea(coords);
    poly.bindTooltip(formatArea(area), {
      permanent: true, direction: 'center', className: 'measure-tooltip',
    });
    pts.forEach((p) => completedGroupRef.current.addLayer(L.circleMarker(p, VERTEX_STYLE)));
    completedGroupRef.current.addLayer(poly);
  }

  function finishCircle(center: L.LatLng, edge: L.LatLng) {
    const radius = haversineDistance(center.lat, center.lng, edge.lat, edge.lng);
    const circle = L.circle(center, { ...MEASURE_FILL, radius });
    const area = Math.PI * radius * radius;
    circle.bindTooltip(`${formatArea(area)}\nr = ${formatDistance(radius)}`, {
      permanent: true, direction: 'center', className: 'measure-tooltip',
    });
    completedGroupRef.current.addLayer(L.circleMarker(center, VERTEX_STYLE));
    completedGroupRef.current.addLayer(L.circleMarker(edge, VERTEX_STYLE));
    completedGroupRef.current.addLayer(circle);
  }

  function finishCurrentMeasurement() {
    const currentMode = modeRef.current;
    if (currentMode === 'line') finishLine();
    else if (currentMode === 'polygon') finishPolygon();
    clearActiveDrawing();
    onModeChangeRef.current(null);
  }

  // ------------------------------------------------------------------
  // Single effect: attach/detach all listeners based on mode
  // Only depends on mode and map — no callback churn
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!map.hasLayer(completedGroupRef.current)) {
      completedGroupRef.current.addTo(map);
    }

    if (!mode) return;

    // Disable dblclick zoom
    map.doubleClickZoom.disable();
    map.getContainer().style.cursor = 'crosshair';

    // Ensure vertex group is on map
    if (!map.hasLayer(vertexGroupRef.current)) {
      vertexGroupRef.current.addTo(map);
    }

    // --- Click handler ---
    function onClick(e: L.LeafletMouseEvent) {
      const currentMode = modeRef.current;
      if (!currentMode) return;

      const latlng = e.latlng;

      if (currentMode === 'line' || currentMode === 'polygon') {
        pointsRef.current.push(latlng);
        vertexGroupRef.current.addLayer(L.circleMarker(latlng, VERTEX_STYLE));
      }

      if (currentMode === 'circle') {
        if (pointsRef.current.length === 0) {
          pointsRef.current.push(latlng);
          vertexGroupRef.current.addLayer(L.circleMarker(latlng, VERTEX_STYLE));
        } else {
          finishCircle(pointsRef.current[0], latlng);
          clearActiveDrawing();
          onModeChangeRef.current(null);
        }
      }
    }

    // --- Mousemove handler ---
    function onMouseMove(e: L.LeafletMouseEvent) {
      const currentMode = modeRef.current;
      if (!currentMode) return;
      const pts = pointsRef.current;
      const latlng = e.latlng;

      if (currentMode === 'line' && pts.length > 0) {
        const allPts = [...pts, latlng];
        if (previewLineRef.current) {
          previewLineRef.current.setLatLngs(allPts);
        } else {
          previewLineRef.current = L.polyline(allPts, { ...MEASURE_STYLE, opacity: 0.6 }).addTo(map);
        }
        showCursorTooltip(latlng, formatDistance(totalDistance(allPts)));
      }

      if (currentMode === 'polygon' && pts.length > 0) {
        const allPts = [...pts, latlng];
        if (previewShapeRef.current && previewShapeRef.current instanceof L.Polygon) {
          previewShapeRef.current.setLatLngs(allPts);
        } else {
          if (previewShapeRef.current) map.removeLayer(previewShapeRef.current);
          previewShapeRef.current = L.polygon(allPts, { ...MEASURE_FILL, opacity: 0.6, fillOpacity: 0.1 }).addTo(map);
        }
        if (allPts.length >= 3) {
          const coords: [number, number][] = allPts.map((p) => [p.lat, p.lng]);
          showCursorTooltip(latlng, formatArea(polygonArea(coords)));
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
          previewShapeRef.current = L.circle(center, { ...MEASURE_FILL, radius, opacity: 0.6, fillOpacity: 0.1 }).addTo(map);
        }
        const area = Math.PI * radius * radius;
        showCursorTooltip(latlng, `${formatArea(area)}\nr = ${formatDistance(radius)}`);
      }
    }

    // --- Double-click: native DOM in capture phase ---
    function onDblClick(e: Event) {
      const currentMode = modeRef.current;
      if (!currentMode || currentMode === 'circle') return;
      e.preventDefault();
      e.stopPropagation();

      // The two rapid clicks already added two extra points — remove them
      if (pointsRef.current.length > 1) pointsRef.current.pop();
      if (pointsRef.current.length > 1) pointsRef.current.pop();

      finishCurrentMeasurement();
    }

    // --- Right-click ---
    function onContextMenu(e: L.LeafletMouseEvent) {
      const currentMode = modeRef.current;
      if (!currentMode || currentMode === 'circle') return;
      L.DomEvent.stop(e);
      finishCurrentMeasurement();
    }

    // --- Keyboard ---
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && modeRef.current) {
        clearActiveDrawing();
        onModeChangeRef.current(null);
      }
      if (e.key === 'Enter' && modeRef.current) {
        finishCurrentMeasurement();
      }
    }

    // Attach
    map.on('click', onClick);
    map.on('mousemove', onMouseMove);
    map.on('contextmenu', onContextMenu);
    map.getContainer().addEventListener('dblclick', onDblClick, true);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.off('contextmenu', onContextMenu);
      map.getContainer().removeEventListener('dblclick', onDblClick, true);
      document.removeEventListener('keydown', onKeyDown);
      map.getContainer().style.cursor = '';
      map.doubleClickZoom.enable();
      clearActiveDrawing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, map]);

  // Clear completed measurements when clearSignal changes
  useEffect(() => {
    if (clearSignal === undefined) return;
    completedGroupRef.current.clearLayers();
  }, [clearSignal]);

  // Cleanup on unmount
  useEffect(() => {
    const completed = completedGroupRef.current;
    const vertices = vertexGroupRef.current;
    return () => {
      if (map.hasLayer(completed)) map.removeLayer(completed);
      if (map.hasLayer(vertices)) map.removeLayer(vertices);
    };
  }, [map]);

  return null;
}
