/**
 * Soil popups close on the next tap and stay closed. Leaflet closes the open
 * popup on preclick, then the click would otherwise open the soil under the
 * cursor; we remember that a soil popup was open and skip that reopen.
 * Field and canal popups are left alone (a second tap may close them too if
 * they happen to use this helper, but they are not registered here).
 */

export type LeafletPopupLike = {
  isOpen?: () => boolean;
  getContent?: () => unknown;
};

export type LeafletMapLike = {
  on(type: string, fn: (event: { popup?: LeafletPopupLike }) => void): void;
  off(type: string, fn: (event: { popup?: LeafletPopupLike }) => void): void;
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

export function noteSoilPopupOpen(map: object, popup: LeafletPopupLike) {
  if (isSoilPopupContent(popup.getContent?.())) state(map).open = popup;
}

export function noteSoilPopupClose(map: object, popup: LeafletPopupLike) {
  const current = state(map);
  if (current.open === popup) current.open = null;
}

/** Call from map preclick, while the popup is still open. */
export function armSoilTapDismiss(map: object) {
  const current = state(map);
  const popup = current.open;
  current.dismiss = !!(
    popup
    && (typeof popup.isOpen !== 'function' || popup.isOpen())
    && isSoilPopupContent(popup.getContent?.())
  );
}

/** True when this tap should only close the soil popup, not open another. */
export function consumeSoilTapDismiss(map: object): boolean {
  const current = state(map);
  const dismiss = current.dismiss;
  current.dismiss = false;
  return dismiss;
}

export function attachSoilTapDismiss(map: LeafletMapLike): () => void {
  const onOpen = (event: { popup?: LeafletPopupLike }) => {
    if (event.popup) noteSoilPopupOpen(map, event.popup);
  };
  const onClose = (event: { popup?: LeafletPopupLike }) => {
    if (event.popup) noteSoilPopupClose(map, event.popup);
  };
  const onPreClick = () => armSoilTapDismiss(map);
  map.on('popupopen', onOpen);
  map.on('popupclose', onClose);
  map.on('preclick', onPreClick);
  return () => {
    map.off('popupopen', onOpen);
    map.off('popupclose', onClose);
    map.off('preclick', onPreClick);
    states.delete(map);
  };
}
