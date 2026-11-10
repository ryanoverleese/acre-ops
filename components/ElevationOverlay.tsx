'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import * as esriLeaflet from 'esri-leaflet';
import type { FieldBoundaryCollection } from './useFieldBoundaries';
import { createElevGridLayer, type ElevRenderMode } from '@/lib/terrain/elev-grid';
import {
  DEFAULT_TERRAIN_MODE,
  TERRAIN_MODE_LABELS,
  TERRAIN_OPTIONS,
  type TerrainMode,
} from '@/lib/terrain/modes';
import { elevationCssGradient } from '@/lib/terrain/ramp';

export type { TerrainMode };
export { DEFAULT_TERRAIN_MODE, TERRAIN_MODE_LABELS, TERRAIN_OPTIONS };

const ELEVATION_URL = '/api/usgs-elevation';
const ELEVATION_PANE = 'acre-elevation';

/**
 * Terrain modes — color ramps match CutSheetRX (blue low → red high).
 * DEM is fetched as LERC and colored in-browser for color / colorshade / shade.
 * Contours stay on the USGS ImageServer preset.
 */

export const TERRAIN_RAMP_CSS = elevationCssGradient();

const MODE_OPACITY: Record<Exclude<TerrainMode, 'off'>, number> = {
  // High opacity + normal blend — multiply+clip-path vanishes on iOS Safari
  colorshade: 0.9,
  color: 0.88,
  // Solid hillshade — no see-through satellite under gray relief
  shade: 1,
  contours: 0.8,
};


function walkRings(coords: unknown, out: number[][][]): void {
  if (!Array.isArray(coords) || coords.length === 0) return;
  const first = coords[0];
  if (Array.isArray(first) && typeof first[0] === 'number') {
    out.push(coords as number[][]);
    return;
  }
  for (const part of coords) walkRings(part, out);
}

/** CSS clip-path so terrain only paints inside field boundaries. */
function clipPathForBoundaries(map: L.Map, data: FieldBoundaryCollection | null | undefined): string | null {
  if (!data?.features?.length) return null;
  const rings: number[][][] = [];
  for (const feature of data.features) {
    walkRings(feature.geometry?.coordinates, rings);
  }
  if (!rings.length) return null;

  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const pts = ring.map(([lng, lat]) => {
      const p = map.latLngToLayerPoint(L.latLng(lat, lng));
      return `${Math.round(p.x)} ${Math.round(p.y)}`;
    });
    parts.push(`M${pts[0]}L${pts.slice(1).join('L')}Z`);
  }
  if (!parts.length) return null;
  return `path(evenodd, "${parts.join('')}")`;
}

interface ElevationOverlayProps {
  mode?: TerrainMode;
  /** Legacy checkbox — maps to contours when true. */
  show?: boolean;
  /**
   * Field boundary polygons. Terrain is clipped to these outlines.
   * With no clip geometry, terrain stays off — we only want LiDAR inside fields.
   */
  clipTo?: FieldBoundaryCollection | null;
}

type ElevLayer = ReturnType<typeof createElevGridLayer>;
type ContourLayer = ReturnType<typeof esriLeaflet.imageMapLayer>;

/**
 * USGS 3DEP terrain overlay for react-leaflet MapContainer.
 * Color modes use CutSheetRX's blue→red ramp on client-decoded DEM tiles.
 */
