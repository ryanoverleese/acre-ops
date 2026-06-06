'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  routeOrder: string;
  status: string;
  fieldName: string;
  operation: string;
  probeSerial?: string;
  antennaType?: string;
  placementNotes?: string;
  probeRack?: string;
  probeRackSlot?: number | null;
}

export interface RepairMapPoint {
  id: number;
  lat: number;
  lng: number;
  fieldName: string;
  problem: string;
}

type Layer = 'street' | 'satellite';

interface Props {
  points: MapPoint[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  layer: Layer;
  repairPoints?: RepairMapPoint[];
}

// Build a numbered "pin" as an inline SVG divIcon.
// When routeOrder is unknown, fall back to a smaller plain dot pin (no '?').
function makePin(label: string, installed: boolean, selected: boolean, hasNote = false) {
  const hasOrder = label && label !== '?';
  const bg = installed ? '#C8CDD5' : selected ? '#1F402A' : '#FFFFFF';
  const fg = installed ? '#6B7280' : selected ? '#F6F2EA' : '#0A0A0A';
  const stroke = installed ? '#9CA3AF' : selected ? '#1F402A' : '#0A0A0A';

  // Plain dot pin (for stops without a route order)
  if (!hasOrder && !installed) {
    const html = `
      <div style="
        width:20px;height:20px;border-radius:50%;
        background:${bg};border:2px solid ${stroke};
        box-shadow:0 3px 8px rgba(0,0,0,0.25);
        position:relative;transform:translateY(-2px);
      ">
        ${hasNote ? `<div style="
          position:absolute;top:-4px;right:-4px;
          width:13px;height:13px;border-radius:50%;
          background:#ef4444;border:2px solid #fff;
        "></div>` : ''}
      </div>
    `;
    return L.divIcon({
      className: 'af-leaflet-pin',
      html,
      iconSize: [20, 22],
      iconAnchor: [10, 22],
    });
  }

  const content = installed
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : label;

  const html = `
    <div style="
      min-width:36px;height:36px;padding:0 8px;border-radius:18px;
      background:${bg};color:${fg};border:2px solid ${stroke};
      display:flex;align-items:center;justify-content:center;
      font-family:'Barlow Condensed',system-ui,sans-serif;font-weight:700;font-size:14px;
      box-shadow:0 4px 10px rgba(0,0,0,0.25);
      position:relative;transform:translateY(-2px);
    ">
      ${content}
      <div style="
        position:absolute;bottom:-7px;left:50%;
        transform:translateX(-50%) rotate(45deg);
        width:10px;height:10px;background:${bg};
        border-right:2px solid ${stroke};border-bottom:2px solid ${stroke};
      "></div>
      ${hasNote ? `<div style="
        position:absolute;top:-5px;right:-5px;
        width:13px;height:13px;border-radius:50%;
        background:#ef4444;border:2px solid #fff;
      "></div>` : ''}
    </div>
  `;

  return L.divIcon({
    className: 'af-leaflet-pin',
    html,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
  });
}

// Tile URL templates — using the same Google tile servers as the rest of
// the Acre Insights app (see InstallsMap.tsx, WeatherStationsMap.tsx).
// lyrs=m = roadmap (streets), lyrs=y = hybrid (satellite + labels)
const STREET_URL = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';

// Toggle a CSS class on the map container based on zoom so labels can
// hide themselves when zoomed out too far to space them out.
function ZoomLabelGate({ threshold = 12 }: { threshold?: number }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const container = map.getContainer();
      if (map.getZoom() < threshold) container.classList.add('af-hide-labels');
      else container.classList.remove('af-hide-labels');
    };
    update();
    map.on('zoomend', update);
    return () => { map.off('zoomend', update); };
  }, [map, threshold]);
  return null;
}

// Fit bounds to all points once on mount, or re-fit when points change.
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    const valid = points.filter(p => p.lat && p.lng);
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 13);
    } else {
      const bounds = L.latLngBounds(valid.map(p => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
    didFit.current = true;
  }, [map, points]);
  return null;
}

// Live user location — blue dot that updates as watchPosition fires.
function UserLocation() {
  const map = useMap();
  const [pos, setPos] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const hasCentered = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      },
      () => { /* silently ignore; user may have denied */ },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Re-center map once we first get a fix, but not if user has panned
  useEffect(() => {
    if (pos && !hasCentered.current) {
      // Only auto-recenter if no other fit has happened and bounds don't contain us
      const current = map.getBounds();
      if (!current.contains([pos.lat, pos.lng])) {
        // pan gently without zooming out
        map.panTo([pos.lat, pos.lng], { animate: true });
      }
      hasCentered.current = true;
    }
  }, [pos, map]);

  if (!pos) return null;

  const icon = L.divIcon({
    className: 'af-leaflet-user-dot',
    html: `
      <div style="position:relative;width:20px;height:20px;">
        <div style="
          position:absolute;inset:-8px;border-radius:50%;
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
  });

