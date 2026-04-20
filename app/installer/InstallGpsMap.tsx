'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Props {
  // Fall-back center when GPS hasn't returned yet (usually the field_season coords)
  fallbackLat: number;
  fallbackLng: number;
  // Captured install point — pins a green marker once user hits "Capture"
  captured: { lat: number; lng: number } | null;
  // Live user position (updates continuously). null until first fix.
  userPos: { lat: number; lng: number; acc?: number } | null;
}

// Google hybrid tiles — same source used elsewhere in Acre Ops
const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const ATTR = '&copy; Google';

// Keep map centered on the user as they walk around
function FollowUser({ pos }: { pos: { lat: number; lng: number } | null }) {
  const map = useMap();
  const didInitialZoom = useRef(false);
  useEffect(() => {
    if (!pos) return;
    if (!didInitialZoom.current) {
      map.setView([pos.lat, pos.lng], 19);
      didInitialZoom.current = true;
    } else {
      map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.5 });
    }
  }, [pos, map]);
  return null;
}

export default function InstallGpsMap({ fallbackLat, fallbackLng, captured, userPos }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!ready) return null;

  const center: [number, number] = userPos
    ? [userPos.lat, userPos.lng]
    : [fallbackLat || 41.5, fallbackLng || -99.9];

  // Live blue dot with halo + accuracy ring
  const userIcon = userPos
    ? L.divIcon({
        className: 'af-install-user-dot',
        html: `
          <div style="position:relative;width:20px;height:20px;">
            <div style="
              position:absolute;inset:-10px;border-radius:50%;
              background:rgba(47,107,176,0.22);
            "></div>
            <div style="
              width:20px;height:20px;border-radius:50%;
              background:#2F6BB0;border:3px solid #FFFFFF;
              box-shadow:0 2px 6px rgba(0,0,0,0.4);
            "></div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
    : null;

  // Green pin shown after "Capture" locks a point in
  const capturedIcon = captured
    ? L.divIcon({
        className: 'af-install-captured-pin',
        html: `
          <div style="
            width:34px;height:34px;border-radius:50%;
            background:#1F402A;color:#F6F2EA;
            border:3px solid #FFFFFF;
            box-shadow:0 3px 8px rgba(0,0,0,0.4);
            display:flex;align-items:center;justify-content:center;
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      })
    : null;

  return (
    <MapContainer
      center={center}
      zoom={19}
      maxZoom={21}
      style={{ height: 240, width: '100%' }}
      zoomControl={false}
      attributionControl={false}
      dragging
      doubleClickZoom
      scrollWheelZoom={false}
      touchZoom
    >
      <TileLayer url={SAT_URL} attribution={ATTR} maxZoom={21} />
      <FollowUser pos={userPos} />
      {userPos && userIcon && <Marker position={[userPos.lat, userPos.lng]} icon={userIcon} interactive={false} />}
      {captured && capturedIcon && <Marker position={[captured.lat, captured.lng]} icon={capturedIcon} interactive={false} />}
    </MapContainer>
  );
}
