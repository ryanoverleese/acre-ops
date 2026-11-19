'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import {
  buildLowSpots,
  drawLowSpotsFromAnalysis,
  ensureLowSpotsPane,
  DEFAULT_LOWSPOTS_SLIDERS,
  type LowSpotsAnalysis,
  type LowSpotsSliders,
  type LowSpotsStatus,
} from '@/lib/terrain/lowspots-layer';

/** Margin around the field so water coming in from next door shows. */
const FIELD_PAD = 0.2;

function fieldBounds(data: FieldBoundaryCollection | null | undefined): L.LatLngBounds | null {
  const pts: L.LatLng[] = [];
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      pts.push(L.latLng(coords[1] as number, coords[0] as number));
      return;
    }
    for (const c of coords) walk(c);
  };
  for (const f of data?.features ?? []) walk(f.geometry?.coordinates);
  if (pts.length < 2) return null;
  const b = L.latLngBounds(pts);
  return b.isValid() ? b.pad(FIELD_PAD) : null;
}

type Cached = { analysis: LowSpotsAnalysis; bbox: [number, number, number, number] };

/**
 * Low spots and flow paths for one field, from the 3DEP DEM over the
 * field's box. Computed in the browser; nothing is stored.
 */
export default function LowSpotsOverlay({
  show,
  boundaries,
  onStatus,
  sliders = DEFAULT_LOWSPOTS_SLIDERS,
}: {
  show: boolean;
  boundaries: FieldBoundaryCollection;
  onStatus?: (status: LowSpotsStatus) => void;
  sliders?: LowSpotsSliders;
}) {
  const map = useMap();
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const bounds = useMemo(() => fieldBounds(boundaries), [boundaries]);
  // Rerun only when the box changes, not on every new boundaries object.
  const key = bounds ? bounds.toBBoxString() : '';
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const slidersRef = useRef(sliders);
  slidersRef.current = sliders;
  const cacheRef = useRef<Cached | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);

  const paint = () => {
    groupRef.current?.remove();
    groupRef.current = null;
    const cached = cacheRef.current;
    if (!cached) return;
    const group = drawLowSpotsFromAnalysis(cached.analysis, cached.bbox, slidersRef.current);
    group.addTo(map);
    groupRef.current = group;
  };

  useEffect(() => {
    const setStatus = (s: LowSpotsStatus) => onStatusRef.current?.(s);
    const bounds = boundsRef.current;
    cacheRef.current = null;
    groupRef.current?.remove();
    groupRef.current = null;
    if (!show || !bounds) {
      setStatus('off');
      return;
    }
    ensureLowSpotsPane(map);
    const ac = new AbortController();
    let dead = false;
    setStatus('loading');
    buildLowSpots(bounds, ac.signal, slidersRef.current)
      .then((run) => {
        if (dead) return;
        if (run.analysis && run.bbox) cacheRef.current = { analysis: run.analysis, bbox: run.bbox };
        paint();
        setStatus(run.status);
      })
      .catch((err) => {
        if (dead || err?.name === 'AbortError') return;
        setStatus('error');
      });
    return () => {
      dead = true;
      ac.abort();
      cacheRef.current = null;
      groupRef.current?.remove();
      groupRef.current = null;
    };
  }, [map, show, key]);

  useEffect(() => {
    slidersRef.current = sliders;
    if (!cacheRef.current) return;
    paint();
  }, [sliders.lowSpots, sliders.drainage, map]);

  return null;
}
