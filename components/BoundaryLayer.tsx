'use client';

import { GeoJSON } from 'react-leaflet';
import type { FieldBoundaryCollection } from './useFieldBoundaries';

const style = { color: '#f8fafc', weight: 2, fillColor: '#1F402A', fillOpacity: 0.22 };

export default function BoundaryLayer({ data }: { data?: FieldBoundaryCollection | null }) {
  if (!data?.features?.length) return null;
  return (
    <GeoJSON
      key={data.features.map(feature => feature.id).join(',')}
      data={data}
      interactive={false}
      style={style}
    />
  );
}
