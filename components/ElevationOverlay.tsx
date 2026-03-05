'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as esriLeaflet from 'esri-leaflet';

const ELEVATION_URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer';

/**
 * USGS 3DEP contour overlay for react-leaflet MapContainer.
 * Renders 2ft contour lines to visualize terrain.
 */
export default function ElevationOverlay({ show }: { show: boolean }) {
  const map = useMap();
  const layerRef = useRef<ReturnType<typeof esriLeaflet.imageMapLayer> | null>(null);

  useEffect(() => {
    if (show && !layerRef.current) {
      layerRef.current = esriLeaflet.imageMapLayer({
        url: ELEVATION_URL,
        renderingRule: { rasterFunction: 'Preset 2ft Contour Interval' },
        opacity: 0.8,
        format: 'png32',
      });
      layerRef.current.addTo(map);
    } else if (!show && layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [show, map]);

  return null;
}
