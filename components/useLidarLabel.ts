'use client';

import { useEffect, useState } from 'react';
import { lidarPointKey, lidarRequestPath } from '@/lib/terrain/lidar-source';

/** Collection line for a field point. Null when the lookup misses or fails. */
export function useLidarLabel(lat: number | null, lng: number | null): string | null {
  const key = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
    ? lidarPointKey(lat, lng)
    : '';
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setLabel(null);
      return;
    }
    const [latText, lngText] = key.split(',');
    const ac = new AbortController();
    let gone = false;
    fetch(lidarRequestPath(Number(latText), Number(lngText)), { signal: ac.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (gone) return;
        const next = body && typeof body === 'object' && typeof (body as { label?: unknown }).label === 'string'
          ? (body as { label: string }).label
          : null;
        setLabel(next);
      })
      .catch(() => {
        if (!gone) setLabel(null);
      });
    return () => {
      gone = true;
      ac.abort();
    };
  }, [key]);

  return label;
}
