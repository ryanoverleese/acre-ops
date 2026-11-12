'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  isGrowerPageViewPath,
  normalizeGrowerActivityPath,
} from '@/lib/grower-activity-display';

/**
 * Log a page view when a signed-in grower actually lands on the page.
 * Next.js Link prefetch runs the server component, then reuses that payload
 * on click, so a server-component log either counts the prefetch or misses
 * the visit. A mount effect runs only for the visit.
 */
export default function GrowerActivityBeacon() {
  const pathname = usePathname() || '';
  const loggedPath = useRef<string | null>(null);

  useEffect(() => {
    const path = normalizeGrowerActivityPath(pathname);
    if (!path || !isGrowerPageViewPath(path) || loggedPath.current === path) return;
    loggedPath.current = path;
    fetch('/api/grower-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
