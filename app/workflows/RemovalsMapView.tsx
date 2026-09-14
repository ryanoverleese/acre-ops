'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EarlyRemovalData } from './WorkflowsClient';

interface Props {
  rows: EarlyRemovalData[];
  selectedId?: number | null;
  onSelect?: (fieldSeasonId: number) => void;
}

type ColorMode = 'status' | 'plannedRemover';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';

const STATUS_COLORS = {
  stillInGround: '#0071e3',
  ready: '#34c759',
  priority: '#ff3b30',
  removed: '#c7c7cc',
} as const;

/** Stable named colors for known removers (case-insensitive keys). */
const REMOVER_COLORS: Record<string, string> = {
  ryan: '#0071e3',
  'ryan and kasen': '#5ac8fa',
  brian: '#34c759',
  daine: '#af52de',
  daine1: '#af52de',
  brandon: '#ff9f0a',
  carter: '#ff2d55',
  kasen: '#64d2ff',
};

const FALLBACK_REMOVER_PALETTE = [
  '#ff9f0a',
  '#af52de',
  '#5ac8fa',
  '#ff2d55',
  '#30b0c7',
  '#ffd60a',
  '#bf5af2',
  '#ac8e68',
];

const UNASSIGNED_COLOR = '#8e8e93';

function hashHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_REMOVER_PALETTE[h % FALLBACK_REMOVER_PALETTE.length];
}

function removerColor(name: string): string {
  const key = name.trim().toLowerCase();
  if (!key) return UNASSIGNED_COLOR;
  return REMOVER_COLORS[key] || hashHue(key);
}

function statusPinColor(row: EarlyRemovalData, probeRemoved: boolean): string {
  if (probeRemoved) return STATUS_COLORS.removed;
  if ((row.removalPriority || '').toLowerCase() === 'priority') return STATUS_COLORS.priority;
  if (row.readyToRemove) return STATUS_COLORS.ready;
  return STATUS_COLORS.stillInGround;
}

function plannedRemoverPinColor(row: EarlyRemovalData, probeRemoved: boolean): string {
  if (probeRemoved) return STATUS_COLORS.removed;
  return removerColor(row.plannedRemover || '');
}

function pinColor(row: EarlyRemovalData, mode: ColorMode, probeRemoved: boolean): string {
  return mode === 'plannedRemover'
    ? plannedRemoverPinColor(row, probeRemoved)
    : statusPinColor(row, probeRemoved);
}

/** Small lat/lng nudge so stacked identical coords stay distinguishable. */
function offsetCollidingCoords(
  pins: { lat: number; lng: number }[],
): { lat: number; lng: number }[] {
  const seen = new Map<string, number>();
  const STEP = 0.00012; // ~13m
  return pins.map((p) => {
    if (!p.lat || !p.lng) return p;
    const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return p;
    // Spiral-ish offsets: alternate E/N/W/S
    const angle = (n * 2.4) % (Math.PI * 2);
    return {
      lat: p.lat + Math.sin(angle) * STEP * Math.ceil(n / 2),
      lng: p.lng + Math.cos(angle) * STEP * Math.ceil(n / 2),
    };
  });
}

export type ProbeMapPin = {
  key: string;
  fieldSeasonId: number;
  assignmentId: number;
  row: EarlyRemovalData;
  label: string;
  lat: number;
  lng: number;
  probeRemoved: boolean;
};

function buildProbePins(rows: EarlyRemovalData[]): ProbeMapPin[] {
  const raw: ProbeMapPin[] = [];
  for (const row of rows) {
    const ids = row.assignmentIds || [];
    if (!ids.length) continue;
    const dates = row.assignmentRemovalDates || [];
    const lats = row.assignmentLats || [];
    const lngs = row.assignmentLngs || [];
    const labels = row.assignmentLabels || [];
    for (let i = 0; i < ids.length; i++) {
      const lat = Number(lats[i] ?? row.lat) || Number(row.lat) || 0;
      const lng = Number(lngs[i] ?? row.lng) || Number(row.lng) || 0;
      raw.push({
        key: `${ids[i]}`,
        fieldSeasonId: row.fieldSeasonId,
        assignmentId: ids[i],
        row,
        label: labels[i] || `Probe ${i + 1}`,
        lat,
        lng,
        probeRemoved: !!(dates[i] || ''),
      });
    }
  }
  const offset = offsetCollidingCoords(raw);
  return raw.map((p, i) => ({ ...p, lat: offset[i].lat, lng: offset[i].lng }));
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
  pins,
  selectedId,
}: {
  pins: ProbeMapPin[];
  selectedId?: number | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const pin = pins.find((p) => p.fieldSeasonId === selectedId && p.lat && p.lng);
    if (!pin) return;
    map.panTo([pin.lat, pin.lng], { animate: true });
  }, [map, pins, selectedId]);
  return null;
}

