'use client';

import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { ElevationSampler } from '@/components/ElevationOverlay';
import { formatPointFeet, type ElevPoint } from '@/lib/terrain/sample-elev';

const LONG_PRESS_MS = 450;
const SLOP_PX = 10;
const DRAG_CLASS = 'is-elev-pin-drag';

function pinIcon(meters: number | null, dragging: boolean) {
  const label = meters != null ? formatPointFeet(meters) : '…';
  const safe = label.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: `elev-pin${dragging ? ' is-dragging' : ''}`,
    html: `<div class="elev-pin-hit" data-elev-pin="1"><span class="elev-pin-dot"></span><span class="elev-pin-label">${safe}</span><span class="elev-pin-remove" aria-label="Remove pin">×</span></div>`,
    iconSize: [180, 44],
    iconAnchor: [10, 22],
  });
}

export default function ElevationPins({
  samplerRef,
  enabled,
  pin,
  setPin,
  generation,
}: {
  samplerRef: MutableRefObject<ElevationSampler | null>;
  enabled: boolean;
  pin: ElevPoint | null;
  setPin: Dispatch<SetStateAction<ElevPoint | null>>;
  /** Bumps when the DEM sample becomes available so a placed pin can refresh. */
  generation: number;
}) {
  const map = useMap();
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const ignoreClick = useRef(0);
  const [dragging, setDragging] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRaf = useRef<number | null>(null);
  const pending = useRef<{ lat: number; lng: number } | null>(null);
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
    setDragging(false);
    map.getContainer().classList.remove(DRAG_CLASS);
    if (restoreDrag.current === true && !map.dragging.enabled()) map.dragging.enable();
    restoreDrag.current = null;
  };

  const applyPending = () => {
    dragRaf.current = null;
    const next = pending.current;
    if (!next) return;
    const meters = sample(next.lat, next.lng);
    setPin({ lat: next.lat, lng: next.lng, meters });
  };

  const movePin = (lat: number, lng: number) => {
    pending.current = { lat, lng };
    if (dragRaf.current == null) {
      dragRaf.current = requestAnimationFrame(applyPending);
    }
  };

  // A tap places the pin, or moves it if one is already down.
  useEffect(() => {
    const onClick = (event: L.LeafletMouseEvent) => {
      if (Date.now() < ignoreClick.current) return;
      if (!enabledRef.current) return;
      const target = event.originalEvent?.target as HTMLElement | null;
      if (target?.closest('.elev-pin, .field-pin-icon, .elev-pin-hit')) return;
      const { lat, lng } = event.latlng;
      setPin({ lat, lng, meters: sample(lat, lng) });
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, setPin]);

  // Refresh the label once the field DEM (or a finer tile) is in memory.
  useEffect(() => {
    if (!generation) return;
    setPin((prev) => {
      if (!prev) return prev;
      const meters = sample(prev.lat, prev.lng);
      if (meters == null || meters === prev.meters) return prev;
      return { ...prev, meters };
    });
  }, [generation, setPin]);

  // Long-press the pin, then drag it. A short tap, or the × on the label, removes it.
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
        setDragging(true);
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
        movePin(ll.lat, ll.lng);
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
          setPin(null);
          return;
        }
      };

      document.addEventListener('pointermove', onMove, { passive: false });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    };

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
  }, [map, setPin]);

  if (!pin) return null;

  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={pinIcon(pin.meters, dragging)}
      zIndexOffset={600}
      interactive
      eventHandlers={{
        click: (event) => {
          L.DomEvent.stop(event);
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        },
      }}
    />
  );
}
