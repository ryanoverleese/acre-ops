'use client';

import { useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { ElevationSampler } from '@/components/ElevationOverlay';
import { pointWithTouchOffset } from '@/lib/terrain/elev-pin-gesture';
import { formatPointFeet, type ElevPoint } from '@/lib/terrain/sample-elev';

const DRAG_CLASS = 'is-elev-pin-drag';
const MODE_CLASS = 'is-elev-pin-mode';

const PIN_SVG =
  '<svg class="elev-pin-mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">'
  + '<g fill="none" stroke="#fff" stroke-width="2.75" stroke-linecap="square">'
  + '<line x1="16" y1="1.5" x2="16" y2="11.5"/>'
  + '<line x1="16" y1="20.5" x2="16" y2="30.5"/>'
  + '<line x1="1.5" y1="16" x2="11.5" y2="16"/>'
  + '<line x1="20.5" y1="16" x2="30.5" y2="16"/>'
  + '</g>'
  + '<g fill="none" stroke="#1A1A1A" stroke-width="1.25" stroke-linecap="square">'
  + '<line x1="16" y1="1.5" x2="16" y2="11.5"/>'
  + '<line x1="16" y1="20.5" x2="16" y2="30.5"/>'
  + '<line x1="1.5" y1="16" x2="11.5" y2="16"/>'
  + '<line x1="20.5" y1="16" x2="30.5" y2="16"/>'
  + '</g>'
  + '<circle cx="16" cy="16" r="2.1" fill="#fff"/>'
  + '<circle cx="16" cy="16" r="1.15" fill="#1A1A1A"/>'
  + '</svg>';

function pinIcon() {
  return L.divIcon({
    className: 'elev-pin',
    html: `<div class="elev-pin-hit" data-elev-pin="1">${PIN_SVG}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

function paintDragging(marker: L.Marker | null, dragging: boolean) {
  marker?.getElement()?.classList.toggle('is-dragging', dragging);
}

function paintReadout(el: HTMLElement | null, meters: number | null) {
  if (!el) return;
  el.textContent = meters != null ? formatPointFeet(meters) : '…';
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
  const icon = useMemo(() => pinIcon(), []);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const markerRef = useRef<L.Marker | null>(null);
  const readoutValueRef = useRef<HTMLSpanElement | null>(null);
  const ignoreClick = useRef(0);
  const dragRaf = useRef<number | null>(null);
  const pending = useRef<{ lat: number; lng: number } | null>(null);
  const restoreDrag = useRef<boolean | null>(null);
  const touchId = useRef<number | null>(null);
  const pointerId = useRef<number | null>(null);
  const startPin = useRef<ElevPoint | null>(null);
  const dragging = useRef(false);

  const sample = (lat: number, lng: number) => samplerRef.current?.sample(lat, lng) ?? null;

  const clientToLatLng = (clientX: number, clientY: number, isTouch: boolean) => {
    const { x, y } = pointWithTouchOffset(clientX, clientY, isTouch);
    const rect = map.getContainer().getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, x - rect.left));
    const py = Math.max(0, Math.min(rect.height, y - rect.top));
    return map.containerPointToLatLng(L.point(px, py));
  };

  const applyLive = (lat: number, lng: number) => {
    const meters = sample(lat, lng);
    const live = { lat, lng, meters };
    pinRef.current = live;
    markerRef.current?.setLatLng([lat, lng]);
    paintReadout(readoutValueRef.current, meters);
    return live;
  };

  const applyPending = () => {
    dragRaf.current = null;
    const next = pending.current;
    if (!next) return;
    applyLive(next.lat, next.lng);
  };

  const movePin = (lat: number, lng: number) => {
    pending.current = { lat, lng };
    if (dragRaf.current == null) {
      dragRaf.current = requestAnimationFrame(applyPending);
    }
  };

  // A click on the empty map places the pin, or moves it if one is already down.
  useEffect(() => {
    const onClick = (event: L.LeafletMouseEvent) => {
      if (Date.now() < ignoreClick.current) return;
      if (!enabledRef.current) return;
      const target = event.originalEvent?.target as HTMLElement | null;
      if (target?.closest('.elev-pin, .field-pin-icon, .elev-pin-hit, .map-elev-readout')) return;
      const { lat, lng } = event.latlng;
      setPin({ lat, lng, meters: sample(lat, lng) });
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, setPin]);

  useEffect(() => {
    if (!generation || dragging.current) return;
    setPin((prev) => {
      if (!prev) return prev;
      const meters = sample(prev.lat, prev.lng);
      if (meters == null || meters === prev.meters) return prev;
      paintReadout(readoutValueRef.current, meters);
      return { ...prev, meters };
    });
  }, [generation, setPin]);

  // Touch owns the iPhone path. Pointer (mouse/pen only) owns desktop drag
  // that starts on the pin. Two-finger pan/pinch is never preventDefaulted.
  useEffect(() => {
    const container = map.getContainer();
    container.classList.toggle(MODE_CLASS, enabled);
    if (!enabled) {
      container.classList.remove(DRAG_CLASS);
      return () => {
        container.classList.remove(MODE_CLASS, DRAG_CLASS);
      };
    }

    const hit = (target: EventTarget | null, selector: string) =>
      (target as HTMLElement | null)?.closest(selector);

    const endSession = (commit: ElevPoint | null | 'keep' | 'revert') => {
      if (dragRaf.current != null) {
        cancelAnimationFrame(dragRaf.current);
        dragRaf.current = null;
      }
      pending.current = null;
      dragging.current = false;
      touchId.current = null;
      const captured = pointerId.current;
      pointerId.current = null;
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onTouchEnd, true);
      document.removeEventListener('touchcancel', onTouchEnd, true);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      if (captured != null) {
        try {
          if (container.hasPointerCapture?.(captured)) container.releasePointerCapture(captured);
        } catch {
          // Capture may already have been released.
        }
      }
      paintDragging(markerRef.current, false);
      container.classList.remove(DRAG_CLASS);
      if (restoreDrag.current === true && !map.dragging.enabled()) map.dragging.enable();
      restoreDrag.current = null;
      if (commit === 'revert') {
        const origin = startPin.current;
        startPin.current = null;
        if (origin) {
          pinRef.current = origin;
          markerRef.current?.setLatLng([origin.lat, origin.lng]);
          paintReadout(readoutValueRef.current, origin.meters);
          setPin(origin);
        } else {
          pinRef.current = null;
          setPin(null);
        }
        return;
      }
      startPin.current = null;
      if (commit !== 'keep') setPin(commit);
    };

    const beginSession = () => {
      startPin.current = pinRef.current;
      dragging.current = true;
      restoreDrag.current = map.dragging.enabled();
      if (map.dragging.enabled()) map.dragging.disable();
      container.classList.add(DRAG_CLASS);
      paintDragging(markerRef.current, true);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (touchId.current == null) return;
      if (event.touches.length >= 2) {
        endSession('revert');
        return;
      }
      const touch = [...event.touches, ...event.changedTouches].find((item) => item.identifier === touchId.current);
      if (!touch) return;
      event.preventDefault();
      const ll = clientToLatLng(touch.clientX, touch.clientY, true);
      movePin(ll.lat, ll.lng);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (touchId.current == null) return;
      if (event.touches.length >= 2) {
        endSession('revert');
        return;
      }
      const touch = [...event.changedTouches].find((item) => item.identifier === touchId.current);
      if (!touch) return;
      ignoreClick.current = Date.now() + 400;
      const ll = clientToLatLng(touch.clientX, touch.clientY, true);
      endSession(applyLive(ll.lat, ll.lng));
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        if (touchId.current != null) endSession('revert');
        return;
      }
      if (hit(event.target, '.map-elev-readout, .field-pin-icon')) return;
      const touch = event.changedTouches[0];
      touchId.current = touch.identifier;
      pointerId.current = null;
      beginSession();
      const ll = clientToLatLng(touch.clientX, touch.clientY, true);
      const live = applyLive(ll.lat, ll.lng);
      if (!markerRef.current) setPin(live);
      document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
      document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: false });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId.current) return;
      event.preventDefault();
      const ll = clientToLatLng(event.clientX, event.clientY, false);
      movePin(ll.lat, ll.lng);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId.current) return;
      ignoreClick.current = Date.now() + 400;
      const ll = clientToLatLng(event.clientX, event.clientY, false);
      endSession(applyLive(ll.lat, ll.lng));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      if (!hit(event.target, '[data-elev-pin]')) return;
      event.stopPropagation();
      pointerId.current = event.pointerId;
      touchId.current = null;
      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        // Older browsers still get the document listeners below.
      }
      beginSession();
      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('pointerdown', onPointerDown);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('pointerdown', onPointerDown);
      endSession('keep');
      container.classList.remove(MODE_CLASS, DRAG_CLASS);
    };
  }, [enabled, map, setPin]);

  const readout = pin ? (
    <div
      className="map-elev-readout"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="map-elev-readout-value" ref={readoutValueRef}>
        {pin.meters != null ? formatPointFeet(pin.meters) : '…'}
      </span>
      <button
        type="button"
        className="map-elev-readout-remove"
        aria-label="Remove pin"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          ignoreClick.current = Date.now() + 400;
          setPin(null);
        }}
      >
        ×
      </button>
    </div>
  ) : null;

  return (
    <>
      {pin ? (
        <Marker
          ref={markerRef}
          position={[pin.lat, pin.lng]}
          icon={icon}
          zIndexOffset={600}
          interactive={false}
          keyboard={false}
        />
      ) : null}
      {readout ? createPortal(readout, map.getContainer()) : null}
    </>
  );
}
