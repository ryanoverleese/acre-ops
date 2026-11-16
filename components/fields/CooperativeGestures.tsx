'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';

const HINT_MS = 1400;

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function prefersTouch() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/**
 * Cooperative gestures for an embedded Leaflet map, like Google Maps on a web page:
 * - Mouse wheel / trackpad scroll scrolls the page; Ctrl (⌘ on Mac) + scroll, or a
 *   trackpad pinch, zooms the map. Mouse click-drag still pans.
 * - Touch: one finger scrolls the page; two fingers pan and zoom the map.
 * A short hint explains this when someone tries the blocked gesture.
 * Turn off (`enabled={false}`) in full screen to restore normal map gestures.
 */
export default function CooperativeGestures({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHint(null);
      return;
    }
    const container = map.getContainer();
    const show = (text: string) => {
      setHint(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setHint(null), HINT_MS);
    };
    const zoomKey = isMac() ? '⌘' : 'Ctrl';

    // Plain wheel: let the page scroll and keep it away from Leaflet's wheel zoom.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        setHint(null);
        return;
      }
      event.stopPropagation();
      show(`Use ${zoomKey} + scroll to zoom the map`);
    };

    // Touch: one-finger drag is handed to the page (Leaflet drag off, CSS allows pan);
    // two-finger pinch/move is Leaflet's touch zoom, which also pans.
    const touchFirst = prefersTouch();
    if (touchFirst) map.dragging.disable();
    const onTouchStart = () => {
      if (map.dragging.enabled()) map.dragging.disable();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1) show('Use two fingers to move the map');
      else setHint(null);
    };
    // A real mouse brings click-drag panning back (hybrid laptops).
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && !map.dragging.enabled()) map.dragging.enable();
    };

    container.addEventListener('wheel', onWheel, { capture: true, passive: true });
    container.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    container.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => {
      container.removeEventListener('wheel', onWheel, { capture: true });
      container.removeEventListener('touchstart', onTouchStart, { capture: true });
      container.removeEventListener('touchmove', onTouchMove, { capture: true });
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      if (timer.current) clearTimeout(timer.current);
      if (!map.dragging.enabled()) map.dragging.enable();
    };
  }, [enabled, map]);

  if (!enabled) return null;
  return createPortal(
    <div className={`map-gesture-hint${hint ? ' is-visible' : ''}`} aria-live="polite">
      {hint ? <span>{hint}</span> : null}
    </div>,
    map.getContainer(),
  );
}

