'use client';

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { ElevationSampler } from '@/components/ElevationOverlay';
import {
  isElevPinTap,
  LONG_PRESS_MS,
  shouldCancelHoldOnMove,
  startElevPinGesture,
  type ElevPinGesture,
} from '@/lib/terrain/elev-pin-gesture';
import { formatPointFeet, type ElevPoint } from '@/lib/terrain/sample-elev';

const DRAG_CLASS = 'is-elev-pin-drag';
const MODE_CLASS = 'is-elev-pin-mode';

function pinIcon(meters: number | null) {
  const label = meters != null ? formatPointFeet(meters) : '…';
  const safe = label.replace(/[<>&"]/g, '');
  return L.divIcon({
    className: 'elev-pin',
    html: `<div class="elev-pin-hit" data-elev-pin="1"><span class="elev-pin-chip"><span class="elev-pin-dot"></span><span class="elev-pin-label">${safe}</span><span class="elev-pin-remove" aria-label="Remove pin">×</span></span></div>`,
    iconSize: [120, 44],
    iconAnchor: [10, 22],
  });
}

function paintPin(marker: L.Marker | null, meters: number | null, dragging: boolean) {
  const el = marker?.getElement();
  if (!el) return;
  const label = el.querySelector('.elev-pin-label');
  if (label) label.textContent = meters != null ? formatPointFeet(meters) : '…';
  el.classList.toggle('is-dragging', dragging);
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
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const markerRef = useRef<L.Marker | null>(null);
  const ignoreClick = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRaf = useRef<number | null>(null);
  const pending = useRef<{ lat: number; lng: number } | null>(null);
  const restoreDrag = useRef<boolean | null>(null);
  const gesture = useRef<ElevPinGesture | null>(null);
  const touchId = useRef<number | null>(null);
  const pointerId = useRef<number | null>(null);

  const sample = (lat: number, lng: number) => samplerRef.current?.sample(lat, lng) ?? null;

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
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
    if (!generation || gesture.current) return;
    setPin((prev) => {
      if (!prev) return prev;
      const meters = sample(prev.lat, prev.lng);
      if (meters == null || meters === prev.meters) return prev;
      return { ...prev, meters };
    });
  }, [generation, setPin]);

  useEffect(() => {
    const container = map.getContainer();
    container.classList.toggle(MODE_CLASS, enabled);
    return () => {
      container.classList.remove(MODE_CLASS);
    };
  }, [map, enabled]);

  // Touch owns the iPhone path. Pointer (mouse/pen only) owns desktop drag.
  // Two-finger pan/pinch is always left to Leaflet: we never preventDefault
  // or stopPropagation when more than one finger is down, and we never leave
  // a standing non-passive touchmove on the map container (that broke pinch
  // on the live 19e74ad build).
  useEffect(() => {
    const container = map.getContainer();

    const hitPin = (target: EventTarget | null) =>
      (target as HTMLElement | null)?.closest('[data-elev-pin]');

    const clientToLatLng = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      return map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
    };

    const applyPending = () => {
      dragRaf.current = null;
      const next = pending.current;
      if (!next) return;
      const meters = sample(next.lat, next.lng);
      const live = { lat: next.lat, lng: next.lng, meters };
      pinRef.current = live;
      markerRef.current?.setLatLng([live.lat, live.lng]);
      paintPin(markerRef.current, meters, true);
    };

    const movePin = (lat: number, lng: number) => {
      pending.current = { lat, lng };
      if (dragRaf.current == null) {
        dragRaf.current = requestAnimationFrame(applyPending);
      }
    };

    const detachGestureListeners = () => {
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchEnd, true);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };

    const endPinDrag = (commit: ElevPoint | null | 'keep' = 'keep') => {
      clearHold();
      if (dragRaf.current != null) {
        cancelAnimationFrame(dragRaf.current);
        dragRaf.current = null;
      }
      pending.current = null;
      gesture.current = null;
      touchId.current = null;
      const captured = pointerId.current;
      pointerId.current = null;
      detachGestureListeners();
      if (captured != null) {
        try {
          if (container.hasPointerCapture?.(captured)) container.releasePointerCapture(captured);
        } catch {
          // Capture may already have been released.
        }
      }
      paintPin(markerRef.current, pinRef.current?.meters ?? null, false);
      container.classList.remove(DRAG_CLASS);
      if (restoreDrag.current === true && !map.dragging.enabled()) map.dragging.enable();
      restoreDrag.current = null;
      if (commit !== 'keep') setPin(commit);
    };

    const beginHold = (clientX: number, clientY: number) => {
      gesture.current = startElevPinGesture(clientX, clientY);
      restoreDrag.current = map.dragging.enabled();
      if (map.dragging.enabled()) map.dragging.disable();
      // Class is only for cursor/pin styling — not touch-action on the map.
      container.classList.add(DRAG_CLASS);
      clearHold();
      holdTimer.current = setTimeout(() => {
        if (!gesture.current) return;
        gesture.current.armed = true;
        paintPin(markerRef.current, pinRef.current?.meters ?? null, true);
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!gesture.current) return;
      // Two-finger pan/pinch must reach Leaflet unblocked.
      if (event.touches.length >= 2) {
        endPinDrag(pinRef.current ?? 'keep');
        return;
      }
      const touch = [...event.touches, ...event.changedTouches].find((item) => item.identifier === touchId.current);
      if (!touch) return;
      const active = gesture.current;
      if (!active.armed) {
        if (shouldCancelHoldOnMove(active, touch.clientX, touch.clientY)) clearHold();
        return;
      }
      event.preventDefault();
      const ll = clientToLatLng(touch.clientX, touch.clientY);
      movePin(ll.lat, ll.lng);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!gesture.current || touchId.current == null) return;
      if (event.touches.length >= 2) {
        endPinDrag(pinRef.current ?? 'keep');
        return;
      }
      const touch = [...event.changedTouches].find((item) => item.identifier === touchId.current);
      if (!touch) return;
      ignoreClick.current = Date.now() + 400;
      if (isElevPinTap(gesture.current, touch.clientX, touch.clientY)) {
        endPinDrag(null);
        return;
      }
      endPinDrag(gesture.current.armed ? (pinRef.current ?? 'keep') : 'keep');
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        if (gesture.current) endPinDrag(pinRef.current ?? 'keep');
        return;
      }
      if (!hitPin(event.target)) return;
      const touch = event.changedTouches[0];
      touchId.current = touch.identifier;
      pointerId.current = null;
      beginHold(touch.clientX, touch.clientY);
      // Attach only for this single-finger pin gesture. Never leave a
      // non-passive touchmove on the map container.
      document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
      document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: false });
    };

    const onPointerMove = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active || event.pointerId !== pointerId.current) return;
      if (!active.armed) {
        if (shouldCancelHoldOnMove(active, event.clientX, event.clientY)) clearHold();
        return;
      }
      event.preventDefault();
      const ll = clientToLatLng(event.clientX, event.clientY);
      movePin(ll.lat, ll.lng);
    };

    const onPointerUp = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active || event.pointerId !== pointerId.current) return;
      ignoreClick.current = Date.now() + 400;
      if (isElevPinTap(active, event.clientX, event.clientY)) {
        endPinDrag(null);
        return;
      }
      endPinDrag(active.armed ? (pinRef.current ?? 'keep') : 'keep');
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      if (!hitPin(event.target)) return;
      event.stopPropagation();
      pointerId.current = event.pointerId;
      touchId.current = null;
      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        // Older browsers still get the document listeners below.
      }
      beginHold(event.clientX, event.clientY);
      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('pointerdown', onPointerDown);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('pointerdown', onPointerDown);
      endPinDrag();
    };
  }, [map, setPin]);

  if (!pin) return null;

  return (
    <Marker
      ref={markerRef}
      position={[pin.lat, pin.lng]}
      icon={pinIcon(pin.meters)}
      zIndexOffset={600}
      interactive={false}
      keyboard={false}
      eventHandlers={{
        click: (event) => {
          L.DomEvent.stop(event);
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
        },
      }}
    />
  );
}
