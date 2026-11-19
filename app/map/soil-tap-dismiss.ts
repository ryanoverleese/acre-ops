/**
 * Soil popups close on the next tap and stay closed.
 *
 * Leaflet can close the open popup on preclick, then the following click would
 * reopen the soil under the cursor. We remember that a soil popup was open and
 * skip that reopen. We also close on pointerdown / touchstart, because preclick
 * often never fires on a phone tap, and because Leaflet's own preclick close
 * can run first and would otherwise clear the flag before we can arm it.
 *
 * Field and canal popups are left alone.
 */

export const SOIL_POPUP_OPTIONS = {
  className: 'canal-popup-wrap soil-popup-wrap',
  closeButton: true,
  autoPanPadding: [16, 16] as [number, number],
};

export type LeafletPopupLike = {
  isOpen?: () => boolean;
  getContent?: () => unknown;
};

export type LeafletPointerEvent = {
  originalEvent?: { target?: unknown };
  target?: unknown;
  popup?: LeafletPopupLike;
};

type EventTargetLike = {
  addEventListener(type: string, fn: (event: Event) => void, options?: boolean): void;
  removeEventListener(type: string, fn: (event: Event) => void, options?: boolean): void;
};

export type LeafletMapLike = {
  on(type: string, fn: (event: LeafletPointerEvent) => void): void;
  off(type: string, fn: (event: LeafletPointerEvent) => void): void;
  closePopup?: () => void;
  getContainer?: () => EventTargetLike | null | undefined;
};

type SoilTapState = { open: LeafletPopupLike | null; dismiss: boolean };

const states = new WeakMap<object, SoilTapState>();

function state(map: object): SoilTapState {
  let current = states.get(map);
  if (!current) {
    current = { open: null, dismiss: false };
    states.set(map, current);
  }
  return current;
}

export function isSoilPopupContent(content: unknown): boolean {
  if (typeof content === 'string') return /class=["']soil-popup["']/.test(content);
  if (content && typeof content === 'object') {
    const el = content as { classList?: { contains: (name: string) => boolean }; querySelector?: (sel: string) => unknown };
    if (el.classList?.contains('soil-popup')) return true;
    if (el.querySelector?.('.soil-popup')) return true;
  }
  return false;
}

export function pointerIsOnSoilPopup(target: unknown): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return false;
  return !!(target as Element).closest('.leaflet-popup');
}

export function soilPopupIsOpen(map: object): boolean {
  const popup = state(map).open;
  if (!popup) return false;
  if (typeof popup.isOpen === 'function' && !popup.isOpen()) return false;
  return isSoilPopupContent(popup.getContent?.());
}

export function noteSoilPopupOpen(map: object, popup: LeafletPopupLike) {
  if (isSoilPopupContent(popup.getContent?.())) state(map).open = popup;
}

export function noteSoilPopupClose(map: object, popup: LeafletPopupLike) {
  const current = state(map);
  if (current.open === popup) current.open = null;
}

/**
 * Arm the "this gesture only closes" flag. Sticky: once set, later preclick
 * after Leaflet has already closed the popup must not clear it. consume()
 * is what clears the flag.
 */
export function armSoilTapDismiss(map: object) {
  if (soilPopupIsOpen(map)) state(map).dismiss = true;
}

export function shouldArmDismissFromPointer(map: object, target: unknown): boolean {
  if (pointerIsOnSoilPopup(target)) return false;
  return soilPopupIsOpen(map);
}

/** Close only when the map's current tracked popup is a soil popup. */
export function closeOpenSoilPopup(map: LeafletMapLike | object) {
  if (!soilPopupIsOpen(map)) return;
  const closer = map as LeafletMapLike;
  closer.closePopup?.();
}

function pointerTarget(event: LeafletPointerEvent | Event): unknown {
  if ('originalEvent' in event && event.originalEvent && 'target' in event.originalEvent) {
    return event.originalEvent.target;
  }
  return (event as { target?: unknown }).target;
}

/** True when this tap should only close the soil popup, not open another. */
export function consumeSoilTapDismiss(map: object): boolean {
  const current = state(map);
  const dismiss = current.dismiss;
  current.dismiss = false;
  return dismiss;
}

export function attachSoilTapDismiss(map: LeafletMapLike): () => void {
  const onOpen = (event: LeafletPointerEvent) => {
    if (event.popup) noteSoilPopupOpen(map, event.popup);
  };
  const onClose = (event: LeafletPointerEvent) => {
    if (event.popup) noteSoilPopupClose(map, event.popup);
  };
  const onPreClick = () => armSoilTapDismiss(map);
  const onPointerDown = (event: LeafletPointerEvent) => {
    if (!shouldArmDismissFromPointer(map, pointerTarget(event))) return;
    armSoilTapDismiss(map);
    closeOpenSoilPopup(map);
  };
  const onNativePointer = (event: Event) => {
    if (!shouldArmDismissFromPointer(map, event.target)) return;
    armSoilTapDismiss(map);
    closeOpenSoilPopup(map);
  };

  map.on('popupopen', onOpen);
  map.on('popupclose', onClose);
  map.on('preclick', onPreClick);
  map.on('mousedown', onPointerDown);
  map.on('touchstart', onPointerDown);
  const container = map.getContainer?.();
  container?.addEventListener('pointerdown', onNativePointer, true);

  return () => {
    map.off('popupopen', onOpen);
    map.off('popupclose', onClose);
    map.off('preclick', onPreClick);
    map.off('mousedown', onPointerDown);
    map.off('touchstart', onPointerDown);
    container?.removeEventListener('pointerdown', onNativePointer, true);
    states.delete(map);
  };
}
