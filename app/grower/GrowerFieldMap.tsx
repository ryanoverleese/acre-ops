'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import BoundaryLayer from '@/components/BoundaryLayer';
import ElevationOverlay from '@/components/ElevationOverlay';
import { MapFullscreenButton, MapSizeSync, useMapFullscreen } from '@/components/MapFullscreen';
import TerrainControl from '@/components/TerrainControl';
import { compareProbePinOrder, probePinText } from '@/lib/probe-pin-label';
import { useLidarLabel } from '@/components/useLidarLabel';
import type { ElevRange } from '@/lib/terrain/color-scale';
import { FIELD_MAP_ZOOM } from '@/lib/terrain/field-map-zoom';
import { fieldInteriorPoint } from '@/lib/terrain/lidar-source';
import { DEFAULT_TERRAIN_MODE, type TerrainMode } from '@/lib/terrain/modes';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import type { GrowerProbePin } from '@/lib/supabase/grower-fields';

const SAT_URL = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
const GOOGLE_ATTR = '&copy; Google';
const NEBRASKA_FALLBACK: [number, number] = [41.5, -99.5];

function probeIcon(label: string) {
  const text = label.replace(/[<>&"]/g, '');
  // 44×44 hit target for finger taps; visible dot stays visually smaller via CSS.
  return L.divIcon({
    className: 'grower-probe-pin',
    html: `<div class="grower-probe-pin-hit"><div class="grower-probe-pin-dot">${text}</div></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
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
    const fit = () => {
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
    };
    fit();
    // Leaflet can mount before the wide desktop shell finishes layout.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => fit())
      : null;
    const container = map.getContainer();
    ro?.observe(container);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
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
  const [elevRange, setElevRange] = useState<ElevRange | null>(null);
  const { rootRef, expanded, cssFallback, toggle } = useMapFullscreen();
  const orderedProbes = useMemo(
    () => probes.slice().sort(compareProbePinOrder),
    [probes],
  );
  const hasOutline = boundaries.features.length > 0;
  const sourcePoint = useMemo(
    () => fieldInteriorPoint(boundaries.features.map((feature) => feature.geometry?.coordinates), lat, lng),
    [boundaries, lat, lng],
  );
  const lidarLabel = useLidarLabel(sourcePoint?.lat ?? null, sourcePoint?.lng ?? null);
  const center: [number, number] =
    lat != null && lng != null ? [lat, lng] : NEBRASKA_FALLBACK;

  return (
    <div
      ref={rootRef}
      className={`grower-map${expanded ? ' is-map-expanded' : ''}${cssFallback ? ' is-map-css-fullscreen' : ''}`}
    >
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
          <ElevationOverlay mode={terrainMode} clipTo={boundaries} onFieldRange={setElevRange} />
        )}
        <BoundaryLayer data={boundaries} selectedId={fieldId} />
        {orderedProbes
          .filter((probe) => probe.lat != null && probe.lng != null)
          .map((probe) => (
          <Marker
            key={probe.id}
            position={[probe.lat as number, probe.lng as number]}
            icon={probeIcon(probePinText(probe))}
            interactive={false}
          />
        ))}
        <Fit fieldLat={lat} fieldLng={lng} boundaries={boundaries} probes={orderedProbes} />
        <MapSizeSync expanded={expanded} />
      </MapContainer>
      <MapFullscreenButton expanded={expanded} onClick={toggle} />
      {hasOutline && (
        <TerrainControl
          // Keep base .terrain-control positioning (top/left). grower-map-terrain
          // alone omitted those rules, so the control sat below the map and was
          // clipped by .grower-map-wrap { overflow: hidden }.
          className="terrain-control grower-map-terrain"
          value={terrainMode}
          onChange={setTerrainMode}
          range={elevRange}
          sourceLabel={lidarLabel}
        />
      )}
    </div>
  );
}
