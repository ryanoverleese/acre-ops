/**
 * Elevation-pin gestures when the "Elevation pin" switch is on:
 * - A single-finger touch that starts on the map places or drags the pin.
 *   preventDefault runs only on that one-finger stream, so the page does
 *   not scroll from it. Two fingers always pan and pinch the map — the
 *   pin gesture is aborted and nothing is preventDefaulted.
 * - Touches that start outside the map scroll the page normally.
 * - There is no body scroll lock and no auto-scroll.
 * - On a phone, the sampled point is offset above the finger so the pin
 *   tip stays visible. Mouse drags use the cursor point, with no offset.
 * - Mouse: a click places or moves the pin; a drag that starts on the pin
 *   moves it. Click-drag on the empty map still pans.
 *
 * Do not leave a standing non-passive touchmove on the map, and never set
 * touch-action: none on the map container (that broke two-finger pan/zoom).
 */

/** Lift the sample point above a finger pad so the tip is not covered. */
export const TOUCH_DRAG_OFFSET_PX = 36;

export function pointWithTouchOffset(
  clientX: number,
  clientY: number,
  isTouch: boolean,
): { x: number; y: number } {
  return { x: clientX, y: isTouch ? clientY - TOUCH_DRAG_OFFSET_PX : clientY };
}
