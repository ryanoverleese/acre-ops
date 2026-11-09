'use client';

import { useMemo } from 'react';

type Ring = [number, number][];

function collectRings(coords: unknown, out: Ring[]): void {
  if (!Array.isArray(coords) || coords.length === 0) return;
  const first = coords[0];
  if (Array.isArray(first) && typeof first[0] === 'number') {
    out.push(coords as Ring);
    return;
  }
  for (const part of coords) collectRings(part, out);
}

function bboxOf(rings: Ring[]): { west: number; south: number; east: number; north: number } | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (typeof lng !== 'number' || typeof lat !== 'number') continue;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  if (!Number.isFinite(west) || west === east || south === north) return null;
  return { west, south, east, north };
}

function imageryUrl(b: { west: number; south: number; east: number; north: number }, size: number): string {
  // Pad so the outline isn't flush to the edge
  const padX = (b.east - b.west) * 0.12 || 0.0004;
  const padY = (b.north - b.south) * 0.12 || 0.0004;
  const bbox = [
    b.west - padX,
    b.south - padY,
    b.east + padX,
    b.north + padY,
  ].join(',');
  const params = new URLSearchParams({
    bbox,
    bboxSR: '4326',
    imageSR: '4326',
    size: `${size},${size}`,
    format: 'jpg',
    f: 'image',
  });
  return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?${params}`;
}

function ringsToSvgPath(
  rings: Ring[],
  b: { west: number; south: number; east: number; north: number },
  padFrac = 0.12,
): string {
  const w = b.east - b.west;
  const h = b.north - b.south;
  const padX = w * padFrac || 0.0004;
  const padY = h * padFrac || 0.0004;
  const west = b.west - padX;
  const east = b.east + padX;
  const south = b.south - padY;
  const north = b.north + padY;
  const bw = east - west;
  const bh = north - south;

  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const pts = ring.map(([lng, lat]) => {
      const x = ((lng - west) / bw) * 100;
      const y = ((north - lat) / bh) * 100;
      return `${x.toFixed(2)} ${y.toFixed(2)}`;
    });
    parts.push(`M${pts[0]}L${pts.slice(1).join('L')}Z`);
  }
  return parts.join('');
}

export type BoundaryFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
};

interface Props {
  feature?: BoundaryFeature | null;
  size?: number;
  title?: string;
  onClick?: () => void;
}

/** Compact satellite + outline preview for a field boundary. */
export default function BoundaryThumb({ feature, size = 56, title, onClick }: Props) {
  const model = useMemo(() => {
    if (!feature?.geometry?.coordinates) return null;
    const rings: Ring[] = [];
    collectRings(feature.geometry.coordinates, rings);
    const box = bboxOf(rings);
    if (!box) return null;
    return {
      src: imageryUrl(box, Math.max(size * 2, 128)),
      path: ringsToSvgPath(rings, box),
    };
  }, [feature, size]);

  if (!model) {
    return (
      <div
        className="boundary-thumb boundary-thumb-empty"
        style={{ width: size, height: size }}
        title={title || 'No boundary'}
        aria-hidden
      />
    );
  }

  const body = (
    <>
      <img src={model.src} alt="" className="boundary-thumb-img" loading="lazy" decoding="async" />
      <svg className="boundary-thumb-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d={model.path} fill="rgba(31,64,42,0.35)" stroke="#F6F2EA" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
      </svg>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="boundary-thumb boundary-thumb-btn"
        style={{ width: size, height: size }}
        title={title || 'Field boundary'}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="boundary-thumb" style={{ width: size, height: size }} title={title || 'Field boundary'}>
      {body}
    </div>
  );
}
