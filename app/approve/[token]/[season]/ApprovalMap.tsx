'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, WMSTileLayer } from 'react-leaflet';
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

interface ApprovalMapProps {
  lat: number;
  lng: number;
  fieldName: string;
}

export default function ApprovalMap({ lat, lng, fieldName }: ApprovalMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [showSoilLayer, setShowSoilLayer] = useState(false);

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

  if (!lat || !lng) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)' }}>
        <p style={{ color: 'var(--text-muted)' }}>No location set for this field</p>
      </div>
    );
  }

  const position: [number, number] = [lat, lng];

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          background: 'white',
          padding: '6px 10px',
          borderRadius: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={showSoilLayer}
            onChange={(e) => setShowSoilLayer(e.target.checked)}
          />
          Show Soil Map
        </label>
      </div>
      <MapContainer
        center={position}
        zoom={16}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution="&copy; Google"
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
        <Marker position={position} icon={defaultIcon}>
          <Popup>
            <strong>{fieldName}</strong>
            <br />
            Proposed Probe Location
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
