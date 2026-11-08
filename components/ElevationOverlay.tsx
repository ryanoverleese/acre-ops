'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as esriLeaflet from 'esri-leaflet';

// Same-origin proxy — direct USGS ImageServer calls fail CORS from localhost / some clients.
const ELEVATION_URL = '/api/usgs-elevation';

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

interface ElevationOverlayProps {
  /** Preferred API — pick a terrain look. */
  mode?: TerrainMode;
  /** Legacy checkbox — maps to contours when true. */
  show?: boolean;
}

/**
 * USGS 3DEP terrain overlay for react-leaflet MapContainer.
 */
export default function ElevationOverlay({ mode, show }: ElevationOverlayProps) {
  const map = useMap();
  const layerRef = useRef<ReturnType<typeof esriLeaflet.imageMapLayer> | null>(null);

  const resolved: TerrainMode =
    mode ?? (show ? 'contours' : 'off');

  useEffect(() => {
    const clear = () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };

    if (resolved === 'off') {
      clear();
      return clear;
    }

    const preset = TERRAIN_PRESETS[resolved];
    clear();
    layerRef.current = esriLeaflet.imageMapLayer({
      url: ELEVATION_URL,
      renderingRule: { rasterFunction: preset.rasterFunction },
      opacity: preset.opacity,
      format: 'png32',
      // Keep under pins / boundaries / soil; above basemap.
      // esri-leaflet ImageMapLayer uses pane via Leaflet options when supported.
    });
    layerRef.current.addTo(map);

    return clear;
  }, [resolved, map]);

  return null;
}
