import { getCachedRows } from '@/lib/supabase/adapter';
import type { Field } from '@/lib/types';
import { valleyEnabled } from '@/lib/valley/client';
import { allPivotStatuses, type PivotListRow } from '@/lib/valley/service';
import { readingFreshness } from '@/lib/valley/types';
import PivotStatusIcon from '../water-recs/PivotStatusIcon';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Temporary read-only list of every Valley pivot, regardless of probe status.
export default async function ValleyPivotsPage() {
  if (!valleyEnabled()) return <main className={styles.page}><h1>Valley pivots</h1><p className={styles.muted}>Valley integration is turned off.</p></main>;
  let rows: PivotListRow[] = [], failed = false;
  const names = new Map<number, string>();
  try {
    const [pivots, fields] = await Promise.all([allPivotStatuses(), getCachedRows<Field>('fields', undefined, 120)]);
    rows = pivots;
    fields.forEach(f => names.set(f.id, f.name || 'Unknown'));
  } catch { failed = true; }
  const now = Date.now();
  return (
    <main className={styles.page}>
      <h1>Valley pivots</h1>
      <p className={styles.muted}>Read-only. Readings refresh every 5 minutes; devices usually report every 30. {rows.length} pivot{rows.length === 1 ? '' : 's'}.</p>
      {failed && <p className={styles.error}>Valley pivots could not be loaded.</p>}
      <table className={styles.table}>
        <thead><tr><th>Pivot</th><th>Field</th><th>Position</th><th>Power</th><th>Direction</th><th>Reported</th><th></th></tr></thead>
        <tbody>
          {rows.map(r => {
            const x = r.reading;
            const fresh = x ? readingFreshness(x, now) : null;
            return (
              <tr key={r.serial}>
                <td>{r.name}<div className={styles.muted}>#{r.serial}</div></td>
                <td>{r.fieldId ? names.get(r.fieldId) || `Field ${r.fieldId}` : <span className={styles.muted}>Not linked</span>}</td>
                <td>{!x ? '—' : x.isLateral ? 'Lateral' : x.angle === null ? 'Unknown' : `${x.angle}°`}</td>
                <td>{x?.power ?? '—'}</td>
                <td>{x?.direction ?? '—'}</td>
                <td>{!x ? <span className={styles.error}>Unavailable</span> : <>{x.reportedLocalTime || 'Unknown'}{fresh !== 'recent' && <div className={styles.warn}>{fresh === 'stale' ? 'Old reading' : 'Age unknown'}</div>}</>}</td>
                <td>{x && <PivotStatusIcon status={{state:'ready',pivots:[x]}} now={now} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
