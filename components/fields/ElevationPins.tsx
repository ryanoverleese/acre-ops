'use client';

import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { ElevationSampler } from '@/components/ElevationOverlay';
import { removeElevPin } from '@/lib/terrain/field-buffer';
import { formatPointFeet, type ElevPoint } from '@/lib/terrain/sample-elev';

export type ElevPinPair = { a: ElevPoint | null; b: ElevPoint | null };

const LONG_PRESS_MS = 450;
const SLOP_PX = 10;
const DRAG_CLASS = 'is-elev-pin-drag';

function pinIcon(id: 'A' | 'B', meters: number | null, dragging: boolean) {
  const elev = meters != null ? formatPointFeet(meters) : '…';
  const label = elev ? `${id} ${elev}` : id;
  const safe = label.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: `elev-pin${dragging ? ' is-dragging' : ''}`,
    html: `<div class="elev-pin-hit" data-elev-pin="${id}"><span class="elev-pin-dot"></span><span class="elev-pin-label">${safe}</span><span class="elev-pin-remove" aria-label="Remove ${id}">×</span></div>`,
    iconSize: [200, 44],
    iconAnchor: [10, 22],
  });
}

function placeNext(prev: ElevPinPair, next: ElevPoint): ElevPinPair {
  if (!prev.a || (prev.a && prev.b)) return { a: next, b: null };
  return { a: prev.a, b: next };
}

