import { pivotArm, readingFreshness, type FieldPivotStatus, type PivotReading } from '@/lib/valley/types';
import styles from './PivotStatusIcon.module.css';

function Reading({ reading, now }: {reading:PivotReading; now?:number}) {
  const freshness = now === undefined ? 'unknown' : readingFreshness(reading,now);
  const arm = reading.angle === null || reading.isLateral ? null : pivotArm(reading.angle);
  const power = reading.power ?? '?';
  const direction = reading.direction ?? '?';
  const time = reading.reportedLocalTime ? `${reading.reportedLocalTime} (device local time)` : 'Reading time unavailable';
  const position = reading.isLateral ? 'Lateral — circular position not applicable' : reading.angle === null ? 'unknown' : `${reading.angle}° from north`;
  const detail = [reading.name, `Position: ${position}`,
    `Reported power: ${reading.power ?? 'unknown'}`, `Direction: ${reading.direction ?? 'unknown'}`, time,
    freshness === 'stale' ? 'Old reading — not current' : freshness === 'unknown' ? 'Reading age unknown' : 'Recent reading',
    reading.power === 'IDLE' ? 'IDLE: power available, safety not engaged' : '',
  ].filter(Boolean).join('. ');
  return (
    <span className={`${styles.reading} ${freshness !== 'recent' ? styles.caution : ''}`}
      data-power={power} data-freshness={freshness} role="img" aria-label={detail} title={detail} tabIndex={0}>
      <svg viewBox="0 0 40 40" width="32" height="32" aria-hidden="true" focusable="false">
        {reading.isLateral ? <path d="M7 10h26M7 30h26" className={styles.track} /> : <circle cx="20" cy="20" r="14" className={styles.track} />}
        <path d="M20 1v3" className={styles.north} />
        {arm ? <><line x1="20" y1="20" x2={arm.x} y2={arm.y} className={styles.arm} /><circle cx={arm.x} cy={arm.y} r="2" fill="currentColor" /></>
          : <text x="20" y="24" textAnchor="middle" fontSize="14" fill="currentColor">?</text>}
        {arm && <circle cx="20" cy="20" r="2.5" fill="currentColor" />}
      </svg>
      <span className={styles.labels} aria-hidden="true">
        <span>{power} <span className={styles.direction}>{direction}</span></span>
        {freshness !== 'recent' && <span className={styles.age}>{freshness === 'stale' ? 'Old reading' : 'Age unknown'}</span>}
      </span>
      <span className={styles.tooltip} aria-hidden="true">{detail}</span>
    </span>
  );
}

export default function PivotStatusIcon({ status, now }: {status?:FieldPivotStatus; now?:number}) {
  if (status?.state === 'unlinked') return null;
  return (
    <span className={styles.group} data-valley-readonly="true">
      {status?.pivots.map(reading => <Reading key={reading.serial} reading={reading} now={now} />)}
      {!status && <span className={styles.notice} aria-label="Loading pivot reading">Pivot …</span>}
      {status?.state === 'unavailable' && <span className={styles.notice} title="Valley reading unavailable. No current status can be confirmed.">{status.pivots.length ? 'Other pivot unavailable' : 'Pivot unavailable'}</span>}
    </span>
  );
}
