'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BoundaryLayer from '@/components/BoundaryLayer';
import CanalsOverlay, { CANALS_SOURCE_LABEL } from '@/components/CanalsOverlay';
import CooperativeGestures from '@/components/fields/CooperativeGestures';
import ElevationOverlay, { type ElevationSampler } from '@/components/ElevationOverlay';
import ElevationPins, { type ElevPinPair } from '@/components/fields/ElevationPins';
import SoilsOverlay, { useSoilMap } from '@/components/SoilsOverlay';
import { MapSizeSync, useMapFullscreen } from '@/components/MapFullscreen';
import { useLidarLabel } from '@/components/useLidarLabel';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import { probeHasPin, type ProbeRowData } from '@/components/fields/ProbeRows';
import { formatElevationStrip, type ElevRange } from '@/lib/terrain/color-scale';
import { formatPinStrip } from '@/lib/terrain/sample-elev';
import {
  bufferCollection,
  OUTSIDE_FIELD_BUFFER_M,
} from '@/lib/terrain/field-buffer';
import { FIELD_MAP_ZOOM } from '@/lib/terrain/field-map-zoom';
import { fieldInteriorPoint } from '@/lib/terrain/lidar-source';
import type { TerrainMode } from '@/lib/terrain/modes';
import { elevationCssGradient } from '@/lib/terrain/ramp';
import { SOIL_SOURCE_LABELS } from '@/lib/soils/ssurgo';

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
  const [sourceOpen, setSourceOpen] = useState(false);
  const [showCanals, setShowCanals] = useState(false);
  const [showSoils, setShowSoils] = useState(false);
  const [elevMenuOpen, setElevMenuOpen] = useState(false);
  const [elevPins, setElevPins] = useState<ElevPinPair>({ a: null, b: null });
  const [showOutside, setShowOutside] = useState(false);
  const [samplerGen, setSamplerGen] = useState(0);
  const samplerRef = useRef<ElevationSampler | null>(null);
  const [elevMenuLeft, setElevMenuLeft] = useState(0);
  const elevBtnRef = useRef<HTMLButtonElement | null>(null);
  const elevMenuRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onMap = useCallback((map: L.Map) => { mapRef.current = map; }, []);
  const { rootRef, expanded, cssFallback, toggle } = useMapFullscreen();
  const hasOutline = boundaries.features.length > 0;
  const paintBoundaries = useMemo(
    () => (showOutside && hasOutline
      ? bufferCollection(boundaries, OUTSIDE_FIELD_BUFFER_M)
      : boundaries),
    [boundaries, hasOutline, showOutside],
  );
  const soils = useSoilMap(boundaries, showSoils && hasOutline);
  const layerNotes = [
    showSoils && soils.status === 'ready' ? SOIL_SOURCE_LABELS[soils.map.source] : '',
    showCanals ? CANALS_SOURCE_LABEL : '',
  ].filter(Boolean);
  const sourcePoint = useMemo(
    () => fieldInteriorPoint(boundaries.features.map((feature) => feature.geometry?.coordinates), lat, lng),
    [boundaries, lat, lng],
  );
  const lidar = useLidarLabel(sourcePoint?.lat ?? null, sourcePoint?.lng ?? null);
  const phrase = mode !== 'off' && range ? formatElevationStrip(range.lo, range.hi) : '';
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : NEBRASKA_FALLBACK;
  const pins = probes.filter(probeHasPin);
  const elevLabel = mode === 'colorshade' ? 'Elevation · Color' : mode === 'shade' ? 'Elevation · Gray' : 'Elevation';

  // The elevation menu closes on any tap outside it, on Escape, and when the map goes full screen.
  useEffect(() => {
    if (!elevMenuOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (elevMenuRef.current?.contains(target) || elevBtnRef.current?.contains(target)) return;
      setElevMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setElevMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [elevMenuOpen]);
  useEffect(() => {
    if (expanded) setElevMenuOpen(false);
  }, [expanded]);

  const chooseElevation = (next: TerrainMode) => {
    setSourceOpen(false);
    setMode(next);
    setElevMenuOpen(false);
  };

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
              className="map-seg-sat"
              aria-pressed={mode === 'off'}
              onClick={() => { setSourceOpen(false); setMode('off'); }}
            >
              Satellite
            </button>
            <button
              ref={elevBtnRef}
              type="button"
              className="map-seg-elev"
              aria-pressed={mode !== 'off'}
              aria-haspopup="menu"
              aria-expanded={elevMenuOpen}
              onClick={() => {
                const btn = elevBtnRef.current;
                if (btn) setElevMenuLeft(btn.offsetLeft);
                setElevMenuOpen((open) => !open);
              }}
            >
              {elevLabel}
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
        {!expanded && (
          <div className="map-seg map-seg-layers" role="group" aria-label="Layers">
            <button
              type="button"
              className="map-seg-canals"
              aria-pressed={showCanals}
              onClick={() => setShowCanals((on) => !on)}
            >
              <span className="map-canals-swatch" aria-hidden="true" />
              Canals
            </button>
            {hasOutline ? (
              <button
                type="button"
                className="map-seg-soils"
                aria-pressed={showSoils}
                onClick={() => setShowSoils((on) => !on)}
              >
                <span className="map-soils-swatch" aria-hidden="true" />
                Soils
              </button>
            ) : null}
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
      {elevMenuOpen && !expanded ? (
        <div ref={elevMenuRef} className="map-elev-menu" role="menu" aria-label="Elevation" style={{ left: elevMenuLeft }}>
          <button type="button" role="menuitemradio" aria-checked={mode === 'colorshade'} onClick={() => chooseElevation('colorshade')}>
            Color
          </button>
          <button type="button" role="menuitemradio" aria-checked={mode === 'shade'} onClick={() => chooseElevation('shade')}>
            Gray
          </button>
        </div>
      ) : null}
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
            <>
            <ElevationOverlay
              mode={mode}
              clipTo={paintBoundaries}
              scaleTo={boundaries}
              onFieldRange={setRange}
              samplerRef={samplerRef}
              onSamplerChange={() => setSamplerGen((n) => n + 1)}
            />
            <ElevationPins
              samplerRef={samplerRef}
              enabled={mode !== 'off'}
              pins={elevPins}
              setPins={setElevPins}
              generation={samplerGen}
            />
            </>
          )}
          <BoundaryLayer data={boundaries} selectedId={fieldId} />
          {showSoils ? <SoilsOverlay state={soils} boundaries={boundaries} /> : null}
          <CanalsOverlay show={showCanals} />
          <CooperativeGestures enabled={!expanded} />
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
          <FitBoundary boundaries={paintBoundaries} expanded={expanded} />
          <FollowSelection selectedId={selectedId} probes={probes} />
          <BindMap onMap={onMap} />
          <MapSizeSync expanded={expanded} />
        </MapContainer>
        {layerNotes.length ? <div className="map-canals-note">{layerNotes.join(' · ')}</div> : null}
      </div>
      <div
        className={`map-legend${mode === 'off' ? ' is-satellite' : ''}${mode === 'colorshade' ? ' is-color' : ''}${sourceOpen ? ' is-source-open' : ''}`}
        role={mode === 'colorshade' && lidar && phrase ? 'button' : undefined}
        tabIndex={mode === 'colorshade' && lidar && phrase ? 0 : undefined}
        onClick={() => {
          if (mode === 'colorshade' && lidar && phrase) setSourceOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          if (mode !== 'colorshade' || !lidar || !phrase) return;
          event.preventDefault();
          setSourceOpen((open) => !open);
        }}
      >
        {mode === 'off' ? <span className="map-legend-kind">Imagery · Google</span> : null}
        {phrase ? <span className="map-legend-kind">Elevation</span> : null}
        {mode === 'colorshade' && phrase ? <span className="map-legend-ramp" style={{ background: RAMP }} aria-hidden="true" /> : null}
        {phrase ? <span className="map-legend-range">{phrase}</span> : null}
        {mode !== 'off' && lidar ? <span className="map-legend-source">{lidar}</span> : null}
      </div>
      {mode !== 'off' && hasOutline ? (
        <label className="map-elev-buffer-strip">
          <input
            type="checkbox"
            checked={showOutside}
            onChange={(event) => setShowOutside(event.target.checked)}
          />
          Show outside field
        </label>
      ) : null}
      {elevPins.a ? (
        <div className="map-elev-pins-strip">
          <span className="map-elev-pins-text">{formatPinStrip(elevPins.a, elevPins.b)}</span>
          <button type="button" className="map-elev-pins-clear" onClick={() => setElevPins({ a: null, b: null })}>
            Clear
          </button>
        </div>
      ) : null}
      {showSoils && hasOutline ? (
        <div className="map-soils-legend" aria-live="polite">
          {soils.status === 'loading' ? <p className="map-soils-status">Loading soils…</p> : null}
          {soils.status === 'error' ? <p className="map-soils-status">Soil map isn’t available right now. The USDA soil service didn’t respond.</p> : null}
          {soils.status === 'ready' && soils.legend.length === 0 ? <p className="map-soils-status">No mapped soils found for this field.</p> : null}
          {soils.status === 'ready' && soils.legend.length > 0 ? (
            <ul className="map-soils-list">
              {soils.legend.map((row) => (
                <li key={row.mukey}>
                  <span className="map-soils-sym">{row.musym}</span>
                  <span className="map-soils-name">{row.muname}</span>
                  <span className="map-soils-share">{Math.max(1, Math.round(row.share * 100))}%</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
