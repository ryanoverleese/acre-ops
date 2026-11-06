'use client';

import { useCallback } from 'react';
import { GeoJSON } from 'react-leaflet';
import L, { type Layer, type PathOptions } from 'leaflet';
import type { Feature, Geometry } from 'geojson';
import type { FieldBoundaryCollection } from './useFieldBoundaries';

const baseStyle: PathOptions = { color: '#F6F2EA', weight: 1.25, fillColor: '#1F402A', fillOpacity: 0.1, opacity: 0.7 };
const selectedStyle: PathOptions = { color: '#F6F2EA', weight: 2.75, fillColor: '#1F402A', fillOpacity: 0.48, opacity: 1 };

type BoundaryProps = { fieldId?: number };

function fieldIdOf(feature: Feature<Geometry, BoundaryProps> | undefined): number | null {
  if (!feature) return null;
  const raw = feature.properties?.fieldId ?? feature.id;
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default function BoundaryLayer({
  data,
  interactive = false,
  selectedId = null,
  onSelect,
}: {
  data?: FieldBoundaryCollection | null;
  interactive?: boolean;
  selectedId?: number | null;
  onSelect?: (fieldId: number) => void;
}) {
  const style = useCallback((feature?: Feature<Geometry, BoundaryProps>) => {
    const id = fieldIdOf(feature);
    return id != null && id === selectedId ? selectedStyle : baseStyle;
  }, [selectedId]);

  const onEachFeature = useCallback((feature: Feature<Geometry, BoundaryProps>, layer: Layer) => {
    if (!interactive || !onSelect) return;
    layer.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      const id = fieldIdOf(feature);
      if (id != null) onSelect(id);
    });
  }, [interactive, onSelect]);

  if (!data?.features?.length) return null;
  return (
    <GeoJSON
      key={`${data.features.map(feature => feature.id).join(',')}-${selectedId ?? 'none'}-${interactive ? 'i' : 'n'}`}
      data={data as GeoJSON.FeatureCollection}
      interactive={interactive}
      style={style}
      onEachFeature={interactive ? onEachFeature : undefined}
    />
  );
}
