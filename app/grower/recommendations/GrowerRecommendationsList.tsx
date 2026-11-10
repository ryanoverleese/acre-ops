'use client';

import type { GrowerFarmWaterRec } from '@/lib/supabase/grower-fields';

export default function GrowerRecommendationsList({
  farmName,
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
          <p className="grower-kicker">
            <a href="/grower" className="grower-back">
              ← {farmName}
            </a>
          </p>
          <h1 className="grower-title">Recommendations</h1>
          <p className="grower-sub">{season} water recommendations</p>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="grower-empty">No recommendations for {season} yet.</p>
      ) : (
        <ul className="grower-probe-list">
          {items.map((rec) => (
            <li key={rec.id} className="grower-probe-card">
              <div className="grower-probe-head">
                <span className="grower-field-name">{rec.date}</span>
                <span className="grower-field-meta">
                  {rec.reportType === 'update' ? 'Update' : 'Full'}
                  {rec.suggestedWaterDay ? ` · ${rec.suggestedWaterDay}` : ''}
                </span>
              </div>
              <p className="grower-rec-field">
                <a href={`/grower/fields/${rec.fieldId}`} className="grower-back">
                  {rec.fieldName}
                </a>
              </p>
              <p className="grower-rec-text">{rec.recommendation?.trim() || '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
