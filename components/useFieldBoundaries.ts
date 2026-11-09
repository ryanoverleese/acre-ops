'use client';

import { useEffect, useState } from 'react';

export interface FieldBoundaryCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: { type: string; coordinates: unknown };
    properties: { fieldId: number; source?: string; edited?: boolean; crs?: string; cropxFieldUuid?: string | null };
  }>;
}

const empty: FieldBoundaryCollection = { type: 'FeatureCollection', features: [] };
const CHUNK = 500;

export function useFieldBoundaries(
  ids: number[],
  initial?: FieldBoundaryCollection | null,
  refreshKey = 0,
): FieldBoundaryCollection {
  const seed = initial?.features?.length ? initial : empty;
  const key = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b).join(',');
  const [data, setData] = useState<FieldBoundaryCollection>(() =>
    key && seed.features.length ? seed : empty,
  );

  useEffect(() => {
    if (!key) {
      setData(empty);
      return;
    }
    let cancelled = false;
    const parts = key.split(',');
    const chunks: string[][] = [];
    for (let i = 0; i < parts.length; i += CHUNK) chunks.push(parts.slice(i, i + CHUNK));

    Promise.all(chunks.map(async chunk => {
      const response = await fetch(`/api/field-boundaries?fields=${chunk.join(',')}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`field-boundaries ${response.status}`);
      return response.json() as Promise<FieldBoundaryCollection>;
    })).then(groups => {
      if (!cancelled) {
        setData({ type: 'FeatureCollection', features: groups.flatMap(group => group.features ?? []) });
      }
    }).catch(() => {
      // Keep SSR / prior features — silent empty made Map thumbs look pin-only.
    });

    return () => { cancelled = true; };
  }, [key, refreshKey]);

  return data;
}
