'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';

function pin() {
  return L.divIcon({
    className: 'af-leaflet-pin',
    html: `
      <div style="
        width:36px;height:36px;border-radius:50%;
        background:var(--field-green,#1F402A);
        border:3px solid #fff;
        box-shadow:0 3px 10px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
      ">
        <svg width="16" height="16" fill="none" stroke="#fff" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function userDot() {
  return L.divIcon({
    className: 'af-leaflet-user-dot',
    html: `
      <div style="position:relative;width:20px;height:20px;">
        <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(47,107,176,0.22);"></div>
        <div style="width:20px;height:20px;border-radius:50%;background:#2F6BB0;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function CenterOn({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 15);
  }, [map, lat, lng]);
  return null;
}

function UserLocation({ posRef }: { posRef: React.MutableRefObject<{ lat: number; lng: number } | null> }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        posRef.current = next;
        setPos(next);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [posRef]);

  if (!pos) return null;
  return <Marker position={[pos.lat, pos.lng]} icon={userDot()} interactive={false} />;
}

function RecenterListener({ posRef }: { posRef: React.MutableRefObject<{ lat: number; lng: number } | null> }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const p = posRef.current;
      if (p) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
    };
    window.addEventListener('af-recenter-field', handler);
    return () => window.removeEventListener('af-recenter-field', handler);
  }, [map, posRef]);
  return null;
}

const btnStyle: React.CSSProperties = {
  width: 40, height: 40, borderRadius: '50%',
  background: '#fff', border: 'none',
  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
};

interface Props {
  lat: number;
  lng: number;
  expanded: boolean;
  onToggleExpand: () => void;
}

export default function FieldMiniMap({ lat, lng, expanded, onToggleExpand }: Props) {
  const posRef = useRef<{ lat: number; lng: number } | null>(null);

  if (!lat || !lng) return null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={SAT_URL} attribution={GOOGLE_ATTR} maxZoom={20} />
        <Marker position={[lat, lng]} icon={pin()} interactive={false} />
        <UserLocation posRef={posRef} />
        <RecenterListener posRef={posRef} />
        <CenterOn lat={lat} lng={lng} />
      </MapContainer>

      {/* Expand/collapse — bottom-left */}
      <button
        onClick={onToggleExpand}
        style={{ ...btnStyle, position: 'absolute', bottom: 12, left: 12, zIndex: 1000 }}
        title={expanded ? 'Collapse map' : 'Expand map'}
      >
        {expanded ? (
          <svg width="18" height="18" fill="none" stroke="#1F402A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
            <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
          </svg>
        ) : (
          <svg width="18" height="18" fill="none" stroke="#1F402A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
      </button>

      {/* Recenter — bottom-right */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('af-recenter-field'))}
        style={{ ...btnStyle, position: 'absolute', bottom: 12, right: 12, zIndex: 1000 }}
        title="Center on my location"
      >
        <svg width="20" height="20" fill="none" stroke="#1F402A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>
    </div>
  );
}
