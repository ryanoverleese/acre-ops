/**
 * Long-press-then-drag for the grower elevation pin.
 *
 * iOS Safari dropped the first version of this gesture for three reasons:
 * 1. Re-rendering the Leaflet icon (setState on "dragging" or each sampled
 *    elevation) replaced the touch target and cancelled the pointer stream.
 * 2. preventDefault() on pointerdown for touch suppressed later pointermove
 *    events on iOS. The touch path uses non-passive touchmove instead.
 * 3. A 10 px slop cancelled the hold timer as the finger settled, so the
 *    drag never armed. Movement during the hold does not cancel arming;
 *    a short tap is decided only on lift.
 *
 * Two-finger pan/pinch broke on that same build because a pin pointerdown
 * immediately added is-elev-pin-drag, and a standing non-passive
 * touchmove on the map container then preventDefault()'d every touch,
 * while the container also got touch-action: none. Those handlers now
 * attach only during a single-finger pin hold, bail out when a second
 * finger lands, and never change touch-action on the map.
 */

export const LONG_PRESS_MS = 400;
export const TAP_SLOP_PX = 12;

export type ElevPinGesture = {
  startX: number;
  startY: number;
  armed: boolean;
};

export function startElevPinGesture(x: number, y: number): ElevPinGesture {
  return { startX: x, startY: y, armed: false };
}

export function movementPx(gesture: ElevPinGesture, x: number, y: number): number {
  return Math.hypot(x - gesture.startX, y - gesture.startY);
}

/** Once the pin is claimed, finger jitter must not cancel the long-press timer. */
export function shouldCancelHoldOnMove(_gesture: ElevPinGesture, _x: number, _y: number): boolean {
  return false;
}

/** A short press that stayed close to the start is a tap (remove the pin). */
export function isElevPinTap(gesture: ElevPinGesture, x: number, y: number): boolean {
  return !gesture.armed && movementPx(gesture, x, y) <= TAP_SLOP_PX;
}

/**
 * Lock scrolling on iOS Safari while the elevation-pin toggle is on.
 * overflow:hidden alone still rubber-bands; position:fixed on body does not.
 * Returns an unlock function that restores the prior scroll offset.
 */
export function lockPageScroll(): () => void {
  const html = document.documentElement;
  const body = document.body;
  const y = window.scrollY;
  html.classList.add('elev-pin-scroll-lock');
  body.classList.add('elev-pin-scroll-lock');
  body.style.top = `-${y}px`;
  return () => {
    html.classList.remove('elev-pin-scroll-lock');
    body.classList.remove('elev-pin-scroll-lock');
    body.style.top = '';
    window.scrollTo(0, y);
  };
}
