'use client';

import type { GrowerFarmWaterRec } from '@/lib/supabase/grower-fields';

export default function GrowerRecommendationsList({
  season,
  items,
}: {
  farmName: string;
  season: number;
  items: GrowerFarmWaterRec[];
}) {
  return (
    <div className="grower-shell">
      <header className="grower-top">
        <div>
          <p className="grower-navline">
            <a href="/grower" className="grower-back">Home</a>
          </p>
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
                <a href={`/grower/fields/${rec.fieldId}`}>{rec.fieldName}</a>
              </p>
              <p className="grower-body-text">{rec.recommendation?.trim() || '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
