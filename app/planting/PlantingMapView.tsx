'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Popup } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PlantingRow } from './page';

export type ColorMode = 'installer' | 'days' | 'crop';

interface Props {
  rows: PlantingRow[];
  colorMode: ColorMode;
  showLabels?: boolean;
  onAssignInstaller?: (fieldSeasonId: number, installer: string) => void;
}

const STREET_URL = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';

// ── Color helpers ──────────────────────────────────────────────────────────────

const INSTALLER_COLORS: Record<string, string> = {
  ryan:   '#0071e3',
  brian:  '#34c759',
  daine:  '#af52de',
  daine1: '#af52de', // handle minor spelling variants
};

function installerColor(name: string): string {
  if (!name) return '#c7c7cc';
  return INSTALLER_COLORS[name.toLowerCase()] ?? '#ff9f0a';
}

function daysColor(days: number | null): string {
  if (days === null) return '#c7c7cc';
  if (days > 26)  return '#2F6BB0';  // getting late — blue
  if (days >= 16) return '#34c759';  // ideal — green
  return '#ff3b30';                  // too early — red
}

function cropColor(crop: string): string {
  const c = crop.toLowerCase();
  if (c.includes('corn')) return '#ffd60a';
  if (c.includes('soy'))  return '#34c759';
  return '#c7c7cc';
}

function daysSince(dateStr: string): number | null {
  if (!dateStr) return null;
  const planted = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - planted.getTime()) / 86400000));
}

function makePin(color: string, selected: boolean) {
  const size = selected ? 18 : 14;
  const border = selected ? '3px solid #1d1d1f' : '2px solid rgba(0,0,0,0.3)';
  const html = `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${color};border:${border};
    box-shadow:0 2px 6px rgba(0,0,0,0.35);
  "></div>`;
  return L.divIcon({
    className: 'af-planting-pin',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ── FitBounds ──────────────────────────────────────────────────────────────────

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    const valid = points.filter(p => p.lat && p.lng);
    if (!valid.length) return;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 13);
    } else {
      map.fitBounds(L.latLngBounds(valid.map(p => [p.lat, p.lng] as [number, number])), { padding: [40, 40] });
    }
    didFit.current = true;
  }, [map, points]);
  return null;
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({ colorMode }: { colorMode: ColorMode }) {
  const items: { color: string; label: string }[] =
    colorMode === 'installer' ? [
      { color: '#0071e3', label: 'Ryan' },
      { color: '#34c759', label: 'Brian' },
      { color: '#af52de', label: 'Daine' },
      { color: '#c7c7cc', label: 'Unassigned' },
    ] :
    colorMode === 'days' ? [
      { color: '#2F6BB0', label: '26+ days — getting late' },
      { color: '#34c759', label: '16–26 days — ideal' },
      { color: '#ff3b30', label: '0–15 days — too early' },
    ] : [
      { color: '#ffd60a', label: 'Corn' },
      { color: '#34c759', label: 'Soybean' },
      { color: '#c7c7cc', label: 'Other' },
    ];

  return (
    <div style={{
      position: 'absolute', bottom: 24, left: 12, zIndex: 1000,
      background: 'rgba(255,255,255,0.93)', borderRadius: 8,
      padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      fontSize: 12, display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '1.5px solid rgba(0,0,0,0.2)', flexShrink: 0 }} />
          <span style={{ color: '#1d1d1f' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PlantingMapView({ rows, colorMode, showLabels = false, onAssignInstaller }: Props) {
  const valid = useMemo(() => rows.filter(r => r.lat && r.lng), [rows]);
  const center: [number, number] = valid[0] ? [valid[0].lat, valid[0].lng] : [41.5, -99.9];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={center}
        zoom={11}
        style={{ position: 'absolute', inset: 0, background: '#dde5d0' }}
        zoomControl
        attributionControl
      >
        <TileLayer url={SAT_URL} attribution={GOOGLE_ATTR} maxZoom={20} />

        {valid.map(row => {
          const ds = row.plantingDate ? daysSince(row.plantingDate) : null;
          const color =
            colorMode === 'installer' ? installerColor(row.plannedInstaller) :
            colorMode === 'days'      ? daysColor(ds) :
                                        cropColor(row.crop);

          const installerInitial = row.plannedInstaller ? row.plannedInstaller.charAt(0).toUpperCase() : null;
          return (
            <Marker
              key={`${row.fieldSeasonId}-${showLabels}`}
              position={[row.lat, row.lng]}
              icon={makePin(color, false)}
            >
              <Tooltip
                permanent={showLabels}
                direction="top"
                offset={[0, -10]}
                className={showLabels ? 'af-map-label' : undefined}
              >
                <div style={{ fontSize: 11, lineHeight: 1.4, textAlign: 'center' }}>
                  <strong style={{ display: 'block' }}>{row.fieldName}</strong>
                  <span style={{ opacity: 0.7 }}>{row.operation}</span>
                  {row.aiUfid && (
                    <span style={{ display: 'block', opacity: 0.55, fontSize: '0.9em', fontFamily: 'monospace' }}>{row.aiUfid}</span>
                  )}
                </div>
              </Tooltip>
              {onAssignInstaller && (
                <Popup closeButton={false} offset={[0, -8]}>
                  <div style={{ fontSize: 13, minWidth: 130 }}>
                    <div style={{ fontWeight: 700, marginBottom: 10, lineHeight: 1.3 }}>{row.fieldName}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {[['Brian', 'B', '#34c759'], ['Ryan', 'R', '#0071e3']] .map(([name, initial, bg]) => (
                        <button
                          key={name}
                          onClick={() => onAssignInstaller(row.fieldSeasonId, row.plannedInstaller === name ? '' : name)}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', border: 'none',
                            fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            background: row.plannedInstaller === name ? bg : '#e5e5ea',
                            color: row.plannedInstaller === name ? '#fff' : '#1d1d1f',
                            flexShrink: 0,
                          }}
                        >
                          {initial}
                        </button>
                      ))}
                      {installerInitial && (
                        <span style={{ fontSize: 11, color: '#86868b', marginLeft: 2 }}>
                          {row.plannedInstaller}
                        </span>
                      )}
                    </div>
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}

        <FitBounds points={valid} />
      </MapContainer>

      <Legend colorMode={colorMode} />
    </div>
  );
}
