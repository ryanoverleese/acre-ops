'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
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

interface InstalledProbe {
  id: number;
  fieldName: string;
  operation: string;
  probeNumber: number;
  label: string;
  probeSerial: string;
  installer: string;
  installDate: string;
  installLat: number;
  installLng: number;
}

interface InstallsMapProps {
  probes: InstalledProbe[];
  visible: boolean;
  onClose: () => void;
}

const OPERATION_COLORS = [
  '#ff4444', '#ffcc00', '#ff69b4', '#00ccff', '#ff8c00',
  '#a78bfa', '#00ff88', '#ff6347', '#818cf8', '#40e0d0',
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
const PLSSOverlay = dynamic(
  () => import('./PLSSOverlay'),
  { ssr: false }
);

export default function InstallsMap({ probes, visible, onClose }: InstallsMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [brightness, setBrightness] = useState(1.2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPLSS, setShowPLSS] = useState(false);
  const [colorByOp, setColorByOp] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const firstLayer = mapRef.current.querySelector('.leaflet-tile-pane .leaflet-layer') as HTMLElement;
    if (firstLayer) firstLayer.style.filter = `brightness(${brightness})`;
  }, [brightness, isClient]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    if (!mapRef.current) return;
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  }, [isFullscreen]);

  if (!isClient || !visible) return null;

  const mappable = probes.filter(
    (p) => p.installLat && p.installLng && !isNaN(Number(p.installLat)) && !isNaN(Number(p.installLng))
  );

  const center: [number, number] = mappable.length > 0
    ? [
        mappable.reduce((s, p) => s + Number(p.installLat), 0) / mappable.length,
        mappable.reduce((s, p) => s + Number(p.installLng), 0) / mappable.length,
      ]
    : [41.23, -96.06];

  const operationColorMap = new Map<string, string>();
  let ci = 0;
  mappable.forEach((p) => {
    if (!operationColorMap.has(p.operation)) {
      operationColorMap.set(p.operation, OPERATION_COLORS[ci % OPERATION_COLORS.length]);
      ci++;
    }
  });

  const controlStyle: React.CSSProperties = {
    background: 'var(--bg-primary)',
    borderRadius: '6px',
    padding: '6px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    border: 'none',
  };

  const fullscreenStyle: React.CSSProperties = isFullscreen
    ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'block', borderRadius: 0, border: 'none' }
    : { display: 'block', position: 'relative', height: '400px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' };

  return (
    <div style={fullscreenStyle} ref={mapRef}>
      {/* Top-right controls */}
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, display: 'flex', gap: '6px', alignItems: 'center' }}>
        <label style={{ ...controlStyle, cursor: 'pointer' }}>
          <input type="checkbox" checked={showPLSS} onChange={(e) => setShowPLSS(e.target.checked)} style={{ cursor: 'pointer' }} />
          PLSS Grid
        </label>
        <div style={controlStyle}>
          <span>Brightness</span>
          <input type="range" min="0.8" max="2" step="0.1" value={brightness} onChange={(e) => setBrightness(parseFloat(e.target.value))} style={{ width: '80px', cursor: 'pointer' }} />
        </div>
        <button onClick={() => setIsFullscreen(!isFullscreen)} style={controlStyle} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen ? (
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
          ) : (
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
        <button
          onClick={() => { if (isFullscreen) setIsFullscreen(false); else onClose(); }}
          style={{ ...controlStyle, color: 'var(--text-primary)' }}
          title="Close map"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Probe count badge */}
      <div style={{ position: 'absolute', top: '10px', left: '60px', zIndex: 1000, ...controlStyle }}>
        {mappable.length} installed on map
      </div>

      <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} zoomControl={true}>
        <TileLayer attribution='&copy; Google' url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
        <PLSSOverlay show={showPLSS} />
        {mappable.map((probe) => {
          const dateStr = probe.installDate
            ? new Date(probe.installDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—';
          const probeLabel = probe.label ? ` (${probe.label})` : '';

          const popupContent = (
            <Popup>
              <div className="popup-title">{probe.fieldName}{probeLabel}</div>
              <div className="popup-detail">{probe.operation}</div>
              <div className="popup-detail">Probe #{probe.probeNumber}: {probe.probeSerial}</div>
              <div className="popup-detail">{probe.installer} — {dateStr}</div>
              <div className="popup-actions">
                <button
                  className="popup-btn"
                  onClick={() => {
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${probe.installLat},${probe.installLng}`,
                      '_blank'
                    );
                  }}
                >
                  Navigate
                </button>
              </div>
            </Popup>
          );

          if (colorByOp) {
            const color = operationColorMap.get(probe.operation) || OPERATION_COLORS[0];
            return (
              <CircleMarker
                key={probe.id}
                center={[Number(probe.installLat), Number(probe.installLng)]}
                radius={10}
                pathOptions={{ fillColor: color, fillOpacity: 0.8, color: '#fff', weight: 2 }}
              >
                {popupContent}
              </CircleMarker>
            );
          }

          return (
            <Marker key={probe.id} position={[Number(probe.installLat), Number(probe.installLng)]} icon={defaultIcon}>
              {popupContent}
            </Marker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      {colorByOp && operationColorMap.size > 1 && (
        <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 1000, ...controlStyle, flexDirection: 'column', alignItems: 'flex-start', gap: '4px', padding: '8px 12px' }}>
          {Array.from(operationColorMap.entries()).map(([op, color]) => (
            <div key={op} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, border: '1px solid #fff' }} />
              <span>{op}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
