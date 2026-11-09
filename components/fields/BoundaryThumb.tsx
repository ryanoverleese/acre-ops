'use client';

import { useMemo } from 'react';

type Ring = [number, number][];
type BBox = { west: number; south: number; east: number; north: number };
export type ThumbPin = { lat: number; lng: number };

function collectRings(coords: unknown, out: Ring[]): void {
  if (!Array.isArray(coords) || coords.length === 0) return;
  const first = coords[0];
  if (Array.isArray(first) && typeof first[0] === 'number') {
    out.push(coords as Ring);
    return;
  }
  for (const part of coords) collectRings(part, out);
}

function bboxOfRings(rings: Ring[]): BBox | null {
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

function expandBBox(box: BBox | null, pins: ThumbPin[]): BBox | null {
  let west = box?.west ?? Infinity;
  let south = box?.south ?? Infinity;
  let east = box?.east ?? -Infinity;
  let north = box?.north ?? -Infinity;
  for (const pin of pins) {
    if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) continue;
    if (pin.lng < west) west = pin.lng;
    if (pin.lng > east) east = pin.lng;
    if (pin.lat < south) south = pin.lat;
    if (pin.lat > north) north = pin.lat;
  }
  if (!Number.isFinite(west)) return null;
  // Degenerate (pin-only or flat) → small pad around the point
  if (west === east || south === north) {
    const pad = 0.0012; // ~400 ft
    return {
      west: west - pad,
      east: east + pad,
      south: south - pad,
      north: north + pad,
    };
  }
  return { west, south, east, north };
}

function paddedView(b: BBox, padFrac = 0.12): BBox {
  const w = b.east - b.west;
  const h = b.north - b.south;
  const padX = w * padFrac || 0.0004;
  const padY = h * padFrac || 0.0004;
  return {
    west: b.west - padX,
    east: b.east + padX,
    south: b.south - padY,
    north: b.north + padY,
  };
}

function imageryUrl(b: BBox, size: number): string {
  const view = paddedView(b);
  const params = new URLSearchParams({
    bbox: [view.west, view.south, view.east, view.north].join(','),
    bboxSR: '4326',
    imageSR: '4326',
    size: `${size},${size}`,
    format: 'jpg',
    f: 'image',
  });
  return `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?${params}`;
}

function toPct(lng: number, lat: number, view: BBox): { x: number; y: number } {
  const bw = view.east - view.west;
  const bh = view.north - view.south;
  return {
    x: ((lng - view.west) / bw) * 100,
    y: ((view.north - lat) / bh) * 100,
  };
}

function ringsToSvgPath(rings: Ring[], view: BBox): string {
  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const pts = ring.map(([lng, lat]) => {
      const p = toPct(lng, lat, view);
      return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
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
  /** Probe / field pins to mark on the thumbnail. */
  pins?: ThumbPin[];
  size?: number;
  title?: string;
  onClick?: () => void;
}

/** Compact satellite + outline + probe pin preview. */
export default function BoundaryThumb({ feature, pins = [], size = 56, title, onClick }: Props) {
  const model = useMemo(() => {
    const rings: Ring[] = [];
    if (feature?.geometry?.coordinates) collectRings(feature.geometry.coordinates, rings);
    const ringBox = rings.length ? bboxOfRings(rings) : null;
    const validPins = pins.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0);
    const box = expandBBox(ringBox, validPins);
    if (!box) return null;
    const view = paddedView(box);
    return {
      src: imageryUrl(box, Math.max(size * 2, 128)),
      path: rings.length ? ringsToSvgPath(rings, view) : '',
      pinPcts: validPins.map((p) => toPct(p.lng, p.lat, view)),
    };
  }, [feature, pins, size]);

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
        {model.path ? (
          <path d={model.path} fill="rgba(31,64,42,0.35)" stroke="#F6F2EA" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
        ) : null}
        {model.pinPcts.map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            {/* Drop pin — field green with white rim so it reads on satellite */}
            <circle r="5.2" fill="#1F402A" stroke="#F6F2EA" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            <circle r="2" fill="#F6F2EA" />
          </g>
        ))}
      </svg>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="boundary-thumb boundary-thumb-btn"
        style={{ width: size, height: size }}
        title={title || 'Field map'}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="boundary-thumb" style={{ width: size, height: size }} title={title || 'Field map'}>
      {body}
    </div>
  );
}
