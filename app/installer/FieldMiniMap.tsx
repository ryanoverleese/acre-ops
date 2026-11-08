'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import BoundaryLayer from '@/components/BoundaryLayer';
import ElevationOverlay, { type TerrainMode, TERRAIN_MODE_LABELS } from '@/components/ElevationOverlay';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';

const TERRAIN_OPTIONS: TerrainMode[] = ['off', 'color', 'shade', 'contours'];

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
  background: 'var(--bone-raised,#f5f1e8)', border: '1px solid var(--border-1,#e0ddd6)',
  boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: 'var(--field-green,#1F402A)',
};

interface Props {
  lat: number;
  lng: number;
  boundary?: FieldBoundaryCollection | null;
}

export default function FieldMiniMap({ lat, lng, boundary }: Props) {
  const posRef = useRef<{ lat: number; lng: number } | null>(null);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>('color');

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
        <ElevationOverlay mode={terrainMode} />
        <BoundaryLayer data={boundary} />
        <Marker position={[lat, lng]} icon={pin()} interactive={false} />
        <UserLocation posRef={posRef} />
        <RecenterListener posRef={posRef} />
        <CenterOn lat={lat} lng={lng} />
      </MapContainer>

      {/* Terrain — same 3DEP modes as Fields / LocationPicker */}
      <label
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 1000,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bone-raised,#f5f1e8)',
          border: '1px solid var(--border-1,#e0ddd6)',
          borderRadius: 10,
          padding: '6px 8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
          fontSize: 11,
          fontFamily: 'var(--font-display, system-ui)',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--field-green,#1F402A)',
        }}
      >
        Terrain
        <select
          value={terrainMode}
          onChange={(e) => setTerrainMode(e.target.value as TerrainMode)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0,
            textTransform: 'none',
            border: '1px solid var(--border-1,#e0ddd6)',
            borderRadius: 6,
            padding: '3px 6px',
            background: 'var(--bone,#F6F2EA)',
            color: 'var(--ink,#1c1917)',
            maxWidth: 130,
          }}
        >
          {TERRAIN_OPTIONS.map((mode) => (
            <option key={mode} value={mode}>{TERRAIN_MODE_LABELS[mode]}</option>
          ))}
        </select>
      </label>

      {/* Recenter — bottom-right, matches main map button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('af-recenter-field'))}
        style={{ ...btnStyle, position: 'absolute', bottom: 14, right: 14, zIndex: 1000, width: 48, height: 48 }}
        aria-label="Recenter on my location"
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
          <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
        </svg>
      </button>
    </div>
  );
}
