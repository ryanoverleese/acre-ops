'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, WMSTileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

export default function LocationPickerMap({ position, onPositionChange, showSoilLayer = false }: LocationPickerMapProps) {
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

  const center: [number, number] = position || [41.23, -99.5];

  return (
    <MapContainer
      center={center}
      zoom={position ? 14 : 7}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; Google'
        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
      />
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
      <MapClickHandler onPositionChange={onPositionChange} />
      {position && <Marker position={position} icon={defaultIcon} />}
    </MapContainer>
  );
}
