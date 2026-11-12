'use client';

import FieldListThumb from '@/components/fields/FieldListThumb';
import { formatGrowerAcres, summarizeGrowerFieldProbeStatus } from '@/lib/grower-display';

function Chevron() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
      <path d="M1 1.5L6.5 7 1 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    boundary: { type?: string; coordinates?: unknown } | null;
  }>;
}) {
  const signOut = async () => {
    await fetch('/api/grower-auth', { method: 'DELETE' });
    window.location.href = '/grower/login';
  };

  return (
    <div className="grower-shell">
      <header className="grower-top grower-top-home">
        <div>
          <h1 className="grower-title">Fields</h1>
          <p className="grower-sub">{season}</p>
        </div>
        <button type="button" className="grower-signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      {fields.length === 0 ? (
        <p className="grower-empty">No fields for {season} yet.</p>
      ) : (
        <ul className="field-list">
          {fields.map((field) => {
            const status = summarizeGrowerFieldProbeStatus(field.probeStatuses);
            const acres = formatGrowerAcres(field.acres, {
              fromBoundary: field.acresFromBoundary,
            });
            return (
              <li key={field.id}>
                <a href={`/grower/fields/${field.id}`} className="field-list-row">
                  <FieldListThumb geometry={field.boundary} />
                  <span className="field-list-copy">
                    <span className="grower-list-primary">{field.name}</span>
                    <span className="grower-list-meta">
                      {acres ? `${acres} · ${status.label}` : status.label}
                    </span>
                  </span>
                  <span className="field-list-chev"><Chevron /></span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
