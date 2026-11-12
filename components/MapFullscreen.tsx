'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Expand a Leaflet map to the screen.
 * iOS Safari does not support the Fullscreen API on elements that are not
 * video, so that path uses a fixed full-viewport layer. Other browsers use
 * the real Fullscreen API. Esc and a second tap both leave.
 */

const FALLBACK_CLASS = 'map-fullscreen-fallback';

type FsMode = 'off' | 'native' | 'css';

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};

type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function currentFullscreenElement(): Element | null {
  const doc = document as FullscreenDoc;
  return document.fullscreenElement || doc.webkitFullscreenElement || null;
}

function canUseFullscreen(el: HTMLElement): boolean {
  const doc = document as FullscreenDoc;
  const enabled = document.fullscreenEnabled || !!doc.webkitFullscreenEnabled;
  if (!enabled) return false;
  const node = el as FullscreenEl;
  return typeof el.requestFullscreen === 'function' || typeof node.webkitRequestFullscreen === 'function';
}

function waitForFullscreenChange(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener('fullscreenchange', done);
      document.removeEventListener('webkitfullscreenchange', done);
      window.clearTimeout(timer);
      resolve();
    };
    document.addEventListener('fullscreenchange', done);
    document.addEventListener('webkitfullscreenchange', done);
    const timer = window.setTimeout(done, timeoutMs);
  });
}

async function requestFullscreen(el: HTMLElement): Promise<boolean> {
  const node = el as FullscreenEl;
  const standard = typeof el.requestFullscreen === 'function' ? el.requestFullscreen.bind(el) : null;
  const webkit = typeof node.webkitRequestFullscreen === 'function' ? node.webkitRequestFullscreen.bind(node) : null;
  const request = standard || webkit;
  if (!request) return false;
  try {
    const pending = request();
    if (pending && typeof (pending as Promise<void>).then === 'function') {
      await pending;
    }
  } catch {
    return false;
  }
  if (currentFullscreenElement() === el) return true;
  // webkitRequestFullscreen often returns void and applies on the next turn.
  await waitForFullscreenChange(350);
  return currentFullscreenElement() === el;
}

async function exitFullscreen(): Promise<void> {
  const doc = document as FullscreenDoc;
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
  } catch {
    // Already left fullscreen.
  }
}

export function useMapFullscreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<FsMode>('off');
  const [mode, setMode] = useState<FsMode>('off');

  const applyMode = useCallback((next: FsMode) => {
    modeRef.current = next;
    setMode(next);
    document.documentElement.classList.toggle(FALLBACK_CLASS, next === 'css');
  }, []);

  const exit = useCallback(async () => {
    if (currentFullscreenElement()) await exitFullscreen();
    applyMode('off');
  }, [applyMode]);

  const enter = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    if (canUseFullscreen(el)) {
      const ok = await requestFullscreen(el);
      if (!rootRef.current) return;
      if (ok && currentFullscreenElement() === rootRef.current) {
        applyMode('native');
        return;
      }
    }
    if (!rootRef.current) return;
    applyMode('css');
  }, [applyMode]);

  const toggle = useCallback(() => {
    if (modeRef.current === 'off') void enter();
    else void exit();
  }, [enter, exit]);

  useEffect(() => {
    const onChange = () => {
      const el = rootRef.current;
      const current = currentFullscreenElement();
      if (current === el) {
        // A request that resolves a frame late should not stay on the CSS path.
        applyMode('native');
        return;
      }
      if (modeRef.current === 'native') applyMode('off');
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const ownsFullscreen = currentFullscreenElement() === rootRef.current;
      if (modeRef.current === 'off' && !ownsFullscreen) return;
      // Native fullscreen already leaves on Esc. Calling exit as well covers
      // the CSS fallback, and a request that became native a frame later.
      if (ownsFullscreen) void exitFullscreen();
      if (modeRef.current !== 'off') applyMode('off');
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
      if (currentFullscreenElement() === rootRef.current) void exitFullscreen();
      document.documentElement.classList.remove(FALLBACK_CLASS);
    };
  }, [applyMode]);

  return {
    rootRef,
    expanded: mode !== 'off',
    cssFallback: mode === 'css',
    toggle,
  };
}

/** Leaflet must measure the container again after the map fills or leaves the screen. */
export function MapSizeSync({ expanded }: { expanded: boolean }) {
  const map = useMap();
  useEffect(() => {
    const sync = () => {
      map.invalidateSize();
    };
    sync();
    const frame = window.requestAnimationFrame(sync);
    const soon = window.setTimeout(sync, 60);
    const later = window.setTimeout(sync, 320);
    window.addEventListener('resize', sync);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', sync);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(soon);
      window.clearTimeout(later);
      window.removeEventListener('resize', sync);
      viewport?.removeEventListener('resize', sync);
    };
  }, [map, expanded]);
  return null;
}

export function MapFullscreenButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="map-fullscreen-btn"
      onClick={onClick}
      aria-pressed={expanded}
      aria-label={expanded ? 'Exit full screen' : 'Expand map to full screen'}
      title={expanded ? 'Exit full screen' : 'Full screen'}
    >
      {expanded ? <CollapseIcon /> : <ExpandIcon />}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4v5H4" />
      <path d="M15 4v5h5" />
      <path d="M9 20v-5H4" />
      <path d="M15 20v-5h5" />
    </svg>
  );
}
