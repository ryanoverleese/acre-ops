'use client';

import { useEffect, useState } from 'react';

export interface FieldBoundaryCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    geometry: { type: string; coordinates: unknown };
    properties: { fieldId: number; source?: string; edited?: boolean; crs?: string };
  }>;
}

const empty: FieldBoundaryCollection = { type: 'FeatureCollection', features: [] };

export function useFieldBoundaries(ids: number[]): FieldBoundaryCollection {
  const key = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b).join(',');
  const [data, setData] = useState<FieldBoundaryCollection>(empty);
  useEffect(() => {
    if (!key) { setData(empty); return; }
    let cancelled = false;
    const parts = key.split(',');
    const chunks: string[][] = [];
    for (let i = 0; i < parts.length; i += 100) chunks.push(parts.slice(i, i + 100));
    Promise.all(chunks.map(async chunk => {
      const response = await fetch(`/api/field-boundaries?fields=${chunk.join(',')}`, { cache: 'no-store' });
      if (!response.ok) return empty;
      return response.json() as Promise<FieldBoundaryCollection>;
    })).then(groups => {
      if (!cancelled) setData({ type: 'FeatureCollection', features: groups.flatMap(group => group.features ?? []) });
    }).catch(() => { if (!cancelled) setData(empty); });
    return () => { cancelled = true; };
  }, [key]);
  return data;
}
