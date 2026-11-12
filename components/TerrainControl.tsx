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
  /** Short source line, e.g. "Lidar 2019 (USGS)". Omitted when unknown. */
  sourceLabel?: string | null;
}

/** Shared Terrain picker — CutSheetRX blue→red ramp swatch + mode select. */
export default function TerrainControl({
  value = DEFAULT_TERRAIN_MODE,
  onChange,
  className = 'terrain-control',
  style,
  range,
  sourceLabel,
}: Props) {
  const showRamp = value === 'color' || value === 'colorshade';
  const lo = range && Number.isFinite(range.lo) ? formatElevationFeet(range.lo) : '';
  const hi = range && Number.isFinite(range.hi) ? formatElevationFeet(range.hi) : '';
  const feet = lo && hi ? `${lo}–${hi}` : '';
  const legendLabel = feet
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
        <span className="terrain-control-legend">
          <span className="terrain-control-scale" role="img" aria-label={legendLabel}>
            <span className="terrain-control-ramp" style={{ background: TERRAIN_RAMP_CSS }} />
            {feet ? <span className="terrain-control-scale-value">{feet}</span> : null}
          </span>
          {sourceLabel ? <span className="terrain-control-source">{sourceLabel}</span> : null}
        </span>
      )}
    </label>
  );
}

export { DEFAULT_TERRAIN_MODE, TERRAIN_OPTIONS, TERRAIN_MODE_LABELS } from '@/lib/terrain/modes';
