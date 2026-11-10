'use client';

import { formatGrowerAcres, summarizeGrowerFieldProbeStatus } from '@/lib/grower-display';

export default function GrowerFieldsList({
  season,
  fields,
}: {
  farmName: string;
  season: number;
  fields: Array<{
    id: number;
    name: string;
    acres: number | null;
    acresFromBoundary: boolean;
    probeStatuses: string[];
  }>;
}) {
  return (
    <div className="grower-shell">
      <header className="grower-top">
        <div>
          <p className="grower-navline">
            <a href="/grower" className="grower-back">Home</a>
          </p>
          <h1 className="grower-title">Fields</h1>
          <p className="grower-sub">{season}</p>
        </div>
      </header>

      {fields.length === 0 ? (
        <p className="grower-empty">No fields for {season} yet.</p>
      ) : (
        <ul className="grower-list">
          {fields.map((field) => {
            const status = summarizeGrowerFieldProbeStatus(field.probeStatuses);
            return (
              <li key={field.id}>
                <a href={`/grower/fields/${field.id}`} className="grower-list-row">
                  <span className="grower-list-primary">{field.name}</span>
                  <span className="grower-list-meta">
                    {formatGrowerAcres(field.acres, {
                      fromBoundary: field.acresFromBoundary,
                    }) ?? 'Acres not recorded'}
                    {' · '}
                    {status.label}
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
