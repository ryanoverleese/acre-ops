'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
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

interface FieldData {
  id: number;
  name: string;
  operation: string;
  operationId: number | null;
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
  colorBy?: 'none' | 'crop' | 'status' | 'operation';
}

// Color palettes for different groupings
const CROP_COLORS: Record<string, string> = {
  corn: '#fbbf24',      // yellow
  soybeans: '#34d399',  // green
  wheat: '#f87171',     // red
  default: '#60a5fa',   // blue
};

const STATUS_COLORS: Record<string, string> = {
  installed: '#34d399',   // green
  assigned: '#fbbf24',    // amber
  pending: '#fbbf24',     // amber
  'needs-probe': '#6b7280', // gray
  repair: '#f87171',      // red
  default: '#60a5fa',     // blue
};

// Generate distinct colors for operations
const OPERATION_COLORS = [
  '#34d399', // green
  '#60a5fa', // blue
  '#fbbf24', // amber
  '#f87171', // red
  '#a78bfa', // purple
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#818cf8', // indigo
  '#4ade80', // lime
];

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

const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
);

export default function FieldsMap({ fields, visible, colorBy = 'none' }: FieldsMapProps) {
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

  // Build operation ID to color map
  const operationColorMap = new Map<number | null, string>();
  let colorIndex = 0;
  mappableFields.forEach((field) => {
    if (!operationColorMap.has(field.operationId)) {
      operationColorMap.set(field.operationId, OPERATION_COLORS[colorIndex % OPERATION_COLORS.length]);
      colorIndex++;
    }
  });

  // Get marker color based on colorBy mode
  const getMarkerColor = (field: FieldData): string => {
    switch (colorBy) {
      case 'crop':
        return CROP_COLORS[(field.crop || '').toLowerCase()] || CROP_COLORS.default;
      case 'status':
        return STATUS_COLORS[field.status] || STATUS_COLORS.default;
      case 'operation':
        return operationColorMap.get(field.operationId) || OPERATION_COLORS[0];
      default:
        return '#60a5fa'; // default blue
    }
  };

  const useColoredMarkers = colorBy !== 'none';

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
          const popupContent = (
            <Popup>
              <div className="popup-title">{field.name}</div>
              <div className="popup-detail">
                {field.operation} • {field.acres} ac
              </div>
              <div className="popup-detail">
                {field.crop} {field.probe ? `• ${field.probe}` : ''}
              </div>
              <div className={`popup-status ${field.status || 'unassigned'}`}>
                {(field.status || 'unassigned').replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
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
          );

          if (useColoredMarkers) {
            const color = getMarkerColor(field);
            return (
              <CircleMarker
                key={field.id}
                center={[Number(field.lat), Number(field.lng)]}
                radius={10}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.8,
                  color: '#fff',
                  weight: 2,
                }}
              >
                {popupContent}
              </CircleMarker>
            );
          }

          return (
            <Marker
              key={field.id}
              position={[Number(field.lat), Number(field.lng)]}
              icon={defaultIcon}
            >
              {popupContent}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
