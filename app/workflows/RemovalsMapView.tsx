'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EarlyRemovalData } from './WorkflowsClient';

interface Props {
  rows: EarlyRemovalData[];
  selectedId?: number | null;
  onSelect?: (fieldSeasonId: number) => void;
}

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';

const REMOVER_COLORS: Record<string, string> = {
  ryan: '#0071e3',
  brian: '#34c759',
  daine: '#af52de',
  daine1: '#af52de',
};

function pinColor(row: EarlyRemovalData): string {
  const removed = !!row.removalDate;
  if (removed) return '#c7c7cc';
  if ((row.removalPriority || '').toLowerCase() === 'priority') return '#ff3b30';
  if (row.readyToRemove) return '#34c759';
  const remover = (row.plannedRemover || '').toLowerCase();
  if (remover && REMOVER_COLORS[remover]) return REMOVER_COLORS[remover];
  if (remover) return '#ff9f0a';
  return '#0071e3';
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
    className: 'af-removals-pin',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    const valid = points.filter((p) => p.lat && p.lng);
    if (!valid.length) return;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 13);
    } else {
      map.fitBounds(
        L.latLngBounds(valid.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [40, 40] },
      );
    }
    didFit.current = true;
  }, [map, points]);
  return null;
}

function FlyToSelected({
  rows,
  selectedId,
}: {
  rows: EarlyRemovalData[];
  selectedId?: number | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const row = rows.find((r) => r.fieldSeasonId === selectedId && r.lat && r.lng);
    if (!row) return;
    map.panTo([row.lat, row.lng], { animate: true });
  }, [map, rows, selectedId]);
  return null;
}

function Legend() {
  const items = [
    { color: '#0071e3', label: 'Still in ground' },
    { color: '#34c759', label: 'Ready' },
    { color: '#ff3b30', label: 'Priority' },
    { color: '#ff9f0a', label: 'Planned remover' },
    { color: '#c7c7cc', label: 'Removed' },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 12,
        zIndex: 1000,
        background: 'rgba(255,255,255,0.93)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
      }}
    >
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: color,
              border: '1.5px solid rgba(0,0,0,0.2)',
              flexShrink: 0,
            }}
          />
          <span style={{ color: '#1d1d1f' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function RemovalsMapView({ rows, selectedId = null, onSelect }: Props) {
  const valid = useMemo(
    () => rows.filter((r) => Number(r.lat) && Number(r.lng)),
    [rows],
  );
  const center: [number, number] = valid[0]
    ? [valid[0].lat, valid[0].lng]
    : [41.5, -99.9];

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

        {valid.map((row) => {
          const selected = selectedId === row.fieldSeasonId;
          const removed = !!row.removalDate;
          const statusBits = [
            removed ? 'Removed' : 'In ground',
            row.readyToRemove && !removed ? 'Ready' : '',
            (row.removalPriority || '').toLowerCase() === 'priority' && !removed ? 'Priority' : '',
            row.plannedRemover ? `Remover: ${row.plannedRemover}` : '',
          ].filter(Boolean);

          return (
            <Marker
              key={row.fieldSeasonId}
              position={[row.lat, row.lng]}
              icon={makePin(pinColor(row), selected)}
              eventHandlers={{
                click: () => onSelect?.(row.fieldSeasonId),
              }}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <div style={{ fontSize: 11, lineHeight: 1.4, maxWidth: 260 }}>
                  <strong style={{ display: 'block' }}>{row.fieldName}</strong>
                  {row.operation && (
                    <span style={{ opacity: 0.7 }}>{row.operation}</span>
                  )}
                  <span style={{ display: 'block', opacity: 0.75, marginTop: 2 }}>
                    {statusBits.join(' · ')}
                  </span>
                  {row.fieldNotes && (
                    <span style={{ display: 'block', marginTop: 4, color: '#92400e', fontWeight: 600 }}>
                      {row.fieldNotes.length > 120 ? `${row.fieldNotes.slice(0, 120)}…` : row.fieldNotes}
                    </span>
                  )}
                </div>
              </Tooltip>
              {row.fieldNotes && (
                <Popup offset={[0, -8]}>
                  <div style={{ fontSize: 13, maxWidth: 280, lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{row.fieldName}</div>
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      color: '#92400e',
                      whiteSpace: 'pre-wrap',
                      fontSize: 12,
                    }}>
                      {row.fieldNotes}
                    </div>
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}

        <FitBounds points={valid} />
        <FlyToSelected rows={valid} selectedId={selectedId} />
      </MapContainer>

      <Legend />

      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 60,
          zIndex: 1000,
          background: 'rgba(255,255,255,0.93)',
          borderRadius: 8,
          padding: '6px 10px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          fontSize: 12,
          color: '#1d1d1f',
        }}
      >
        {valid.length} on map
        {rows.length !== valid.length ? ` · ${rows.length - valid.length} without coords` : ''}
      </div>
    </div>
  );
}
