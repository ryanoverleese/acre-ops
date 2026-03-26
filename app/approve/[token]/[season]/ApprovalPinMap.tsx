'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
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
  useMapEvents({
    click(e) {
      onPin(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface ApprovalPinMapProps {
  fieldName: string;
  onSave: (lat: number, lng: number) => void;
  saving?: boolean;
}

export default function ApprovalPinMap({ fieldName, onSave, saving }: ApprovalPinMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [pin, setPin] = useState<[number, number] | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="approval-map-loading">
        <div className="loading">Loading map...</div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Instruction / action bar */}
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
          <div style={{
            background: 'white',
            padding: '8px 16px',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            fontSize: '13px',
            fontWeight: 500,
            color: '#1a1815',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            Click on the map to place a pin
          </div>
        ) : (
          <>
            <span style={{
              background: 'white',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              whiteSpace: 'nowrap',
            }}>
              {pin[0].toFixed(6)}, {pin[1].toFixed(6)}
            </span>
            <button
              onClick={() => setPin(null)}
              style={{
                background: 'white',
                border: '1px solid #e7e5e4',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                whiteSpace: 'nowrap',
              }}
            >
              Clear
            </button>
            <button
              onClick={() => onSave(pin[0], pin[1])}
              disabled={saving}
              style={{
                background: '#4a7a5b',
                color: 'white',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '4px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Location'}
            </button>
          </>
        )}
      </div>

      <MapContainer
        center={[39.5, -98.35]}
        zoom={4}
        style={{ height: '100%', width: '100%', cursor: 'crosshair' }}
        scrollWheelZoom={true}
      >
        <ClickHandler onPin={(lat, lng) => setPin([lat, lng])} />
        <TileLayer
          attribution="&copy; Google"
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        />
        {pin && (
          <Marker
            position={pin}
            icon={defaultIcon}
            draggable={true}
            eventHandlers={{
              dragend(e) {
                const { lat, lng } = (e.target as L.Marker).getLatLng();
                setPin([lat, lng]);
              },
            }}
          >
            <Popup>{fieldName}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
