'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BoundaryLayer from '@/components/BoundaryLayer';
import ElevationOverlay, { type TerrainMode, TERRAIN_MODE_LABELS } from '@/components/ElevationOverlay';
import { useFieldBoundaries, type FieldBoundaryCollection } from '@/components/useFieldBoundaries';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';
const TERRAIN_OPTIONS: TerrainMode[] = ['off', 'color', 'shade', 'contours'];
const NEBRASKA_FALLBACK: [number, number] = [41.5, -99.5];

type LatLng = [number, number]; // [lat, lng]

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

function collectBoundaryLatLngs(data: FieldBoundaryCollection | null | undefined): LatLng[] {
  const out: LatLng[] = [];
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
  drawing,
}: {
  lat: number | null;
  lng: number | null;
  boundaries: FieldBoundaryCollection;
  drawing: boolean;
}) {
  const map = useMap();
  const seed = useMemo(() => collectBoundaryLatLngs(boundaries), [boundaries]);

  useEffect(() => {
    map.invalidateSize();
    if (drawing) return;
    if (seed.length >= 2) {
      map.fitBounds(L.latLngBounds(seed), { padding: [28, 28], maxZoom: 16 });
      return;
    }
    if (lat && lng) {
      map.setView([lat, lng], 15);
      return;
    }
    map.setView(NEBRASKA_FALLBACK, 7);
  }, [map, lat, lng, seed, drawing]);

  return null;
}

function DrawClicks({ enabled, onAdd }: { enabled: boolean; onAdd: (pt: LatLng) => void }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function ringToPolygon(points: LatLng[]): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (points.length < 3) return null;
  const ring = points.map(([lat, lng]) => [lng, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return { type: 'Polygon', coordinates: [ring] };
}

interface Props {
  fieldId: number;
  lat: number | null;
  lng: number | null;
  onPlacePin?: () => void;
  /** Called after a hand-drawn boundary is saved so the Fields table can refresh. */
  onBoundarySaved?: (feature: FieldBoundaryCollection['features'][number]) => void;
}

export default function FieldDetailMap({ fieldId, lat, lng, onPlacePin, onBoundarySaved }: Props) {
  const [boundaryTick, setBoundaryTick] = useState(0);
  const boundaries = useFieldBoundaries([fieldId], undefined, boundaryTick);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>('off');
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<LatLng[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const hasPin = Boolean(lat && lng);
  const hasBoundary = boundaries.features.some((f) => (f.properties?.fieldId ?? f.id) === fieldId);
  const center: LatLng = hasPin ? [lat as number, lng as number] : NEBRASKA_FALLBACK;
  const canSave = points.length >= 3 && !saving;

  const startDraw = () => {
    setError('');
    setPoints([]);
    setDrawing(true);
  };

  const cancelDraw = () => {
    setDrawing(false);
    setPoints([]);
    setError('');
  };

  const saveDraw = async () => {
    const geometry = ringToPolygon(points);
    if (!geometry) {
      setError('Tap at least 3 corners');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/field-boundaries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ fieldId, geometry }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === 'string' ? body.error : 'Could not save boundary');
        return;
      }
      const feature = {
        type: 'Feature' as const,
        id: fieldId,
        geometry,
        properties: { fieldId, source: 'edited', edited: true, crs: 'EPSG:4326', cropxFieldUuid: null },
      };
      setDrawing(false);
      setPoints([]);
      setBoundaryTick((n) => n + 1);
      onBoundarySaved?.(feature);
    } catch {
      setError('Could not save boundary');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`field-detail-map${drawing ? ' field-detail-map-drawing' : ''}`}>
      <MapContainer
        center={center}
        zoom={hasPin ? 15 : 7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url={SAT_URL} attribution={GOOGLE_ATTR} maxZoom={20} />
        {!drawing && <ElevationOverlay mode={terrainMode} clipTo={boundaries} />}
        {!drawing && <BoundaryLayer data={boundaries} selectedId={fieldId} />}
        {hasPin && !drawing && (
          <Marker position={[lat as number, lng as number]} icon={pinIcon()} interactive={false} />
        )}
        {drawing && points.length >= 2 && (
          points.length >= 3 ? (
            <Polygon
              positions={points}
              pathOptions={{ color: '#F6F2EA', weight: 2, fillColor: '#1F402A', fillOpacity: 0.35 }}
            />
          ) : (
            <Polyline positions={points} pathOptions={{ color: '#F6F2EA', weight: 2, dashArray: '4 6' }} />
          )
        )}
        {drawing && points.map((pt, i) => (
          <CircleMarker
            key={`${pt[0]}-${pt[1]}-${i}`}
            center={pt}
            radius={5}
            pathOptions={{ color: '#F6F2EA', weight: 2, fillColor: '#1F402A', fillOpacity: 1 }}
          />
        ))}
        <DrawClicks enabled={drawing} onAdd={(pt) => setPoints((prev) => [...prev, pt])} />
        <FitField lat={lat} lng={lng} boundaries={boundaries} drawing={drawing} />
      </MapContainer>

      {!drawing && (
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
      )}

      {drawing ? (
        <div className="field-detail-map-draw-bar">
          <span className="field-detail-map-draw-hint">
            {error || (points.length < 3 ? `Tap corners · ${points.length}/3` : `${points.length} corners · ready`)}
          </span>
          <div className="field-detail-map-draw-actions">
            <button type="button" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length || saving}>
              Undo
            </button>
            <button type="button" onClick={() => setPoints([])} disabled={!points.length || saving}>
              Clear
            </button>
            <button type="button" onClick={cancelDraw} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="field-detail-map-draw-save" onClick={saveDraw} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="field-detail-map-actions">
          {!hasBoundary && (
            <button type="button" className="field-detail-map-place" onClick={startDraw}>
              Draw boundary
            </button>
          )}
          {onPlacePin && (
            <button type="button" className="field-detail-map-place" onClick={onPlacePin}>
              {hasPin ? 'Move pin' : 'Place pin'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
