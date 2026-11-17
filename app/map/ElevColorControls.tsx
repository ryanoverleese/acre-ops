'use client';

import type { CSSProperties } from 'react';
import { elevationCssGradient } from '@/lib/terrain/ramp';

export function ElevColorControls({
  autoLoFt,
  autoHiFt,
  loFt,
  hiFt,
  auto,
  spread,
  onAuto,
  onSpread,
  onRange,
}: {
  autoLoFt: number | null;
  autoHiFt: number | null;
  loFt: number | null;
  hiFt: number | null;
  auto: boolean;
  spread: boolean;
  onAuto: () => void;
  onSpread: (next: boolean) => void;
  onRange: (loFt: number, hiFt: number) => void;
}) {
  const trackLo = autoLoFt;
  const trackHi = autoHiFt;
  const ready = trackLo != null && trackHi != null && trackHi > trackLo;
  const lo = ready ? (auto || loFt == null ? trackLo! : Math.min(Math.max(loFt, trackLo!), trackHi! - 1)) : 0;
  const hi = ready ? (auto || hiFt == null ? trackHi! : Math.max(Math.min(hiFt, trackHi!), trackLo! + 1)) : 1;

  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid #e7e5e4',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        fontSize: 12,
        color: '#44403c',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          height: 8,
          borderRadius: 4,
          background: elevationCssGradient(),
          marginBottom: 8,
        }}
      />
      <style>{`
        .acre-elev-range { pointer-events: none; background: none; }
        .acre-elev-range::-webkit-slider-runnable-track { background: transparent; height: 4px; }
        .acre-elev-range::-moz-range-track { background: transparent; height: 4px; border: none; }
        .acre-elev-range::-webkit-slider-thumb {
          pointer-events: auto; -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #1c1917; border: 2px solid #fff; margin-top: -5px;
        }
        .acre-elev-range::-moz-range-thumb {
          pointer-events: auto; width: 14px; height: 14px; border-radius: 50%;
          background: #1c1917; border: 2px solid #fff;
        }
      `}</style>
      {ready ? (
        <div style={{ position: 'relative', height: 22, marginBottom: 6 }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 9,
              height: 4,
              borderRadius: 2,
              background: '#e7e5e4',
            }}
          />
          <input
            type="range"
            aria-label="Low elevation, feet"
            min={trackLo!}
            max={trackHi!}
            value={lo}
            onChange={(event) => {
              const next = Number(event.target.value);
              onRange(Math.min(next, hi - 1), hi);
            }}
            className="acre-elev-range" style={rangeStyle}
          />
          <input
            type="range"
            aria-label="High elevation, feet"
            min={trackLo!}
            max={trackHi!}
            value={hi}
            onChange={(event) => {
              const next = Number(event.target.value);
              onRange(lo, Math.max(next, lo + 1));
            }}
            className="acre-elev-range" style={rangeStyle}
          />
        </div>
      ) : (
        <div style={{ color: '#78716c', marginBottom: 6 }}>Measuring elevation…</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#57534e' }}>
        <span>{ready ? `${lo} ft` : '—'}</span>
        <span>{ready ? `${hi} ft` : '—'}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onAuto}
          aria-pressed={auto}
          style={btnStyle(auto)}
        >
          Auto
        </button>
        <button
          type="button"
          onClick={() => onSpread(!spread)}
          aria-pressed={spread}
          style={btnStyle(spread)}
        >
          Spread
        </button>
      </div>
    </div>
  );
}

const rangeStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  width: '100%',
  margin: 0,
  background: 'none',
  pointerEvents: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  height: 22,
};

const btnStyle = (on: boolean): CSSProperties => ({
  flex: 1,
  padding: '4px 0',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: on ? 600 : 400,
  color: on ? '#4a7a5b' : '#57534e',
  background: on ? '#eef4f0' : '#fff',
  border: `1px solid ${on ? '#4a7a5b' : '#d6d3d1'}`,
  borderRadius: 6,
  cursor: 'pointer',
});
