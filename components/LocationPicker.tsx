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

// Fetch elevation from USGS National Map API
async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const response = await fetch(
      `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&units=Feet&wkid=4326`
    );
    const data = await response.json();
    if (data && data.value !== undefined && data.value !== -1000000) {
      return Math.round(data.value);
    }
    return null;
  } catch (error) {
    console.error('Error fetching elevation:', error);
    return null;
  }
}

// Fetch soil type via our API proxy (avoids CORS issues with USDA)
async function fetchSoilType(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(`/api/soil?lat=${lat}&lng=${lng}`);
    const data = await response.json();
    if (data.muname && data.musym) {
      return `${data.muname} (${data.musym})`;
    }
    return null;
  } catch (error) {
    console.error('Error fetching soil type:', error);
    return null;
  }
}

export default function LocationPicker({ lat, lng, onLocationChange, onClose }: LocationPickerProps) {
  const [isClient, setIsClient] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(
    lat && lng ? [lat, lng] : null
  );
  const [elevation, setElevation] = useState<number | null>(null);
  const [elevationLoading, setElevationLoading] = useState(false);
  const [soilType, setSoilType] = useState<string | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [showSoilLayer, setShowSoilLayer] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch elevation and soil type when position changes
  useEffect(() => {
    if (position) {
      setElevationLoading(true);
      setSoilLoading(true);
      fetchElevation(position[0], position[1]).then((elev) => {
        setElevation(elev);
        setElevationLoading(false);
      });
      fetchSoilType(position[0], position[1]).then((soil) => {
        setSoilType(soil);
        setSoilLoading(false);
      });
    } else {
      setElevation(null);
      setSoilType(null);
    }
  }, [position]);

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
        <div style={{ padding: '0 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Click on the map to set the field location
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showSoilLayer}
              onChange={(e) => setShowSoilLayer(e.target.checked)}
            />
            Show SSURGO Soil Map
          </label>
        </div>
        <div className="location-picker-map">
          <LocationPickerMap
            position={position}
            onPositionChange={handlePositionChange}
            showSoilLayer={showSoilLayer}
          />
        </div>
        <div className="location-picker-coords">
          {position && typeof position[0] === 'number' && typeof position[1] === 'number' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span>
                <strong>Lat:</strong> {position[0].toFixed(6)} &nbsp; <strong>Lng:</strong> {position[1].toFixed(6)}
              </span>
              <span>
                <strong>Elevation:</strong>{' '}
                {elevationLoading ? (
                  <span style={{ color: 'var(--text-muted)' }}>Loading...</span>
                ) : elevation !== null ? (
                  `${elevation} ft`
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                )}
              </span>
              <span>
                <strong>Soil:</strong>{' '}
                {soilLoading ? (
                  <span style={{ color: 'var(--text-muted)' }}>Loading...</span>
                ) : soilType ? (
                  soilType
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                )}
              </span>
            </div>
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
