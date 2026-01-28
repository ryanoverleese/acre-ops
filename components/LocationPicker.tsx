'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the map component with SSR disabled
const LocationPickerMap = dynamic(() => import('./LocationPickerMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loading">Loading map...</div>
    </div>
  ),
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

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handlePositionChange = useCallback((newLat: number, newLng: number) => {
    // Ensure we're storing plain numbers (Leaflet sometimes returns LatLng objects)
    const lat = typeof newLat === 'number' ? newLat : Number(newLat);
    const lng = typeof newLng === 'number' ? newLng : Number(newLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setPosition([lat, lng]);
    }
  }, []);

  const handleSave = () => {
    if (position) {
      onLocationChange(position[0], position[1]);
      onClose();
    }
  };

  if (!isClient) {
    return null;
  }

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
          <LocationPickerMap position={position} onPositionChange={handlePositionChange} />
        </div>
        <div className="location-picker-coords">
          {position && typeof position[0] === 'number' && typeof position[1] === 'number' ? (
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
