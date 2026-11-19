'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import {
  buildLowSpots,
  ensureLowSpotsPane,
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

/**
 * Low spots and flow paths for one field, from the 3DEP DEM over the
 * field's box. Computed in the browser; nothing is stored.
 */
export default function LowSpotsOverlay({
  show,
  boundaries,
  onStatus,
}: {
  show: boolean;
  boundaries: FieldBoundaryCollection;
  onStatus?: (status: LowSpotsStatus) => void;
}) {
  const map = useMap();
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const bounds = useMemo(() => fieldBounds(boundaries), [boundaries]);
  // Rerun only when the box changes, not on every new boundaries object.
  const key = bounds ? bounds.toBBoxString() : '';
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  useEffect(() => {
    const setStatus = (s: LowSpotsStatus) => onStatusRef.current?.(s);
    const bounds = boundsRef.current;
    if (!show || !bounds) {
      setStatus('off');
      return;
    }
    ensureLowSpotsPane(map);
    const ac = new AbortController();
    let group: L.LayerGroup | null = null;
    let dead = false;
    setStatus('loading');
    buildLowSpots(bounds, ac.signal)
      .then((run) => {
        if (dead) return;
        group = run.group;
        group?.addTo(map);
        setStatus(run.status);
      })
      .catch((err) => {
        if (dead || err?.name === 'AbortError') return;
        setStatus('error');
      });
    return () => {
      dead = true;
      ac.abort();
      group?.remove();
    };
  }, [map, show, key]);

  return null;
}
