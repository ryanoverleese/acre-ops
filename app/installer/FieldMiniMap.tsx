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

function UserLocation() {
  const map = useMap();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  if (!pos) return null;
  return <Marker position={[pos.lat, pos.lng]} icon={userDot()} interactive={false} />;
}

interface Props {
  lat: number;
  lng: number;
}

export default function FieldMiniMap({ lat, lng }: Props) {
  if (!lat || !lng) return null;

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url={SAT_URL} attribution={GOOGLE_ATTR} maxZoom={20} />
      <Marker position={[lat, lng]} icon={pin()} interactive={false} />
      <UserLocation />
      <CenterOn lat={lat} lng={lng} />
    </MapContainer>
  );
}
