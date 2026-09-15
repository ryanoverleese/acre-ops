'use client';

import { useEffect } from 'react';

/**
 * Registers the installer-scoped service worker that caches Google map tiles
 * for dead-zone Removals pulls. Failures are silent — warm-fetch still helps.
 */
export default function InstallerSwRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Home-screen / Safari: register after a tick so first paint isn't blocked.
    const t = window.setTimeout(() => {
      navigator.serviceWorker
        .register('/installer/sw.js', { scope: '/installer/' })
        .catch(() => { /* optional path for mid-season */ });
    }, 800);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
