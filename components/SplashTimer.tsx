'use client';

import { useEffect, useRef, useState } from 'react';

export default function SplashTimer() {
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState('0.0');

  useEffect(() => {
    startRef.current = performance.now();

    const tick = () => {
      const start = startRef.current ?? performance.now();
      const s = (performance.now() - start) / 1000;
      setElapsed(s.toFixed(1));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="splash-timer">
      <div className="splash-timer-dot" />
      <span>{elapsed}s</span>
    </div>
  );
}
