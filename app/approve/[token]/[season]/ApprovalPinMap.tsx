'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function ClickHandler({ onPin }: { onPin: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onPin(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function FlyToHandler({ target }: { target: [number, number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target[0], target[1]], target[2], { duration: 1.5 });
  }, [map, target]);
  return null;
}

interface ApprovalPinMapProps {
  fieldName: string;
  onSave: (lat: number, lng: number) => void;
  saving?: boolean;
  initialPin?: [number, number];
}

export default function ApprovalPinMap({ fieldName, onSave, saving, initialPin }: ApprovalPinMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [pin, setPin] = useState<[number, number] | null>(initialPin ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [flyTarget, setFlyTarget] = useState<[number, number, number] | null>(
    initialPin ? [initialPin[0], initialPin[1], 14] : null
  );

  useEffect(() => { setIsClient(true); }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError('');

    // Try parsing as "lat, lon" or "lat lon"
    const coordMatch = q.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setFlyTarget([lat, lng, 15]);
        setSearching(false);
        return;
      }
    }

    // Geocode via Nominatim
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        setFlyTarget([parseFloat(data[0].lat), parseFloat(data[0].lon), 13]);
      } else {
        setSearchError('Location not found — try a different search');
      }
    } catch {
      setSearchError('Search failed');
    } finally {
      setSearching(false);
    }
  };

  if (!isClient) {
    return <div className="approval-map-loading"><div className="loading">Loading map...</div></div>;
  }

  const overlayBase: React.CSSProperties = {
    background: 'white',
    borderRadius: '6px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    fontSize: '13px',
  };

  return (
    <div style={{ height: '100%', position: 'relative' }}>

      {/* Search bar */}
      <form
        onSubmit={handleSearch}
        style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          gap: '6px',
          width: 'min(480px, 90%)',
        }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSearchError(''); }}
          placeholder="Search address, city, state, zip, or lat, lon…"
          style={{
            ...overlayBase,
            flex: 1,
            padding: '8px 12px',
            border: searchError ? '1.5px solid #dc2626' : '1px solid #e7e5e4',
            outline: 'none',
            fontSize: '13px',
          }}
        />
        <button
          type="submit"
          disabled={searching}
          style={{
            ...overlayBase,
            padding: '8px 14px',
            border: '1px solid #e7e5e4',
            cursor: searching ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            color: '#1a1815',
            whiteSpace: 'nowrap',
            opacity: searching ? 0.7 : 1,
          }}
        >
          {searching ? '…' : 'Go'}
        </button>
      </form>

      {/* Search error */}
      {searchError && (
        <div style={{
          position: 'absolute',
          top: '52px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          ...overlayBase,
          padding: '6px 14px',
          fontSize: '12px',
          color: '#dc2626',
        }}>
          {searchError}
        </div>
      )}

      {/* Pin instruction / confirm bar */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
      }}>
        {!pin ? (
          <div style={{ ...overlayBase, padding: '8px 16px', fontWeight: 500, color: '#1a1815', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            Click on the map to place a pin
          </div>
        ) : (
          <>
            <span style={{ ...overlayBase, padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
              {pin[0].toFixed(6)}, {pin[1].toFixed(6)}
            </span>
            <button
              onClick={() => setPin(null)}
              style={{ ...overlayBase, border: '1px solid #e7e5e4', padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Clear
            </button>
            <button
              onClick={() => onSave(pin[0], pin[1])}
              disabled={saving}
              style={{
                background: '#4a7a5b', color: 'white', border: 'none',
                padding: '6px 16px', borderRadius: '6px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 600,
                whiteSpace: 'nowrap', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Location'}
            </button>
          </>
        )}
      </div>

      <MapContainer
        center={[40.499, -98.952]}
        zoom={9}
        style={{ height: '100%', width: '100%', cursor: 'crosshair' }}
        scrollWheelZoom={true}
      >
        <ClickHandler onPin={(lat, lng) => setPin([lat, lng])} />
        <FlyToHandler target={flyTarget} />
        <TileLayer attribution="&copy; Google" url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
        {pin && (
          <Marker
            position={pin}
            icon={defaultIcon}
            draggable={true}
            eventHandlers={{ dragend(e) { const { lat, lng } = (e.target as L.Marker).getLatLng(); setPin([lat, lng]); } }}
          >
            <Popup>{fieldName}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
