'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function LoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Reset when route changes complete
    setLoading(false);
    setProgress(0);
  }, [pathname, searchParams]);

  useEffect(() => {
    let progressInterval: NodeJS.Timeout;

    if (loading) {
      setProgress(20);
      progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 200);
    }

    return () => {
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [loading]);

  // Listen for navigation start
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor && anchor.href && !anchor.href.startsWith('#') && !anchor.target) {
        const url = new URL(anchor.href);
        if (url.origin === window.location.origin && url.pathname !== pathname) {
          setLoading(true);
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [pathname]);

  if (!loading) return null;

  return (
    <div className="loading-bar">
      <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
    </div>
  );
}
