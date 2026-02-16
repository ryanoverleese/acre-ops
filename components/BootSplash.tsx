'use client';

import { useEffect, useState } from 'react';

export default function BootSplash() {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Check if this is a cold start (first page load) vs client-side navigation
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const isColdStart = navEntries.length > 0 && (navEntries[0].type === 'navigate' || navEntries[0].type === 'reload');

    if (!isColdStart) {
      setVisible(false);
      return;
    }

    // Watch for real page content to appear, then fade out
    const check = setInterval(() => {
      const h2 = document.querySelector('.header h2');
      if (h2 && h2.textContent && h2.textContent.trim().length > 0) {
        setFadeOut(true);
        setTimeout(() => setVisible(false), 300);
        clearInterval(check);
      }
    }, 50);

    // Safety: hide after 15s no matter what
    const safety = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => setVisible(false), 300);
      clearInterval(check);
    }, 15000);

    return () => { clearInterval(check); clearTimeout(safety); };
  }, []);

  if (!visible) return null;

  return (
    <div className={`boot-splash${fadeOut ? ' boot-splash-fade' : ''}`}>
      <div className="splash-icon">
        <svg viewBox="0 0 24 24" fill="none" width="48" height="48">
          <path
            className="splash-drop-path"
            d="M12 2.69C12 2.69 7 8.33 7 13a5 5 0 0010 0c0-4.67-5-10.31-5-10.31z"
            stroke="#3b82f6"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M9.5 14a2.5 2.5 0 003 2.4"
            stroke="#60a5fa"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      </div>
      <div className="splash-label">Loading data...</div>
      <div className="splash-timer">
        <div className="splash-timer-dot" />
        <span id="boot-splash-elapsed">0.0s</span>
      </div>
    </div>
  );
}
