'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MeasureMode } from './MeasureTool';

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
  id: string;
  name: string;
  operation: string;
  operationId: number | null;
  acres: number;
  crop: string;
  probe: string | null;
  probeBrand: string;
  probeNumber: number;
  status: string;
  lat: number;
  lng: number;
}

interface FieldsMapProps {
  fields: FieldData[];
  visible: boolean;
  colorBy?: 'none' | 'crop' | 'status' | 'operation' | 'probeBrand';
  onClose?: () => void;
}

// Color palettes for different groupings
const CROP_COLORS: Record<string, string> = {
  corn: '#d97706',      // accent-amber
  soybeans: '#4a7a5b',  // accent-primary
  wheat: '#dc2626',     // accent-red
  default: '#60a5fa',   // blue
};

const STATUS_COLORS: Record<string, string> = {
  installed: '#4a7a5b',   // accent-primary
  assigned: '#d97706',    // accent-amber
  pending: '#d97706',     // accent-amber
  'needs-probe': '#78716c', // text-muted
  repair: '#dc2626',      // accent-red
  default: '#60a5fa',     // blue
};

// Generate distinct colors for operations
const OPERATION_COLORS = [
  '#4a7a5b', // accent-primary
  '#60a5fa', // blue
  '#d97706', // accent-amber
  '#dc2626', // accent-red
  '#a78bfa', // purple
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#818cf8', // indigo
  '#4ade80', // lime
];

const BRAND_COLORS: Record<string, string> = {
  'cropx v4': '#2563eb',                                        // blue
  'sentek 36"/cropx gateway (large diameter)': '#eab308',       // yellow
  'sentek 36"/cropx gateway (small diameter)': '#dc2626',       // red
  'sentek 36"/sentek rocket dtu': '#ffffff',                    // white
  'sentek 48" blue/sentek rocket': '#16a34a',                   // green
  default: '#78716c',                                           // muted gray
};

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

const MeasureTool = dynamic(
  () => import('./MeasureTool'),
  { ssr: false }
);

