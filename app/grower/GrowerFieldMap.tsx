'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BoundaryLayer from '@/components/BoundaryLayer';
import ElevationOverlay from '@/components/ElevationOverlay';
import TerrainControl from '@/components/TerrainControl';
import { DEFAULT_TERRAIN_MODE, type TerrainMode } from '@/lib/terrain/modes';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import type { GrowerProbePin } from '@/lib/supabase/grower-fields';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';
const NEBRASKA_FALLBACK: [number, number] = [41.5, -99.5];

function probeIcon(label: string) {
  const text = label.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: 'grower-probe-pin',
    html: `<div class="grower-probe-pin-dot">${text}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function collectLatLngs(data: FieldBoundaryCollection | null | undefined): [number, number][] {
  const out: [number, number][] = [];
  if (!data?.features?.length) return out;
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      out.push([coords[1] as number, coords[0] as number]);
      return;
    }
    for (const c of coords) walk(c);
  };
  for (const f of data.features) walk(f.geometry?.coordinates);
  return out;
}

function Fit({
  fieldLat,
  fieldLng,
  boundaries,
  probes,
}: {
  fieldLat: number | null;
  fieldLng: number | null;
  boundaries: FieldBoundaryCollection;
  probes: GrowerProbePin[];
}) {
  const map = useMap();
  const ring = useMemo(() => collectLatLngs(boundaries), [boundaries]);

  useEffect(() => {
    map.invalidateSize();
    const pts: [number, number][] = [
      ...ring,
      ...probes
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => [p.lat as number, p.lng as number] as [number, number]),
    ];
    if (fieldLat != null && fieldLng != null) pts.push([fieldLat, fieldLng]);
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts.map(([lat, lng]) => L.latLng(lat, lng))), {
        padding: [28, 28],
        maxZoom: 16,
      });
      return;
    }
    if (pts.length === 1) {
      map.setView(pts[0], 15);
      return;
    }
    map.setView(NEBRASKA_FALLBACK, 7);
  }, [map, ring, probes, fieldLat, fieldLng]);

  return null;
}

export default function GrowerFieldMap({
  fieldId,
  lat,
  lng,
  boundaries,
  probes,
}: {
  fieldId: number;
  lat: number | null;
  lng: number | null;
  boundaries: FieldBoundaryCollection;
  probes: GrowerProbePin[];
}) {
  const [terrainMode, setTerrainMode] = useState<TerrainMode>(DEFAULT_TERRAIN_MODE);
  const hasOutline = boundaries.features.length > 0;
  const center: [number, number] =
    lat != null && lng != null ? [lat, lng] : NEBRASKA_FALLBACK;

  return (
    <div className="grower-map">
      <MapContainer
        center={center}
        zoom={lat != null && lng != null ? 15 : 7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={SAT_URL} attribution={GOOGLE_ATTR} maxZoom={20} />
        {hasOutline && <ElevationOverlay mode={terrainMode} clipTo={boundaries} />}
        <BoundaryLayer data={boundaries} selectedId={fieldId} />
        {probes
          .filter((probe) => probe.lat != null && probe.lng != null)
          .map((probe) => (
          <Marker
            key={probe.id}
            position={[probe.lat as number, probe.lng as number]}
            icon={probeIcon(probe.label || String(probe.probeNumber || 'P'))}
            interactive={false}
          />
        ))}
        <Fit fieldLat={lat} fieldLng={lng} boundaries={boundaries} probes={probes} />
      </MapContainer>
      {hasOutline && (
        <TerrainControl
          className="grower-map-terrain"
          value={terrainMode}
          onChange={setTerrainMode}
        />
      )}
    </div>
  );
}
