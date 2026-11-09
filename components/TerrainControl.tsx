'use client';

import type { CSSProperties } from 'react';
import {
  DEFAULT_TERRAIN_MODE,
  TERRAIN_MODE_LABELS,
  TERRAIN_OPTIONS,
  type TerrainMode,
} from '@/lib/terrain/modes';
import { elevationCssGradient } from '@/lib/terrain/ramp';

const TERRAIN_RAMP_CSS = elevationCssGradient();

interface Props {
  value?: TerrainMode;
  onChange: (mode: TerrainMode) => void;
  /** Extra class on the outer label (positioning). */
  className?: string;
  style?: CSSProperties;
}

/** Shared Terrain picker — CutSheetRX blue→red ramp swatch + mode select. */
export default function TerrainControl({
  value = DEFAULT_TERRAIN_MODE,
  onChange,
  className = 'terrain-control',
  style,
}: Props) {
  const showRamp = value === 'color' || value === 'colorshade';
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
        <span
          className="terrain-control-ramp"
          title="Low (blue) → High (red)"
          style={{ background: TERRAIN_RAMP_CSS }}
          aria-hidden
        />
      )}
    </label>
  );
}

export { DEFAULT_TERRAIN_MODE, TERRAIN_OPTIONS, TERRAIN_MODE_LABELS } from '@/lib/terrain/modes';
