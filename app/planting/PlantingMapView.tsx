'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PlantingRow } from './page';

export type ColorMode = 'installer' | 'days' | 'crop';

interface Props {
  rows: PlantingRow[];
  colorMode: ColorMode;
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
  if (days >= 16) return '#34c759';  // ready to install
  if (days >= 11) return '#ff9f0a';  // getting close
  if (days >= 6)  return '#ff6b35';  // too soon
  return '#ff3b30';                  // way too early
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
      { color: '#34c759', label: '16+ days — ready' },
      { color: '#ff9f0a', label: '11–15 days' },
      { color: '#ff6b35', label: '6–10 days' },
      { color: '#ff3b30', label: '0–5 days — too early' },
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

export default function PlantingMapView({ rows, colorMode }: Props) {
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

          const tooltipLines: string[] = [row.fieldName, row.operation];
          if (colorMode === 'installer') tooltipLines.push(row.plannedInstaller || 'Unassigned');
          else if (colorMode === 'days')  tooltipLines.push(ds !== null ? `${ds} days` : 'No plant date');
          else                           tooltipLines.push(row.crop || '—');

          return (
            <Marker
              key={row.fieldSeasonId}
              position={[row.lat, row.lng]}
              icon={makePin(color, false)}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <strong>{row.fieldName}</strong>
                  {tooltipLines.slice(1).map((l, i) => (
                    <div key={i} style={{ color: '#555' }}>{l}</div>
                  ))}
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        <FitBounds points={valid} />
      </MapContainer>

      <Legend colorMode={colorMode} />
    </div>
  );
}
