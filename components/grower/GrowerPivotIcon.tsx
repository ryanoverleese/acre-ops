import { iconArmEnd, type GrowerPivotIconData, type IconPoint } from '@/lib/valley/grower-icon';

const TRACK = '#5b5f5b';
const ARM_ON = '#2a6db5';
const ARM_OFF = '#9aa09a';
const PROBE = '#2e7d4a';

/**
 * Icon only (no words beside it): circle track, center hub, arm blue when the
 * pivot reports ON and gray otherwise, and a small green dot for the probe.
 * Server-renderable; holds no Valley data beyond the two values it draws.
 */
export default function GrowerPivotIcon({ pivot, probe, size = 26 }: {
  pivot: GrowerPivotIconData;
  probe: IconPoint | null;
  size?: number;
}) {
  const arm = iconArmEnd(pivot.angle);
  const label = `Pivot ${pivot.on ? 'on' : 'off'}, arm at ${Math.round(pivot.angle)} degrees from north${probe ? ', green dot is the probe' : ''}`;
  return (
    <span className="grower-pivot-icon" role="img" aria-label={label} data-pivot-on={pivot.on ? 'true' : 'false'}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" focusable="false">
        <circle cx="20" cy="20" r="14" fill="none" stroke={TRACK} strokeWidth="2.25" />
        {probe ? <circle cx={probe.x} cy={probe.y} r="2.6" fill={PROBE} /> : null}
        <line x1="20" y1="20" x2={arm.x} y2={arm.y} stroke={pivot.on ? ARM_ON : ARM_OFF} strokeWidth="2.75" strokeLinecap="round" />
        <circle cx="20" cy="20" r="2.6" fill={TRACK} />
      </svg>
    </span>
  );
}
