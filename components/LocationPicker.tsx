'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  onLocationChange: (
    lat: number,
    lng: number,
    elevation?: number | null,
    soilType?: string | null,
    plss?: { township: number; range: number; section: number } | null,
  ) => void | Promise<void>;
  onClose: () => void;
  title?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
}

// Fetch elevation via our API proxy (avoids CORS issues with USGS)
async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const response = await fetch(`/api/elevation?lat=${lat}&lng=${lng}`);
    const data = await response.json();
    return data.elevation ?? null;
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

export default function LocationPicker({ lat, lng, onLocationChange, onClose, title, initialCenter, initialZoom }: LocationPickerProps) {
  const [isClient, setIsClient] = useState(false);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const hasInitialized = useRef(false);
  const [elevation, setElevation] = useState<number | null>(null);
  const [elevationLoading, setElevationLoading] = useState(false);
  const [soilType, setSoilType] = useState<string | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [plss, setPlss] = useState<{ township: number; range: number; section: number } | null>(null);
  const [plssLoading, setPlssLoading] = useState(false);
  const [showSoilLayer, setShowSoilLayer] = useState(false);
  const [showPLSS, setShowPLSS] = useState(false);
  const [showElevation, setShowElevation] = useState(false);
  const [brightness, setBrightness] = useState(1.2);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Sync lat/lng props to position state (handles late-arriving props from dynamic import)
  useEffect(() => {
    if (!hasInitialized.current && lat && lng) {
      setPosition([Number(lat), Number(lng)]);
      hasInitialized.current = true;
    }
  }, [lat, lng]);

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
      // PLSS reverse lookup
      setPlssLoading(true);
      fetch(`/api/plss/lookup?lat=${position[0]}&lng=${position[1]}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setPlss(data))
        .catch(() => setPlss(null))
        .finally(() => setPlssLoading(false));
    } else {
      setElevation(null);
      setSoilType(null);
      setPlss(null);
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

  const handleSave = async () => {
    if (position) {
      await onLocationChange(position[0], position[1], elevation, soilType, plss);
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
          <h3>{title || 'Select Location'}</h3>
          <button className="close-btn" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ padding: '0 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
            Click on the map to set the field location
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Brightness
              <input
                type="range"
                min="0.8"
                max="2"
                step="0.1"
                value={brightness}
                onChange={(e) => setBrightness(parseFloat(e.target.value))}
                style={{ width: '80px', cursor: 'pointer' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showSoilLayer}
                onChange={(e) => setShowSoilLayer(e.target.checked)}
              />
              Soil Map
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showElevation}
                onChange={(e) => setShowElevation(e.target.checked)}
              />
              Elevation
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPLSS}
                onChange={(e) => setShowPLSS(e.target.checked)}
              />
              PLSS Grid
            </label>
          </div>
        </div>
        <div className="location-picker-map">
          <LocationPickerMap
            position={position}
            onPositionChange={handlePositionChange}
            showSoilLayer={showSoilLayer}
            showPLSS={showPLSS}
            showElevation={showElevation}
            brightness={brightness}
            initialCenter={initialCenter}
            initialZoom={initialZoom}
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
              <span>
                <strong>PLSS:</strong>{' '}
                {plssLoading ? (
                  <span style={{ color: 'var(--text-muted)' }}>Loading...</span>
                ) : plss ? (
                  `T${plss.township}N R${plss.range}W Sec ${plss.section}`
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
