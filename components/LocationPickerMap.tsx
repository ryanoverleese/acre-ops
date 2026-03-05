'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, WMSTileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import PLSSOverlay from './PLSSOverlay';
import ElevationOverlay from './ElevationOverlay';

// Fix for default marker icons in Next.js
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface LocationPickerMapProps {
  position: [number, number] | null;
  onPositionChange: (lat: number, lng: number) => void;
  showSoilLayer?: boolean;
  showPLSS?: boolean;
  showElevation?: boolean;
  brightness?: number;
  initialCenter?: [number, number];
  initialZoom?: number;
}

// Component to apply brightness filter to the satellite tile layer
function BrightnessFilter({ brightness }: { brightness: number }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const tilePane = container.querySelector('.leaflet-tile-pane') as HTMLElement;
    if (tilePane) {
      // Apply filter only to the first tile layer (satellite), not overlays
      const firstLayer = tilePane.querySelector('.leaflet-layer') as HTMLElement;
      if (firstLayer) {
        firstLayer.style.filter = `brightness(${brightness})`;
      }
    }
  }, [map, brightness]);
  return null;
}

// Component to handle map clicks - must be a child of MapContainer
function MapClickHandler({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPickerMap({ position, onPositionChange, showSoilLayer = false, showPLSS = false, showElevation = false, brightness = 1.2, initialCenter, initialZoom }: LocationPickerMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading">Loading map...</div>
      </div>
    );
  }

  const center: [number, number] = position || initialCenter || [41.23, -99.5];
  const zoom = position ? 14 : initialZoom || 7;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; Google'
        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
      />
      <BrightnessFilter brightness={brightness} />
      {showSoilLayer && (
        <>
          <WMSTileLayer
            url="https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDM.wms"
            layers="mapunitpoly"
            format="image/png"
            transparent={true}
            opacity={0.6}
            attribution="USDA-NRCS SSURGO"
          />
          <WMSTileLayer
            url="https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDM.wms"
            layers="mapunitlabel"
            format="image/png"
            transparent={true}
            opacity={1}
          />
        </>
      )}
      <ElevationOverlay show={showElevation} />
      <PLSSOverlay show={showPLSS} />
      <MapClickHandler onPositionChange={onPositionChange} />
      {position && <Marker position={position} icon={defaultIcon} />}
    </MapContainer>
  );
}