export default function ElevationPins({
  samplerRef,
  enabled,
  pins,
  setPins,
  generation,
}: {
  samplerRef: MutableRefObject<ElevationSampler | null>;
  enabled: boolean;
  pins: ElevPinPair;
  setPins: Dispatch<SetStateAction<ElevPinPair>>;
  /** Bumps when the DEM sample becomes available so placed pins can refresh. */
  generation: number;
}) {
  const map = useMap();
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const ignoreClick = useRef(0);
  const draggingId = useRef<'A' | 'B' | null>(null);
  const [activeDrag, setActiveDrag] = useState<'A' | 'B' | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRaf = useRef<number | null>(null);
  const pending = useRef<{ id: 'A' | 'B'; lat: number; lng: number } | null>(null);
  const restoreDrag = useRef<boolean | null>(null);

  const sample = (lat: number, lng: number) => samplerRef.current?.sample(lat, lng) ?? null;

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const endPinDrag = () => {
    clearHold();
    if (dragRaf.current != null) {
      cancelAnimationFrame(dragRaf.current);
      dragRaf.current = null;
    }
    pending.current = null;
    draggingId.current = null;
    setActiveDrag(null);
    map.getContainer().classList.remove(DRAG_CLASS);
    if (restoreDrag.current === true && !map.dragging.enabled()) map.dragging.enable();
    restoreDrag.current = null;
  };

  const applyPending = () => {
    dragRaf.current = null;
    const next = pending.current;
    if (!next) return;
    const meters = sample(next.lat, next.lng);
    setPins((prev) => {
      const point: ElevPoint = { lat: next.lat, lng: next.lng, meters };
      if (next.id === 'A') return { ...prev, a: point };
      return { ...prev, b: point };
    });
  };

  const movePin = (id: 'A' | 'B', lat: number, lng: number) => {
    pending.current = { id, lat, lng };
    if (dragRaf.current == null) {
      dragRaf.current = requestAnimationFrame(applyPending);
    }
  };

  // Map tap places A, then B, then starts over. A tap after a pin drag is ignored.
  useEffect(() => {
    const onClick = (event: L.LeafletMouseEvent) => {
      if (Date.now() < ignoreClick.current) return;
      if (!enabledRef.current) return;
      const target = event.originalEvent?.target as HTMLElement | null;
      if (target?.closest('.elev-pin, .field-pin-icon, .elev-pin-hit')) return;
      const { lat, lng } = event.latlng;
      const next: ElevPoint = { lat, lng, meters: sample(lat, lng) };
      setPins((prev) => placeNext(prev, next));
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, setPins]);

  // Refresh labels once the field DEM (or a finer tile) is in memory.
  useEffect(() => {
    if (!generation) return;
    setPins((prev) => {
      const refresh = (pin: ElevPoint | null) => {
        if (!pin) return pin;
        const meters = sample(pin.lat, pin.lng);
        if (meters == null || meters === pin.meters) return pin;
        return { ...pin, meters };
      };
      const a = refresh(prev.a);
      const b = refresh(prev.b);
      return a === prev.a && b === prev.b ? prev : { a, b };
    });
  }, [generation, setPins]);

  // Long-press a pin, then drag it. Map pan and page scroll stay off while the pin moves.
  useEffect(() => {
    const container = map.getContainer();

    const pointerAt = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return map.containerPointToLatLng(
        L.point(event.clientX - rect.left, event.clientY - rect.top),
      );
    };

    const onDown = (event: PointerEvent) => {
      const hit = (event.target as HTMLElement | null)?.closest('[data-elev-pin]') as HTMLElement | null;
      if (!hit) return;
      const id = hit.getAttribute('data-elev-pin') === 'B' ? 'B' : 'A';
      event.stopPropagation();
      if (event.pointerType !== 'mouse') event.preventDefault();

      const startX = event.clientX;
      const startY = event.clientY;
      let armed = false;
      restoreDrag.current = map.dragging.enabled();
      if (map.dragging.enabled()) map.dragging.disable();
      container.classList.add(DRAG_CLASS);

      clearHold();
      holdTimer.current = setTimeout(() => {
        armed = true;
        draggingId.current = id;
        setActiveDrag(id);
      }, LONG_PRESS_MS);

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== event.pointerId) return;
        const dx = move.clientX - startX;
        const dy = move.clientY - startY;
        if (!armed) {
          if (dx * dx + dy * dy > SLOP_PX * SLOP_PX) clearHold();
          return;
        }
        move.preventDefault();
        const ll = pointerAt(move);
        movePin(id, ll.lat, ll.lng);
      };

      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== event.pointerId) return;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        const dx = up.clientX - startX;
        const dy = up.clientY - startY;
        const tapped = !armed && dx * dx + dy * dy <= SLOP_PX * SLOP_PX;
        ignoreClick.current = Date.now() + 400;
        endPinDrag();
        if (tapped) {
          setPins((prev) => removeElevPin(prev, id));
          return;
        }
        setPins((prev) => ({ ...prev }));
      };

      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    };

    // Keep one-finger page scroll from stealing a press on the pin.
    const onTouchMove = (event: TouchEvent) => {
      if (!container.classList.contains(DRAG_CLASS)) return;
      event.preventDefault();
    };

    container.addEventListener('pointerdown', onDown);
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('touchmove', onTouchMove);
      endPinDrag();
    };
  }, [map, setPins]);

  const a = pins.a;
  const b = pins.b;
  const line = a && b ? ([[a.lat, a.lng], [b.lat, b.lng]] as [number, number][]) : null;

  return (
    <>
      {line ? (
        <Polyline
          positions={line}
          pathOptions={{ color: '#1A1A1A', weight: 1.25, opacity: 0.7, interactive: false }}
        />
      ) : null}
      {a ? (
        <Marker
          position={[a.lat, a.lng]}
          icon={pinIcon('A', a.meters, activeDrag === 'A')}
          zIndexOffset={600}
          interactive
          eventHandlers={{
            click: (event) => {
              L.DomEvent.stop(event);
              if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
            },
          }}
        />
      ) : null}
      {b ? (
        <Marker
          position={[b.lat, b.lng]}
          icon={pinIcon('B', b.meters, activeDrag === 'B')}
          zIndexOffset={601}
          interactive
          eventHandlers={{
            click: (event) => {
              L.DomEvent.stop(event);
              if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
            },
          }}
        />
      ) : null}
    </>
  );
}
