'use client';

import { useEffect, useRef, useState } from 'react';
import { collectThumbRings, layoutFieldThumb } from '@/lib/field-thumb';

export default function FieldListThumb({
  geometry,
}: {
  geometry?: { type?: string; coordinates?: unknown } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(48);
  const [show, setShow] = useState(false);
  const rings = geometry?.coordinates ? collectThumbRings(geometry.coordinates) : [];
  const layout = rings.length ? layoutFieldThumb(rings, size) : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = Math.round(el.clientWidth);
      if (next >= 16) setSize(next);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !layout) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setShow(true);
      io.disconnect();
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [layout]);

  return (
    <span ref={ref} className="field-thumb" aria-hidden="true">
      {show && layout
        ? layout.tiles.map((tile) => (
          <img
            key={tile.url}
            src={tile.url}
            alt=""
            width={tile.size}
            height={tile.size}
            loading="lazy"
            decoding="async"
            style={{ left: tile.left, top: tile.top, width: tile.size, height: tile.size }}
          />
        ))
        : null}
      {layout ? (
        <svg viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none">
          <path d={layout.path} />
        </svg>
      ) : null}
    </span>
  );
}
