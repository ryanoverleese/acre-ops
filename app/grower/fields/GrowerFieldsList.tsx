'use client';

import { formatGrowerAcres, summarizeGrowerFieldProbeStatus } from '@/lib/grower-display';
import { GrowerFieldStatusBadges } from '../GrowerStatus';

export default function GrowerFieldsList({
  farmName,
  season,
  fields,
}: {
  farmName: string;
  season: number;
  fields: Array<{
    id: number;
    name: string;
    acres: number | null;
    probeStatuses: string[];
  }>;
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
            const status = summarizeGrowerFieldProbeStatus(field.probeStatuses);
            return (
              <li key={field.id}>
                <a href={`/grower/fields/${field.id}`} className="grower-field-row">
                  <span className="grower-field-row-main">
                    <span className="grower-field-name">{field.name}</span>
                    <GrowerFieldStatusBadges label={status.label} />
                  </span>
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
