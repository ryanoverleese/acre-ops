'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BoundaryLayer from '@/components/BoundaryLayer';
import ElevationOverlay from '@/components/ElevationOverlay';
import { MapSizeSync, useMapFullscreen } from '@/components/MapFullscreen';
import { useLidarLabel } from '@/components/useLidarLabel';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import { probeHasPin, type ProbeRowData } from '@/components/fields/ProbeRows';
import { formatLegendRange, type ElevRange } from '@/lib/terrain/color-scale';
import { FIELD_MAP_ZOOM } from '@/lib/terrain/field-map-zoom';
import { fieldInteriorPoint } from '@/lib/terrain/lidar-source';
import type { TerrainMode } from '@/lib/terrain/modes';
import { elevationCssGradient } from '@/lib/terrain/ramp';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';
const NEBRASKA_FALLBACK: [number, number] = [41.5, -99.5];
const RAMP = elevationCssGradient();

function pinIcon(number: string, selected: boolean) {
  const text = number.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: 'field-pin-icon',
    html: `<div class="field-pin-hit"><div class="field-pin-dot${selected ? ' is-selected' : ''}">${text}</div></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function collectBoundary(data: FieldBoundaryCollection | null | undefined): [number, number][] {
  const out: [number, number][] = [];
  if (!data?.features?.length) return out;
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      out.push([coords[1] as number, coords[0] as number]);
      return;
    }
    for (const part of coords) walk(part);
  };
  for (const feature of data.features) walk(feature.geometry?.coordinates);
  return out;
}

function BindMap({ onMap }: { onMap: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMap(map); }, [map, onMap]);
  return null;
}

function FitBoundary({
  boundaries,
  expanded,
}: {
  boundaries: FieldBoundaryCollection;
  expanded: boolean;
}) {
  const map = useMap();
  const ring = useMemo(() => collectBoundary(boundaries), [boundaries]);

  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (ring.length >= 2) {
        map.fitBounds(L.latLngBounds(ring.map(([lat, lng]) => L.latLng(lat, lng))), {
          padding: [16, 16],
          maxZoom: 16,
        });
        return;
      }
      if (ring.length === 1) {
        map.setView(ring[0], 15);
        return;
      }
      map.setView(NEBRASKA_FALLBACK, 7);
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.invalidateSize())
      : null;
    ro?.observe(map.getContainer());
    return () => ro?.disconnect();
  }, [map, ring, expanded]);

  return null;
}

function FollowSelection({
  selectedId,
  probes,
}: {
  selectedId: number | null;
  probes: ProbeRowData[];
}) {
  const map = useMap();
  const last = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (last.current === undefined) {
      last.current = selectedId;
      return;
    }
    if (last.current === selectedId) return;
    last.current = selectedId;
    if (selectedId == null) return;
    const probe = probes.find((item) => item.id === selectedId);
    if (!probe || !probeHasPin(probe)) return;
    const ll = L.latLng(probe.lat as number, probe.lng as number);
    if (!map.getBounds().contains(ll)) map.panTo(ll);
  }, [map, probes, selectedId]);
  return null;
}

function ExpandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M6 2v4H2M12 2v4h4M16 12h-4v4M6 16v-4H2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FieldMapBlock({
  fieldId,
  lat,
  lng,
  boundaries,
  probes,
  selectedId,
  onSelect,
}: {
  fieldId: number;
  lat: number | null;
  lng: number | null;
  boundaries: FieldBoundaryCollection;
  probes: ProbeRowData[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [mode, setMode] = useState<TerrainMode>('colorshade');
  const [range, setRange] = useState<ElevRange | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onMap = useCallback((map: L.Map) => { mapRef.current = map; }, []);
  const { rootRef, expanded, cssFallback, toggle } = useMapFullscreen();
  const hasOutline = boundaries.features.length > 0;
  const sourcePoint = useMemo(
    () => fieldInteriorPoint(boundaries.features.map((feature) => feature.geometry?.coordinates), lat, lng),
    [boundaries, lat, lng],
  );
  const lidar = useLidarLabel(sourcePoint?.lat ?? null, sourcePoint?.lng ?? null);
  const feet = range && Number.isFinite(range.lo) && Number.isFinite(range.hi)
    ? formatLegendRange(range.lo, range.hi)
    : '';
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : NEBRASKA_FALLBACK;
  const pins = probes.filter(probeHasPin);

  return (
    <div
      ref={rootRef}
      className={`field-map-frame${expanded ? ' is-map-expanded' : ''}${cssFallback ? ' is-map-css-fullscreen' : ''}`}
    >
      <div className="map-controls">
        {!expanded && (
          <div className="map-seg" role="group" aria-label="Terrain">
            <button
              type="button"
              aria-pressed={mode === 'colorshade'}
              onClick={() => setMode('colorshade')}
            >
              Color
            </button>
            <button
              type="button"
              aria-pressed={mode === 'shade'}
              onClick={() => setMode('shade')}
            >
              Gray
            </button>
          </div>
        )}
        <div className="map-controls-right">
          {!expanded && (
            <>
              <button type="button" className="map-zoom-btn" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>+</button>
              <button type="button" className="map-zoom-btn" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>−</button>
            </>
          )}
          <button
            type="button"
            className="map-fs-btn"
            aria-pressed={expanded}
            aria-label={expanded ? 'Exit full screen' : 'Full screen'}
            onClick={toggle}
          >
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        </div>
      </div>
      <div className="field-map-canvas">
        <MapContainer
          center={center}
          zoom={lat != null && lng != null ? 15 : 7}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
          zoomSnap={FIELD_MAP_ZOOM.zoomSnap}
          zoomDelta={FIELD_MAP_ZOOM.zoomDelta}
          wheelPxPerZoomLevel={FIELD_MAP_ZOOM.wheelPxPerZoomLevel}
        >
          <TileLayer url={SAT_URL} attribution={GOOGLE_ATTR} maxZoom={20} />
          {hasOutline && (
            <ElevationOverlay mode={mode} clipTo={boundaries} onFieldRange={setRange} />
          )}
          <BoundaryLayer data={boundaries} selectedId={fieldId} />
          {pins.map((probe) => (
            <Marker
              key={`${probe.id}-${selectedId === probe.id ? 'on' : 'off'}`}
              position={[probe.lat as number, probe.lng as number]}
              icon={pinIcon(String(probe.probeNumber), selectedId === probe.id)}
              eventHandlers={{
                click: (event) => {
                  if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
                  onSelect(selectedId === probe.id ? null : probe.id);
                },
              }}
            />
          ))}
          <FitBoundary boundaries={boundaries} expanded={expanded} />
          <FollowSelection selectedId={selectedId} probes={probes} />
          <BindMap onMap={onMap} />
          <MapSizeSync expanded={expanded} />
        </MapContainer>
      </div>
      <div className="map-legend">
        {mode !== 'shade' ? <span className="map-legend-ramp" style={{ background: RAMP }} aria-hidden="true" /> : null}
        {feet ? <span className="map-legend-range">{feet}</span> : null}
        {lidar ? <span className="map-legend-source">{lidar}</span> : null}
      </div>
    </div>
  );
}
