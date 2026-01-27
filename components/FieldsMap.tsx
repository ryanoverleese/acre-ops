'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

interface FieldData {
  id: number;
  name: string;
  operation: string;
  acres: number;
  crop: string;
  probe: string | null;
  status: string;
  lat: number;
  lng: number;
}

interface FieldsMapProps {
  fields: FieldData[];
  visible: boolean;
}

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);

const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);

const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);

export default function FieldsMap({ fields, visible }: FieldsMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || !visible) {
    return null;
  }

  const mappableFields = fields.filter(
    (f) => f.lat != null && f.lng != null && !isNaN(Number(f.lat)) && !isNaN(Number(f.lng)) && f.lat !== 0 && f.lng !== 0
  );

  const center: [number, number] = mappableFields.length > 0
    ? [
        mappableFields.reduce((sum, f) => sum + Number(f.lat), 0) / mappableFields.length,
        mappableFields.reduce((sum, f) => sum + Number(f.lng), 0) / mappableFields.length,
      ]
    : [41.23, -96.06];

  const statusColors: Record<string, string> = {
    installed: '#34d399',
    pending: '#fbbf24',
    repair: '#f87171',
    'needs-probe': '#5c6b7a',
  };

  return (
    <div className="fields-map" style={{ display: visible ? 'block' : 'none' }}>
      <MapContainer
        center={center}
        zoom={11}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; Google'
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        />
        {mappableFields.map((field) => {
          const color = statusColors[field.status] || '#5c6b7a';
          return (
            <Marker
              key={field.id}
              position={[Number(field.lat), Number(field.lng)]}
            >
              <Popup>
                <div className="popup-title">{field.name}</div>
                <div className="popup-detail">
                  {field.operation} • {field.acres} ac
                </div>
                <div className="popup-detail">
                  {field.crop} {field.probe ? `• ${field.probe}` : ''}
                </div>
                <div className={`popup-status ${field.status}`}>
                  {field.status.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                </div>
                <div className="popup-actions">
                  <button
                    className="popup-btn"
                    onClick={() => {
                      window.open(
                        `https://www.google.com/maps/dir/?api=1&destination=${field.lat},${field.lng}`,
                        '_blank'
                      );
                    }}
                  >
                    Navigate
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
