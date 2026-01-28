'use client';

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
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
}

// Click handler component - must be inside MapContainer
function ClickHandler({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPickerMap({ position, onPositionChange }: LocationPickerMapProps) {
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
      <ClickHandler onPositionChange={onPositionChange} />
      {position && <Marker position={position} icon={defaultIcon} />}
    </MapContainer>
  );
}