function ColorModeToggle({
  mode,
  onChange,
}: {
  mode: ColorMode;
  onChange: (mode: ColorMode) => void;
}) {
  const options: { id: ColorMode; label: string }[] = [
    { id: 'status', label: 'Status' },
    { id: 'plannedRemover', label: 'Planned Remover' },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        right: 12,
        zIndex: 1000,
        display: 'flex',
        background: 'rgba(255,255,255,0.93)',
        borderRadius: 8,
        padding: 3,
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        gap: 2,
      }}
      role="group"
      aria-label="Pin color mode"
    >
      {options.map((opt) => {
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            style={{
              border: 'none',
              cursor: 'pointer',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              background: active ? '#1d1d1f' : 'transparent',
              color: active ? '#fff' : '#1d1d1f',
              lineHeight: 1.2,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Legend({
  mode,
  rows,
}: {
  mode: ColorMode;
  rows: EarlyRemovalData[];
}) {
  const items = useMemo(() => {
    if (mode === 'status') {
      return [
        { color: STATUS_COLORS.stillInGround, label: 'Still in ground' },
        { color: STATUS_COLORS.ready, label: 'Ready' },
        { color: STATUS_COLORS.priority, label: 'Priority' },
        { color: STATUS_COLORS.removed, label: 'Removed' },
      ];
    }

    const names = Array.from(
      new Set(
        rows
          .map((r) => (r.plannedRemover || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const removerItems = names.map((name) => ({
      color: removerColor(name),
      label: name,
    }));

    return [
      ...removerItems,
      { color: UNASSIGNED_COLOR, label: 'Unassigned' },
      { color: STATUS_COLORS.removed, label: 'Removed' },
    ];
  }, [mode, rows]);

  const title = mode === 'plannedRemover' ? 'Planned Remover' : 'Status';

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
        maxHeight: '55%',
        overflowY: 'auto',
      }}
    >
      <div style={{ fontWeight: 700, color: '#1d1d1f', marginBottom: 2 }}>{title}</div>
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
  const [colorMode, setColorMode] = useState<ColorMode>('status');
  const pins = useMemo(() => buildProbePins(rows), [rows]);
  const valid = useMemo(
    () => pins.filter((p) => Number(p.lat) && Number(p.lng)),
    [pins],
  );
  const center: [number, number] = valid[0]
    ? [valid[0].lat, valid[0].lng]
    : [41.5, -99.9];
  const fieldsWithoutCoords = useMemo(() => {
    const missing = new Set<number>();
    for (const row of rows) {
      const ids = row.assignmentIds || [];
      if (!ids.length) continue;
      const lats = row.assignmentLats || [];
      const lngs = row.assignmentLngs || [];
      const anyCoord = ids.some((_, i) => {
        const lat = Number(lats[i] ?? row.lat) || Number(row.lat) || 0;
        const lng = Number(lngs[i] ?? row.lng) || Number(row.lng) || 0;
        return lat && lng;
      });
      if (!anyCoord) missing.add(row.fieldSeasonId);
    }
    return missing.size;
  }, [rows]);

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

        {valid.map((pin) => {
          const selected = selectedId === pin.fieldSeasonId;
          const row = pin.row;
          const statusBits = [
            pin.label,
            pin.probeRemoved ? 'Removed' : 'In ground',
            row.readyToRemove && !pin.probeRemoved ? 'Ready' : '',
            (row.removalPriority || '').toLowerCase() === 'priority' && !pin.probeRemoved ? 'Priority' : '',
            row.plannedRemover ? `Planned Remover: ${row.plannedRemover}` : '',
          ].filter(Boolean);

          return (
            <Marker
              key={`${pin.key}-${colorMode}`}
              position={[pin.lat, pin.lng]}
              icon={makePin(pinColor(row, colorMode, pin.probeRemoved), selected)}
              eventHandlers={{
                click: () => onSelect?.(pin.fieldSeasonId),
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
        <FlyToSelected pins={valid} selectedId={selectedId} />
      </MapContainer>

      <ColorModeToggle mode={colorMode} onChange={setColorMode} />
      <Legend mode={colorMode} rows={rows} />

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
        {valid.length} probes on map
        {fieldsWithoutCoords ? ` · ${fieldsWithoutCoords} fields without coords` : ''}
      </div>
    </div>
  );
}
