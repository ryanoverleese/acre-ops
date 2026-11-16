'use client';

import type { GrowerFarmWaterRec } from '@/lib/supabase/grower-fields';
import { growerFieldHref } from '@/lib/grower-scope';

export default function GrowerRecommendationsList({
  season,
  items,
}: {
  farmName: string;
  season: number;
  items: Array<GrowerFarmWaterRec & { operationId?: number; operationName?: string }>;
}) {
  return (
    <div className="grower-shell">
      <header className="grower-top">
        <div>
          <h1 className="grower-title">Recommendations</h1>
          <p className="grower-sub">{season}</p>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="grower-empty">No recommendations for {season} yet.</p>
      ) : (
        <ul className="grower-list">
          {items.map((rec) => (
            <li key={rec.id} className="grower-section-block">
              <div className="grower-list-row grower-list-row-static">
                <span className="grower-list-primary">{rec.date}</span>
                <span className="grower-list-meta">
                  {rec.reportType === 'update' ? 'Update' : 'Full'}
                  {rec.suggestedWaterDay ? ` · ${rec.suggestedWaterDay}` : ''}
                </span>
              </div>
              <p className="grower-inline-link">
                <a href={growerFieldHref(rec.fieldId, rec.operationId)}>{rec.fieldName}</a>
                {rec.operationName ? <span className="grower-list-op-inline">{` · ${rec.operationName}`}</span> : null}
              </p>
              <p className="grower-body-text">{rec.recommendation?.trim() || '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