export default function ElevationOverlay({ mode, show, clipTo }: ElevationOverlayProps) {
  const map = useMap();
  const elevRef = useRef<ElevLayer | null>(null);
  const contourRef = useRef<ContourLayer | null>(null);
  const rangeRef = useRef({ lo: Infinity, hi: -Infinity });
  const rangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolved: TerrainMode =
    mode ?? (show ? 'contours' : 'off');

  useEffect(() => {
    if (!map.getPane(ELEVATION_PANE)) {
      const pane = map.createPane(ELEVATION_PANE);
      pane.style.zIndex = '350';
    }
  }, [map]);

  // Keep blend normal — multiply + clip-path blanked Color + shade on iOS Safari
  useEffect(() => {
    const pane = map.getPane(ELEVATION_PANE);
    if (!pane) return;
    pane.style.mixBlendMode = 'normal';
  }, [map, resolved]);

  const hasClip = Boolean(clipTo?.features?.length);

  // DEM / contour layers
  useEffect(() => {
    const clearElev = () => {
      if (elevRef.current) {
        map.removeLayer(elevRef.current);
        elevRef.current = null;
      }
    };
    const clearContour = () => {
      if (contourRef.current) {
        map.removeLayer(contourRef.current);
        contourRef.current = null;
      }
    };

    if (resolved === 'off' || !hasClip) {
      clearElev();
      clearContour();
      const pane = map.getPane(ELEVATION_PANE);
      if (pane) pane.style.clipPath = '';
      return () => { clearElev(); clearContour(); };
    }

    if (resolved === 'contours') {
      clearElev();
      clearContour();
      contourRef.current = esriLeaflet.imageMapLayer({
        url: ELEVATION_URL,
        renderingRule: { rasterFunction: 'Preset 2ft Contour Interval' },
        opacity: MODE_OPACITY.contours,
        format: 'png32',
        pane: ELEVATION_PANE,
      });
      contourRef.current.addTo(map);
      return () => { clearContour(); };
    }

    // Client-colored DEM (CutSheetRX ramp) — one image for the view, not a
    // Leaflet tile grid. Tiled DEM made Color + shade split at tile edges.
    clearContour();
    const elevMode = resolved as ElevRenderMode;
    if (!elevRef.current) {
      rangeRef.current = { lo: Infinity, hi: -Infinity };
      elevRef.current = createElevGridLayer({
        mode: elevMode,
        opacity: MODE_OPACITY[elevMode],
        pane: ELEVATION_PANE,
        range: { lo: Infinity, hi: -Infinity },
        onRangeSample: (lo, hi) => {
          const cur = rangeRef.current;
          let changed = false;
          if (lo < cur.lo) { cur.lo = lo; changed = true; }
          if (hi > cur.hi) { cur.hi = hi; changed = true; }
          if (!changed || !(cur.hi > cur.lo)) return;
          if (rangeTimer.current) clearTimeout(rangeTimer.current);
          rangeTimer.current = setTimeout(() => {
            const span = Math.max(cur.hi - cur.lo, 0.5);
            elevRef.current?.setElevRange({ lo: cur.lo, hi: cur.lo + span });
          }, 40);
        },
      });
      elevRef.current.addTo(map);
    } else {
      elevRef.current.setElevMode(elevMode);
      elevRef.current.setOpacity(MODE_OPACITY[elevMode]);
    }

    return () => {
      if (rangeTimer.current) clearTimeout(rangeTimer.current);
      // Keep layer across mode switches between color/shade; full unmount clears below
    };
  }, [resolved, map, hasClip]);

  // Tear down elev grid when leaving color modes or unmounting
  useEffect(() => {
    return () => {
      if (elevRef.current) {
        map.removeLayer(elevRef.current);
        elevRef.current = null;
      }
      if (contourRef.current) {
        map.removeLayer(contourRef.current);
        contourRef.current = null;
      }
    };
  }, [map]);

  // Keep SVG clip aligned with boundaries as the map moves / zooms
  useEffect(() => {
    const pane = map.getPane(ELEVATION_PANE);
    if (!pane) return;

    const apply = () => {
      if (resolved === 'off') {
        pane.style.clipPath = '';
        return;
      }
      const path = clipPathForBoundaries(map, clipTo);
      pane.style.clipPath = path || 'inset(50%)';
    };

    apply();
    map.on('move zoom viewreset zoomanim', apply);
    return () => {
      map.off('move zoom viewreset zoomanim', apply);
    };
  }, [map, clipTo, resolved]);

  return null;
}