export default function FieldsMap({ fields, visible, colorBy = 'none', onClose }: FieldsMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [brightness, setBrightness] = useState(1.2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPLSS, setShowPLSS] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>(null);
  const [showMeasureMenu, setShowMeasureMenu] = useState(false);
  const [clearMeasureCounter, setClearMeasureCounter] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const measureMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Apply brightness filter to satellite tile layer only
  useEffect(() => {
    if (!mapRef.current) return;
    const firstLayer = mapRef.current.querySelector('.leaflet-tile-pane .leaflet-layer') as HTMLElement;
    if (firstLayer) {
      firstLayer.style.filter = `brightness(${brightness})`;
    }
  }, [brightness, isClient]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Close measure menu when clicking outside
  useEffect(() => {
    if (!showMeasureMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (measureMenuRef.current && !measureMenuRef.current.contains(e.target as Node)) {
        setShowMeasureMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMeasureMenu]);

  // Invalidate map size when fullscreen changes
  useEffect(() => {
    if (!mapRef.current) return;
    // Leaflet needs a resize event to recalculate
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }, [isFullscreen]);

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
      case 'probeBrand':
        return BRAND_COLORS[(field.probeBrand || '').toLowerCase()] || BRAND_COLORS.default;
      default:
        return '#60a5fa'; // default blue
    }
  };

  const useColoredMarkers = colorBy !== 'none';

  // Build legend entries from actual map data
  const legendEntries: { label: string; color: string }[] = (() => {
    if (colorBy === 'none') return [];
    const seen = new Map<string, string>();
    for (const field of mappableFields) {
      let label: string;
      let color: string;
      switch (colorBy) {
        case 'crop': {
          const crop = field.crop || 'Other';
          label = crop;
          color = CROP_COLORS[crop.toLowerCase()] || CROP_COLORS.default;
          break;
        }
        case 'status': {
          const status = field.status || 'unassigned';
          label = status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          color = STATUS_COLORS[status] || STATUS_COLORS.default;
          break;
        }
        case 'operation': {
          label = field.operation || 'Unknown';
          color = operationColorMap.get(field.operationId) || OPERATION_COLORS[0];
          break;
        }
        case 'probeBrand': {
          const brand = field.probeBrand || 'None';
          label = brand;
          color = BRAND_COLORS[brand.toLowerCase()] || BRAND_COLORS.default;
          break;
        }
        default:
          continue;
      }
      if (!seen.has(label)) seen.set(label, color);
    }
    return Array.from(seen.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, color]) => ({ label, color }));
  })();

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
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'block',
        borderRadius: 0,
        border: 'none',
      }
    : { display: visible ? 'block' : 'none', position: 'relative' };

  return (
    <div className={isFullscreen ? '' : 'fields-map'} style={fullscreenStyle} ref={mapRef}>
      {/* Top-right controls */}
      <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000, display: 'flex', gap: '6px', alignItems: 'center' }}>
        {/* Measure tool */}
        <div ref={measureMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMeasureMenu(!showMeasureMenu)}
            style={{
              ...controlStyle,
              color: measureMode ? '#facc15' : 'var(--text-secondary)',
            }}
            title="Measure distances and areas"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21l18-18M5.5 18.5l1-1M8.5 15.5l1-1M11.5 12.5l1-1M14.5 9.5l1-1M17.5 6.5l1-1" />
            </svg>
            Measure
          </button>
          {showMeasureMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: 'var(--bg-primary)',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                padding: '4px',
                zIndex: 1001,
                display: 'flex',
                flexDirection: 'column' as const,
                gap: '2px',
                minWidth: '140px',
              }}
            >
              {([
                { mode: 'line' as MeasureMode, icon: '📏', label: 'Distance' },
                { mode: 'polygon' as MeasureMode, icon: '⬡', label: 'Area (Polygon)' },
                { mode: 'circle' as MeasureMode, icon: '⊙', label: 'Area (Circle)' },
              ] as const).map((item) => (
                <button
                  key={item.mode}
                  onClick={() => {
                    if (measureMode === item.mode) {
                      setMeasureMode(null);
                    } else {
                      setMeasureMode(item.mode);
                    }
                    setShowMeasureMenu(false);
                  }}
                  style={{
                    ...controlStyle,
                    boxShadow: 'none',
                    width: '100%',
                    justifyContent: 'flex-start' as const,
                    background: measureMode === item.mode ? 'var(--bg-secondary)' : 'transparent',
                    color: measureMode === item.mode ? '#facc15' : 'var(--text-secondary)',
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--border-primary)', margin: '2px 0' }} />
              <button
                onClick={() => {
                  setClearMeasureCounter((c) => c + 1);
                  setMeasureMode(null);
                  setShowMeasureMenu(false);
                }}
                style={{
                  ...controlStyle,
                  boxShadow: 'none',
                  width: '100%',
                  justifyContent: 'flex-start' as const,
                  background: 'transparent',
                  color: 'var(--accent-red, #dc2626)',
                }}
              >
                <span>✕</span>
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* PLSS Grid toggle */}
        <label style={{ ...controlStyle, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showPLSS}
            onChange={(e) => setShowPLSS(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          PLSS Grid
        </label>

        {/* Brightness */}
        <div style={controlStyle}>
          <span>Brightness</span>
          <input
            type="range"
            min="0.8"
            max="2"
            step="0.1"
            value={brightness}
            onChange={(e) => setBrightness(parseFloat(e.target.value))}
            style={{ width: '80px', cursor: 'pointer' }}
          />
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          style={controlStyle}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
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

        {/* Close button */}
        <button
          onClick={() => {
            if (isFullscreen) {
              setIsFullscreen(false);
            } else {
              onClose?.();
            }
          }}
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
        {mappableFields.length} probes on map
      </div>

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
        <PLSSOverlay show={showPLSS} />
        <MeasureTool mode={measureMode} onModeChange={setMeasureMode} clearSignal={clearMeasureCounter} />
        {mappableFields.map((field) => {
          const popupContent = (
            <Popup>
              <div className="popup-title">{field.name} - Probe {field.probeNumber}</div>
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
                  color: color === '#ffffff' ? '#333' : '#fff',
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

      {/* Color legend */}
      {useColoredMarkers && legendEntries.length > 0 && (
        <div className="map-legend">
          <div className="map-legend-title">
            {colorBy === 'crop' ? 'Crop' : colorBy === 'status' ? 'Status' : colorBy === 'probeBrand' ? 'Probe Brand' : 'Operation'}
          </div>
          {legendEntries.map(({ label, color }) => (
            <div key={label} className="map-legend-item">
              <span className="map-legend-dot" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
