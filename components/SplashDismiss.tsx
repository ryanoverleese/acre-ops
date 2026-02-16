'use client';

import { useEffect } from 'react';

export default function SplashDismiss() {
  useEffect(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('hidden');
      // Remove from DOM after transition
      setTimeout(() => splash.remove(), 500);
    }
    // Clear the counter interval
    if ((window as unknown as Record<string, unknown>).__splashInterval) {
      clearInterval((window as unknown as Record<string, unknown>).__splashInterval as number);
    }
  }, []);

  return null;
}
