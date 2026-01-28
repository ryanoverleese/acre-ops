'use client';

import { useState, useEffect } from 'react';
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

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onLocationChange: (lat: number, lng: number) => void;
  onClose: () => void;
}

export default function LocationPicker({ lat, lng, onLocationChange, onClose }: LocationPickerProps) {
  const [isClient, setIsClient] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(
    lat && lng ? [lat, lng] : null
  );
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: React.ComponentType<{
      center: [number, number];
      zoom: number;
      style?: React.CSSProperties;
      children?: React.ReactNode;
    }>;
    TileLayer: React.ComponentType<{
      attribution?: string;
      url: string;
    }>;
    Marker: React.ComponentType<{
      position: [number, number];
      icon?: L.Icon;
    }>;
    useMapEvents: (handlers: L.LeafletEventHandlerFnMap) => L.Map;
  } | null>(null);

  useEffect(() => {
    setIsClient(true);
    // Dynamically import react-leaflet components
    import('react-leaflet').then((mod) => {
      setMapComponents({
        MapContainer: mod.MapContainer as unknown as typeof MapComponents extends null ? never : NonNullable<typeof MapComponents>['MapContainer'],
        TileLayer: mod.TileLayer as unknown as typeof MapComponents extends null ? never : NonNullable<typeof MapComponents>['TileLayer'],
        Marker: mod.Marker as unknown as typeof MapComponents extends null ? never : NonNullable<typeof MapComponents>['Marker'],
        useMapEvents: mod.useMapEvents,
      });
    });
  }, []);

  const handleSave = () => {
    if (position) {
      onLocationChange(position[0], position[1]);
      onClose();
    }
  };

  if (!isClient || !MapComponents) {
    return (
      <div className="location-picker-overlay">
        <div className="location-picker-modal">
          <div className="location-picker-header">
            <h3>Select Location</h3>
            <button className="close-btn" onClick={onClose}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="location-picker-map" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="loading">Loading map...</div>
          </div>
        </div>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, useMapEvents } = MapComponents;

  // Component to handle map click events
  function MapClickHandler() {
    useMapEvents({
      click: (e: L.LeafletMouseEvent) => {
        setPosition([e.latlng.lat, e.latlng.lng]);
      },
    });
    return null;
  }

  // Default center: Nebraska (central US agricultural area)
  const center: [number, number] = position || [41.23, -99.5];

  return (
    <div className="location-picker-overlay" onClick={onClose}>
      <div className="location-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="location-picker-header">
          <h3>Select Location</h3>
          <button className="close-btn" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p style={{ padding: '0 16px', color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
          Click on the map to set the field location
        </p>
        <div className="location-picker-map">
          <MapContainer
            center={center}
            zoom={position ? 14 : 7}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; Google'
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
            />
            <MapClickHandler />
            {position && (
              <Marker position={position} icon={defaultIcon} />
            )}
          </MapContainer>
        </div>
        <div className="location-picker-coords">
          {position ? (
            <span>
              <strong>Lat:</strong> {position[0].toFixed(6)} &nbsp; <strong>Lng:</strong> {position[1].toFixed(6)}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>No location selected</span>
          )}
        </div>
        <div className="location-picker-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!position}>
            Use This Location
          </button>
        </div>
      </div>
    </div>
  );
}
