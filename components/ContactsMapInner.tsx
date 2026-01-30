'use client';

import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
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

interface ContactData {
  id: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  operationNames: string[];
  customerType: string;
  lat: number;
  lng: number;
}

interface ContactsMapInnerProps {
  contacts: ContactData[];
  colorBy?: 'none' | 'type' | 'operation';
  onContactClick?: (contactId: number) => void;
}

// Color palettes for different groupings
const TYPE_COLORS: Record<string, string> = {
  'Current Customer': '#34d399',    // green
  'Past Customer': '#6b7280',       // gray
  'Weather Station Only': '#fbbf24', // amber
  'Agronomist': '#a78bfa',          // purple
  default: '#60a5fa',               // blue
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

export default function ContactsMapInner({ contacts, colorBy = 'none', onContactClick }: ContactsMapInnerProps) {
  const mappableContacts = contacts.filter(
    (c) => c.lat != null && c.lng != null && !isNaN(Number(c.lat)) && !isNaN(Number(c.lng)) && c.lat !== 0 && c.lng !== 0
  );

  const center: [number, number] = mappableContacts.length > 0
    ? [
        mappableContacts.reduce((sum, c) => sum + Number(c.lat), 0) / mappableContacts.length,
        mappableContacts.reduce((sum, c) => sum + Number(c.lng), 0) / mappableContacts.length,
      ]
    : [41.23, -96.06]; // Default to Nebraska

  // Build operation name to color map
  const operationColorMap = new Map<string, string>();
  let colorIndex = 0;
  mappableContacts.forEach((contact) => {
    const opKey = contact.operationNames.join(', ') || 'No Operation';
    if (!operationColorMap.has(opKey)) {
      operationColorMap.set(opKey, OPERATION_COLORS[colorIndex % OPERATION_COLORS.length]);
      colorIndex++;
    }
  });

  // Get marker color based on colorBy mode
  const getMarkerColor = (contact: ContactData): string => {
    switch (colorBy) {
      case 'type':
        return TYPE_COLORS[contact.customerType] || TYPE_COLORS.default;
      case 'operation':
        const opKey = contact.operationNames.join(', ') || 'No Operation';
        return operationColorMap.get(opKey) || OPERATION_COLORS[0];
      default:
        return '#60a5fa'; // default blue
    }
  };

  const useColoredMarkers = colorBy !== 'none';

  return (
    <MapContainer
      center={center}
      zoom={10}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; Google'
        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
      />
      {mappableContacts.map((contact) => {
        const popupContent = (
          <Popup>
            <div className="popup-title">{contact.name}</div>
            {contact.operationNames.length > 0 && (
              <div className="popup-detail">{contact.operationNames.join(', ')}</div>
            )}
            {contact.address && (
              <div className="popup-detail" style={{ maxWidth: '200px' }}>{contact.address}</div>
            )}
            {contact.phone && (
              <div className="popup-detail">{contact.phone}</div>
            )}
            {contact.customerType && (
              <div className={`popup-status installed`}>
                {contact.customerType}
              </div>
            )}
            <div className="popup-actions">
              <button
                className="popup-btn"
                onClick={() => {
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${contact.lat},${contact.lng}`,
                    '_blank'
                  );
                }}
              >
                Navigate
              </button>
              {onContactClick && (
                <button
                  className="popup-btn"
                  onClick={() => onContactClick(contact.id)}
                >
                  Edit
                </button>
              )}
            </div>
          </Popup>
        );

        if (useColoredMarkers) {
          const color = getMarkerColor(contact);
          return (
            <CircleMarker
              key={contact.id}
              center={[Number(contact.lat), Number(contact.lng)]}
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
            key={contact.id}
            position={[Number(contact.lat), Number(contact.lng)]}
            icon={defaultIcon}
          >
            {popupContent}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
