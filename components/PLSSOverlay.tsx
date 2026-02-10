'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as esriLeaflet from 'esri-leaflet';

const PLSS_URL = 'https://gis.blm.gov/arcgis/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer';

/**
 * PLSS grid overlay for react-leaflet MapContainer.
 * Renders BLM township (layer 1) and section (layer 2) boundaries.
 */
export default function PLSSOverlay({ show }: { show: boolean }) {
  const map = useMap();
  const layerRef = useRef<ReturnType<typeof esriLeaflet.dynamicMapLayer> | null>(null);

  useEffect(() => {
    if (show && !layerRef.current) {
      layerRef.current = esriLeaflet.dynamicMapLayer({
        url: PLSS_URL,
        layers: [1, 2],
        opacity: 0.5,
        transparent: true,
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
