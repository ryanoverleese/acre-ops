'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ProcessedRepair } from './RepairsClient';
import { repairColor } from '@/lib/repair-status';

function makePin(status: 'open' | 'resolved', watchList?: boolean) {
  const color = repairColor(status === 'open', watchList);
  return L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  if (points.length > 0) {
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }
  return null;
}

interface Props {
  repairs: ProcessedRepair[];
  onSelect?: (id: number) => void;
}

export default function RepairsMap({ repairs, onSelect }: Props) {
  const withCoords = useMemo(
    () => repairs.filter(r => r.lat && r.lng),
    [repairs]
  );

  if (withCoords.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        No repairs with field coordinates to display.
      </div>
    );
  }

  const boundsPoints: [number, number][] = withCoords.map(r => [r.lat!, r.lng!]);

  return (
    <MapContainer
      center={boundsPoints[0]}
      zoom={9}
      style={{ width: '100%', height: '100%', minHeight: 500, borderRadius: 'var(--radius)' }}
    >
      <TileLayer
        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        attribution=""
      />

      {withCoords.map(r => (
        <Marker
          key={r.id}
          position={[r.lat!, r.lng!]}
          icon={makePin(r.status, r.watchList)}
          eventHandlers={{ click: () => onSelect?.(r.id) }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            <strong>{r.fieldName}</strong>
            <br />
            <span style={{ opacity: 0.7 }}>{r.operation}</span>
          </Tooltip>
          <Popup closeButton={false} offset={[0, -8]}>
            <div style={{ fontSize: 13, minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: repairColor(r.status === 'open', r.watchList),
                  flexShrink: 0,
                }} />
                <strong style={{ fontSize: 14 }}>{r.fieldName}</strong>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{r.operation}</div>
              <div style={{ fontSize: 12, marginBottom: 4, lineHeight: 1.4 }}>
                {r.problem.slice(0, 80)}{r.problem.length > 80 ? '…' : ''}
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>
                Reported {r.reportedAt ? new Date(r.reportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                {r.repairedAt && ` · Fixed ${new Date(r.repairedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </div>
              {r.probeSerial && (
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Probe: {r.probeSerial}</div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      <FitBounds points={boundsPoints} />
    </MapContainer>
  );
}
