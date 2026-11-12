'use client';

import type { CSSProperties } from 'react';
import {
  DEFAULT_TERRAIN_MODE,
  TERRAIN_MODE_LABELS,
  TERRAIN_OPTIONS,
  type TerrainMode,
} from '@/lib/terrain/modes';
import { formatElevationFeet, type ElevRange } from '@/lib/terrain/color-scale';
import { elevationCssGradient } from '@/lib/terrain/ramp';

const TERRAIN_RAMP_CSS = elevationCssGradient();

interface Props {
  value?: TerrainMode;
  onChange: (mode: TerrainMode) => void;
  /** Extra class on the outer label (positioning). */
  className?: string;
  style?: CSSProperties;
  /** Field color scale in meters. Shown as whole feet. Color math is unchanged. */
  range?: ElevRange | null;
}

/** Shared Terrain picker — CutSheetRX blue→red ramp swatch + mode select. */
export default function TerrainControl({
  value = DEFAULT_TERRAIN_MODE,
  onChange,
  className = 'terrain-control',
  style,
  range,
}: Props) {
  const showRamp = value === 'color' || value === 'colorshade';
  const lo = range && Number.isFinite(range.lo) ? formatElevationFeet(range.lo) : '';
  const hi = range && Number.isFinite(range.hi) ? formatElevationFeet(range.hi) : '';
  const legendLabel = lo && hi
    ? `Elevation from ${lo} to ${hi}`
    : 'Elevation color scale, low blue to high red';
  return (
    <label className={className} style={style}>
      <span className="terrain-control-title">Terrain</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TerrainMode)}
        aria-label="Terrain mode"
      >
        {TERRAIN_OPTIONS.map((mode) => (
          <option key={mode} value={mode}>{TERRAIN_MODE_LABELS[mode]}</option>
        ))}
      </select>
      {showRamp && (
        <span className="terrain-control-scale" role="img" aria-label={legendLabel}>
          {lo ? <span className="terrain-control-scale-value">{lo}</span> : null}
          <span
            className="terrain-control-ramp"
            title={lo && hi ? legendLabel : 'Low (blue) → High (red)'}
            style={{ background: TERRAIN_RAMP_CSS }}
          />
          {hi ? <span className="terrain-control-scale-value">{hi}</span> : null}
        </span>
      )}
    </label>
  );
}

export { DEFAULT_TERRAIN_MODE, TERRAIN_OPTIONS, TERRAIN_MODE_LABELS } from '@/lib/terrain/modes';
