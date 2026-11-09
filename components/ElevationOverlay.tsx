'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import * as esriLeaflet from 'esri-leaflet';
import type { FieldBoundaryCollection } from './useFieldBoundaries';

// Same-origin proxy — direct USGS ImageServer calls fail CORS from localhost / some clients.
const ELEVATION_URL = '/api/usgs-elevation';
const ELEVATION_PANE = 'acre-elevation';

/**
 * Terrain overlay modes for placement maps (USGS 3DEP ImageServer).
 * Streamed — no DEM stored in Acre Ops.
 *
 * - contours: existing 2ft contour lines (precision)
 * - shade: gray hillshade (edge texture)
 * - color: tinted hillshade so highs/lows read clearly (spike default candidate)
 */
export type TerrainMode = 'off' | 'contours' | 'shade' | 'color';

const TERRAIN_PRESETS: Record<Exclude<TerrainMode, 'off'>, {
  rasterFunction: string;
  opacity: number;
}> = {
  contours: {
    rasterFunction: 'Preset 2ft Contour Interval',
    opacity: 0.8,
  },
  shade: {
    rasterFunction: 'Hillshade Gray',
    opacity: 0.48,
  },
  color: {
    // Color elevation fused with soft hillshade — highs/lows + terrace edges.
    rasterFunction: 'Hillshade Elevation Tinted',
    opacity: 0.55,
  },
};

export const TERRAIN_MODE_LABELS: Record<TerrainMode, string> = {
  off: 'Off',
  contours: 'Contours (2ft)',
  shade: 'Gray shade',
  color: 'Color + shade',
};

function walkRings(coords: unknown, out: number[][][]): void {
  if (!Array.isArray(coords) || coords.length === 0) return;
  const first = coords[0];
  // Ring: [[lng,lat], ...]
  if (Array.isArray(first) && typeof first[0] === 'number') {
    out.push(coords as number[][]);
    return;
  }
  // Polygon or MultiPolygon nesting
  for (const part of coords) walkRings(part, out);
}

/** Build a CSS clip-path (layer pixel space) so terrain only paints inside boundaries. */
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
  // evenodd so polygon holes punch out of the terrain
  return `path(evenodd, "${parts.join('')}")`;
}

interface ElevationOverlayProps {
  /** Preferred API — pick a terrain look. */
  mode?: TerrainMode;
  /** Legacy checkbox — maps to contours when true. */
  show?: boolean;
  /**
   * Field boundary polygons. Terrain is clipped to these outlines.
   * With no clip geometry, terrain stays off — we only want LiDAR inside fields.
   */
  clipTo?: FieldBoundaryCollection | null;
}

/**
 * USGS 3DEP terrain overlay for react-leaflet MapContainer.
 * When `clipTo` is set, the elevation pane is clipped to those polygons.
 */
export default function ElevationOverlay({ mode, show, clipTo }: ElevationOverlayProps) {
  const map = useMap();
  const layerRef = useRef<ReturnType<typeof esriLeaflet.imageMapLayer> | null>(null);

  const resolved: TerrainMode =
    mode ?? (show ? 'contours' : 'off');

  // Ensure dedicated pane (between basemap tiles and vector overlays)
  useEffect(() => {
    if (!map.getPane(ELEVATION_PANE)) {
      const pane = map.createPane(ELEVATION_PANE);
      pane.style.zIndex = '350';
    }
  }, [map]);

  const hasClip = Boolean(clipTo?.features?.length);

  // Add / remove ImageServer layer (clip path is synced separately)
  useEffect(() => {
    const clear = () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };

    if (resolved === 'off' || !hasClip) {
      clear();
      const pane = map.getPane(ELEVATION_PANE);
      if (pane) pane.style.clipPath = '';
      return clear;
    }

    const preset = TERRAIN_PRESETS[resolved];
    clear();
    layerRef.current = esriLeaflet.imageMapLayer({
      url: ELEVATION_URL,
      renderingRule: { rasterFunction: preset.rasterFunction },
      opacity: preset.opacity,
      format: 'png32',
      pane: ELEVATION_PANE,
    });
    layerRef.current.addTo(map);

    return clear;
  }, [resolved, map, hasClip]);

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
      pane.style.clipPath = path || '';
      // Empty clip (no rings) → hide entire pane
      if (!path) pane.style.clipPath = 'inset(50%)';
    };

    apply();
    map.on('move zoom viewreset zoomanim', apply);
    return () => {
      map.off('move zoom viewreset zoomanim', apply);
    };
  }, [map, clipTo, resolved]);

  return null;
}