  return <Marker position={[pos.lat, pos.lng]} icon={icon} interactive={false} />;
}

// Control from outside: "recenter on me" button emits a window event.
function RecenterListener({ getUserPos }: { getUserPos: () => { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const p = getUserPos();
      if (p) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 14));
    };
    window.addEventListener('af-recenter-me', handler);
    return () => window.removeEventListener('af-recenter-me', handler);
  }, [map, getUserPos]);
  return null;
}

function makeRepairPin() {
  const html = `
    <div style="
      width:36px;height:36px;border-radius:50%;
      background:#ef4444;border:3px solid #fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 12px rgba(239,68,68,0.5);
    ">
      <svg width="16" height="16" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    className: 'af-leaflet-repair-pin',
    html,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

export default function InstallerMapView({ points, selectedId, onSelect, layer, repairPoints }: Props) {
  const valid = useMemo(() => points.filter(p => p.lat && p.lng), [points]);

  // Expose current user location through a ref so the recenter listener can read it
  const userPosRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => { userPosRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; },
      undefined,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Default center: first point or Nebraska center as a fallback
  const center: [number, number] = valid[0] ? [valid[0].lat, valid[0].lng] : [41.5, -99.9];

  return (
    <MapContainer
      center={center}
      zoom={11}
      style={{ position: 'absolute', inset: 0, background: '#dde5d0' }}
      zoomControl={false}
      attributionControl
    >
      <TileLayer
        url={layer === 'satellite' ? SAT_URL : STREET_URL}
        attribution={GOOGLE_ATTR}
        maxZoom={20}
      />

      {/* Stop pins */}
      {valid.map(p => {
        const installed = p.status.toLowerCase() === 'installed';
        const selected = selectedId === p.id;
        const label = p.routeOrder || '?';
        const hasOrder = !!p.routeOrder;
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={makePin(label, installed, selected, !!p.placementNotes)}
            eventHandlers={{ click: () => onSelect(p.id) }}
          >
            <Tooltip
              permanent
              direction="bottom"
              offset={[0, -2]}
              className={`af-map-label${selected ? ' is-selected' : ''}${installed ? ' is-installed' : ''}`}
            >
              {hasOrder && (
                <span style={{
                  display: 'inline-block',
                  marginRight: 6,
                  paddingRight: 6,
                  borderRight: '1px solid',
                  borderColor: 'currentColor',
                  opacity: 1,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'inherit',
                }}>
                  <span style={{ opacity: 0.55, marginRight: 3, fontSize: '0.85em' }}>#</span>
                  {p.routeOrder}
                </span>
              )}
              {p.fieldName}
              {p.probeSerial && (
                <span style={{ display: 'block', opacity: 0.7, fontSize: '1em', marginTop: 1 }}>
                  #{p.probeSerial}
                </span>
              )}
              {p.antennaType && (
                <span style={{ display: 'block', opacity: 0.55, fontSize: '0.85em', marginTop: 1 }}>
                  {p.antennaType}
                </span>
              )}
              {p.probeRack && (
                <span style={{ display: 'block', opacity: 0.7, fontSize: '0.85em', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                  R{p.probeRack}{p.probeRackSlot != null ? `·${p.probeRackSlot}` : ''}
                </span>
              )}
            </Tooltip>
          </Marker>
        );
      })}

      {/* Repair pins */}
      {(repairPoints ?? []).filter(r => r.lat && r.lng).map(r => (
        <Marker
          key={`repair-${r.id}`}
          position={[r.lat, r.lng]}
          icon={makeRepairPin()}
          interactive={false}
        >
          <Tooltip
            permanent={false}
            direction="top"
            offset={[0, -10]}
          >
            <div style={{ fontSize: 11, lineHeight: 1.4, textAlign: 'center' }}>
              <strong style={{ display: 'block', color: '#ef4444' }}>⚠ Repair</strong>
              <span style={{ display: 'block' }}>{r.fieldName}</span>
              {r.problem && <span style={{ display: 'block', opacity: 0.7 }}>{r.problem.slice(0, 40)}{r.problem.length > 40 ? '…' : ''}</span>}
            </div>
          </Tooltip>
        </Marker>
      ))}

      <UserLocation />
      <FitBounds points={valid} />
      <RecenterListener getUserPos={() => userPosRef.current} />
      <ZoomLabelGate threshold={8} />
    </MapContainer>
  );
}
