'use client';

import { useState, useEffect } from 'react';

export default function SplashTimer() {
  const [elapsed, setElapsed] = useState('0.0');

  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => {
      setElapsed(((Date.now() - start) / 1000).toFixed(1));
    }, 100);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="splash-timer">
      <div className="splash-timer-dot" />
      <span>{elapsed}s</span>
    </div>
  );
}
