'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BoundaryLayer from '@/components/BoundaryLayer';
import ElevationOverlay, { type TerrainMode, TERRAIN_MODE_LABELS } from '@/components/ElevationOverlay';
import { useFieldBoundaries, type FieldBoundaryCollection } from '@/components/useFieldBoundaries';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';
const TERRAIN_OPTIONS: TerrainMode[] = ['off', 'color', 'shade', 'contours'];
const NEBRASKA_FALLBACK: [number, number] = [41.5, -99.5];

function pinIcon() {
  return L.divIcon({
    className: 'af-leaflet-pin',
    html: `
      <div style="
        width:32px;height:32px;border-radius:50%;
        background:var(--field-green,#1F402A);
        border:3px solid #fff;
        box-shadow:0 3px 10px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
      ">
        <svg width="14" height="14" fill="none" stroke="#fff" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function collectBoundaryLatLngs(data: FieldBoundaryCollection | null | undefined): [number, number][] {
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

function FitField({
  lat,
  lng,
  boundaries,
}: {
  lat: number | null;
  lng: number | null;
  boundaries: FieldBoundaryCollection;
}) {
  const map = useMap();
  const seed = useMemo(() => collectBoundaryLatLngs(boundaries), [boundaries]);

  useEffect(() => {
    map.invalidateSize();
    if (seed.length >= 2) {
      map.fitBounds(L.latLngBounds(seed), { padding: [28, 28], maxZoom: 16 });
      return;
    }
    if (lat && lng) {
      map.setView([lat, lng], 15);
      return;
    }
    map.setView(NEBRASKA_FALLBACK, 7);
  }, [map, lat, lng, seed]);

  return null;
}

interface Props {
  fieldId: number;
  lat: number | null;
  lng: number | null;
  onPlacePin?: () => void;
}

export default function FieldDetailMap({ fieldId, lat, lng, onPlacePin }: Props) {
  const boundaries = useFieldBoundaries([fieldId]);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>('off');
  const hasPin = Boolean(lat && lng);
  const center: [number, number] = hasPin ? [lat as number, lng as number] : NEBRASKA_FALLBACK;

  return (
    <div className="field-detail-map">
      <MapContainer
        center={center}
        zoom={hasPin ? 15 : 7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={SAT_URL} attribution={GOOGLE_ATTR} maxZoom={20} />
        <ElevationOverlay mode={terrainMode} clipTo={boundaries} />
        <BoundaryLayer data={boundaries} selectedId={fieldId} />
        {hasPin && <Marker position={[lat as number, lng as number]} icon={pinIcon()} interactive={false} />}
        <FitField lat={lat} lng={lng} boundaries={boundaries} />
      </MapContainer>

      <label className="field-detail-map-terrain">
        Terrain
        <select
          value={terrainMode}
          onChange={(e) => setTerrainMode(e.target.value as TerrainMode)}
          aria-label="Terrain mode"
        >
          {TERRAIN_OPTIONS.map((mode) => (
            <option key={mode} value={mode}>{TERRAIN_MODE_LABELS[mode]}</option>
          ))}
        </select>
      </label>

      {onPlacePin && (
        <button type="button" className="field-detail-map-place" onClick={onPlacePin}>
          {hasPin ? 'Move pin' : 'Place pin'}
        </button>
      )}
    </div>
  );
}
