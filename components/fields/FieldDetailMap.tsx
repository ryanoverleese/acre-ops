'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BoundaryLayer from '@/components/BoundaryLayer';
import ElevationOverlay from '@/components/ElevationOverlay';
import { MapFullscreenButton, MapSizeSync, useMapFullscreen } from '@/components/MapFullscreen';
import TerrainControl from '@/components/TerrainControl';
import { useLidarLabel } from '@/components/useLidarLabel';
import type { ElevRange } from '@/lib/terrain/color-scale';
import { FIELD_MAP_ZOOM } from '@/lib/terrain/field-map-zoom';
import { fieldInteriorPoint } from '@/lib/terrain/lidar-source';
import { DEFAULT_TERRAIN_MODE, type TerrainMode } from '@/lib/terrain/modes';
import { useFieldBoundaries, type FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import {
  exteriorRing,
  isComplexBoundary,
  midpoints,
  ringToPolygon,
  type LatLng,
} from '@/lib/field-boundaries/draw';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';
const NEBRASKA_FALLBACK: [number, number] = [41.5, -99.5];

type Mode = 'idle' | 'create' | 'edit';
type BoundaryFeature = FieldBoundaryCollection['features'][number];

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

function vertexIcon(selected: boolean) {
  const size = selected ? 16 : 14;
  return L.divIcon({
    className: 'boundary-vertex-icon',
    html: `<div class="boundary-vertex-dot${selected ? ' is-selected' : ''}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function midIcon() {
  return L.divIcon({
    className: 'boundary-mid-icon',
    html: '<div class="boundary-mid-dot"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
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
  editing,
}: {
  lat: number | null;
  lng: number | null;
  boundaries: FieldBoundaryCollection;
  editing: boolean;
}) {
  const map = useMap();
  const seed = useMemo(() => collectBoundaryLatLngs(boundaries), [boundaries]);

  useEffect(() => {
    map.invalidateSize();
    if (editing) return;
    if (seed.length >= 2) {
      map.fitBounds(L.latLngBounds(seed), { padding: [28, 28], maxZoom: 16 });
      return;
    }
    if (lat && lng) {
      map.setView([lat, lng], 15);
      return;
    }
    map.setView(NEBRASKA_FALLBACK, 7);
  }, [map, lat, lng, seed, editing]);

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

interface Props {
  fieldId: number;
  lat: number | null;
  lng: number | null;
  onPlacePin?: () => void;
  /** Called after a boundary is saved so the Fields table can refresh. */
  onBoundarySaved?: (feature: BoundaryFeature) => void;
}

export default function FieldDetailMap({ fieldId, lat, lng, onPlacePin, onBoundarySaved }: Props) {
  const [boundaryTick, setBoundaryTick] = useState(0);
  const boundaries = useFieldBoundaries([fieldId], undefined, boundaryTick);
  const [terrainMode, setTerrainMode] = useState<TerrainMode>(DEFAULT_TERRAIN_MODE);
  const [elevRange, setElevRange] = useState<ElevRange | null>(null);
  const { rootRef, expanded, cssFallback, toggle } = useMapFullscreen();
  const [mode, setMode] = useState<Mode>('idle');
  const [points, setPoints] = useState<LatLng[]>([]);
  const [history, setHistory] = useState<LatLng[][]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const hasPin = Boolean(lat && lng);
  const sourcePoint = useMemo(
    () => fieldInteriorPoint(
      boundaries.features.map((feature) => feature.geometry?.coordinates),
      hasPin ? lat : null,
      hasPin ? lng : null,
    ),
    [boundaries, hasPin, lat, lng],
  );
  const lidarLabel = useLidarLabel(sourcePoint?.lat ?? null, sourcePoint?.lng ?? null);
  const fieldFeature = boundaries.features.find((f) => (f.properties?.fieldId ?? f.id) === fieldId);
  const hasBoundary = Boolean(fieldFeature);
  const complex = isComplexBoundary(fieldFeature?.geometry);
  const center: LatLng = hasPin ? [lat as number, lng as number] : NEBRASKA_FALLBACK;
  const editing = mode !== 'idle';
  const canSave = points.length >= 3 && !saving;
  const mids = mode === 'edit' ? midpoints(points) : [];

  const commit = (updater: (prev: LatLng[]) => LatLng[]) => {
    setPoints((prev) => {
      const next = updater(prev);
      setHistory((h) => [...h, prev.map((p) => [...p] as LatLng)]);
      return next;
    });
  };

  const startCreate = () => {
    setError('');
    setHistory([]);
    setSelected(null);
    setPoints([]);
    setMode('create');
  };

  const startEdit = () => {
    const ring = exteriorRing(fieldFeature?.geometry);
    if (!ring) {
      setError('Could not read this boundary');
      return;
    }
    setError(complex ? 'Saving replaces with a single outline' : '');
    setHistory([]);
    setSelected(null);
    setPoints(ring);
    setMode('edit');
  };

  const cancelEdit = () => {
    setMode('idle');
    setPoints([]);
    setHistory([]);
    setSelected(null);
    setError('');
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setPoints(prev);
      setSelected(null);
      return h.slice(0, -1);
    });
  };

  const movePoint = (index: number, next: LatLng) => {
    commit((prev) => prev.map((p, i) => (i === index ? next : p)));
  };

  const insertAt = (index: number, pt: LatLng) => {
    commit((prev) => [...prev.slice(0, index), pt, ...prev.slice(index)]);
    setSelected(index);
  };

  const removeSelected = () => {
    if (selected == null || points.length <= 3) return;
    const removeAt = selected;
    commit((prev) => prev.filter((_, i) => i !== removeAt));
    setSelected(null);
  };

  const saveEdit = async () => {
    const geometry = ringToPolygon(points);
    if (!geometry) {
      setError('Need at least 3 corners');
      return;
    }
    setSaving(true);
    if (!error.startsWith('Saving replaces')) setError('');
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
      const feature: BoundaryFeature = {
        type: 'Feature',
        id: fieldId,
        geometry,
        properties: {
          fieldId,
          source: 'edited',
          edited: true,
          crs: 'EPSG:4326',
          cropxFieldUuid: fieldFeature?.properties?.cropxFieldUuid ?? null,
        },
      };
      setMode('idle');
      setPoints([]);
      setHistory([]);
      setSelected(null);
      setError('');
      setBoundaryTick((n) => n + 1);
      onBoundarySaved?.(feature);
    } catch {
      setError('Could not save boundary');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`field-detail-map${editing ? ' field-detail-map-drawing' : ''}${expanded ? ' is-map-expanded' : ''}${cssFallback ? ' is-map-css-fullscreen' : ''}`}
    >
      <MapContainer
        center={center}
        zoom={hasPin ? 15 : 7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        attributionControl={false}
        zoomSnap={FIELD_MAP_ZOOM.zoomSnap}
        zoomDelta={FIELD_MAP_ZOOM.zoomDelta}
        wheelPxPerZoomLevel={FIELD_MAP_ZOOM.wheelPxPerZoomLevel}
      >
        <TileLayer url={SAT_URL} attribution={GOOGLE_ATTR} maxZoom={20} />
        {!editing && (
          <ElevationOverlay mode={terrainMode} clipTo={boundaries} onFieldRange={setElevRange} />
        )}
        {!editing && <BoundaryLayer data={boundaries} selectedId={fieldId} />}
        {hasPin && !editing && (
          <Marker position={[lat as number, lng as number]} icon={pinIcon()} interactive={false} />
        )}

        {editing && points.length >= 2 && (
          points.length >= 3 ? (
            <Polygon
              positions={points}
              pathOptions={{ color: '#F6F2EA', weight: 2, fillColor: '#1F402A', fillOpacity: 0.35 }}
            />
          ) : (
            <Polyline positions={points} pathOptions={{ color: '#F6F2EA', weight: 2, dashArray: '4 6' }} />
          )
        )}

        {editing && points.map((pt, i) => (
          <Marker
            key={`v-${i}`}
            position={pt}
            draggable
            icon={vertexIcon(selected === i)}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                setSelected(i);
              },
              dragstart: (e) => {
                L.DomEvent.stopPropagation(e);
              },
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                movePoint(i, [ll.lat, ll.lng]);
                setSelected(i);
              },
            }}
          />
        ))}

        {mode === 'edit' && mids.map((mid) => (
          <Marker
            key={`m-${mid.index}-${mid.at[0]}-${mid.at[1]}`}
            position={mid.at}
            icon={midIcon()}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                insertAt(mid.index, mid.at);
              },
            }}
          />
        ))}

        <DrawClicks
          enabled={mode === 'create'}
          onAdd={(pt) => {
            commit((prev) => {
              setSelected(prev.length);
              return [...prev, pt];
            });
          }}
        />
        <FitField lat={lat} lng={lng} boundaries={boundaries} editing={editing} />
        <MapSizeSync expanded={expanded} />
      </MapContainer>

      <MapFullscreenButton expanded={expanded} onClick={toggle} />

      {!editing && (
        <TerrainControl
          className="field-detail-map-terrain"
          value={terrainMode}
          onChange={setTerrainMode}
          range={elevRange}
          sourceLabel={lidarLabel}
        />
      )}

      {editing ? (
        <div className="field-detail-map-draw-bar">
          <span className="field-detail-map-draw-hint">
            {error
              || (mode === 'create'
                ? (points.length < 3 ? `Tap corners · ${points.length}/3` : `${points.length} corners · ready`)
                : 'Drag corners · tap + to add · select to remove')}
          </span>
          <div className="field-detail-map-draw-actions">
            <button type="button" onClick={undo} disabled={!history.length || saving}>Undo</button>
            {mode === 'create' && (
              <button
                type="button"
                onClick={() => { commit(() => []); setSelected(null); }}
                disabled={!points.length || saving}
              >
                Clear
              </button>
            )}
            {mode === 'edit' && (
              <button
                type="button"
                onClick={removeSelected}
                disabled={selected == null || points.length <= 3 || saving}
                title={points.length <= 3 ? 'Need at least 3 corners' : 'Remove selected corner'}
              >
                Remove
              </button>
            )}
            <button type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>
            <button type="button" className="field-detail-map-draw-save" onClick={saveEdit} disabled={!canSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="field-detail-map-actions">
          {hasBoundary ? (
            <button type="button" className="field-detail-map-place" onClick={startEdit}>
              Edit boundary
            </button>
          ) : (
            <button type="button" className="field-detail-map-place" onClick={startCreate}>
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
