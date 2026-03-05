'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as esriLeaflet from 'esri-leaflet';

const ELEVATION_URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer';

/**
 * USGS 3DEP hillshade overlay for react-leaflet MapContainer.
 * Renders multidirectional hillshade to visualize terrain relief.
 */
export default function ElevationOverlay({ show }: { show: boolean }) {
  const map = useMap();
  const layerRef = useRef<ReturnType<typeof esriLeaflet.imageMapLayer> | null>(null);

  useEffect(() => {
    if (show && !layerRef.current) {
      layerRef.current = esriLeaflet.imageMapLayer({
        url: ELEVATION_URL,
        renderingRule: { rasterFunction: 'Hillshade Multidirectional' },
        opacity: 0.35,
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
