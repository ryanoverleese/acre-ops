'use client';

import {
  LOWSPOTS_SLIDER_DEFAULT,
  LOWSPOTS_SLIDER_MAX,
  LOWSPOTS_SLIDER_MIN,
  type LowSpotsSliders as Sliders,
} from '@/lib/terrain/lowspots';

function Row({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="lowspots-slider-row">
      <div className="lowspots-slider-label">{label}</div>
      <input
        type="range"
        min={LOWSPOTS_SLIDER_MIN}
        max={LOWSPOTS_SLIDER_MAX}
        step={1}
        value={value}
        aria-label={`${label}, fewer to more`}
        aria-valuemin={LOWSPOTS_SLIDER_MIN}
        aria-valuemax={LOWSPOTS_SLIDER_MAX}
        aria-valuenow={value}
        aria-valuetext={value === LOWSPOTS_SLIDER_DEFAULT ? 'Default' : `${value} of 100, more features`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="lowspots-slider-ends">
        <span>Fewer</span>
        <span>More</span>
      </div>
    </div>
  );
}

/** Sensitivity sliders under the Low spots toggle. Shown only when the layer is on. */
export default function LowSpotsSliders({
  value,
  onChange,
}: {
  value: Sliders;
  onChange: (next: Sliders) => void;
}) {
  return (
    <div className="lowspots-sliders">
      <Row
        label="Low spots"
        value={value.lowSpots}
        onChange={(lowSpots) => onChange({ ...value, lowSpots })}
      />
      <Row
        label="Drainage paths"
        value={value.drainage}
        onChange={(drainage) => onChange({ ...value, drainage })}
      />
    </div>
  );
}
