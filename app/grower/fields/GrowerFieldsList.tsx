'use client';

import { formatGrowerAcres } from '@/lib/grower-display';

export default function GrowerFieldsList({
  farmName,
  season,
  fields,
}: {
  farmName: string;
  season: number;
  fields: Array<{ id: number; name: string; acres: number | null }>;
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
          <h1 className="grower-title">Fields</h1>
          <p className="grower-sub">{season} season</p>
        </div>
      </header>

      {fields.length === 0 ? (
        <p className="grower-empty">No fields for {season} yet.</p>
      ) : (
        <ul className="grower-field-list">
          {fields.map((field) => {
            const acresLabel = formatGrowerAcres(field.acres);
            return (
              <li key={field.id}>
                <a href={`/grower/fields/${field.id}`} className="grower-field-row">
                  <span className="grower-field-name">{field.name}</span>
                  <span className="grower-field-meta">
                    {acresLabel ?? 'Acres not recorded'}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
