'use client';

import { formatProbeAge } from '@/lib/grower-display';
import { formatRemovalWhen } from '@/lib/removal-time';
import type { GrowerHardwareRow } from '@/lib/supabase/grower-fields';

function fmtDate(value: string | null): string {
  if (!value) return 'Not recorded';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : 'Not recorded';
}

function fmtLocation(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Not recorded';
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export default function GrowerHardwareList({
  season,
  items,
}: {
  farmName: string;
  season: number;
  items: GrowerHardwareRow[];
}) {
  return (
    <div className="grower-shell">
      <header className="grower-top">
        <div>
          <p className="grower-navline">
            <a href="/grower" className="grower-back">Home</a>
          </p>
          <h1 className="grower-title">Hardware</h1>
          <p className="grower-sub">{season}</p>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="grower-empty">No hardware for {season} yet.</p>
      ) : (
        <ul className="grower-list">
          {items.map((probe) => (
            <li key={probe.id} className="grower-section-block">
              <div className="grower-list-row grower-list-row-static">
                <span className="grower-list-primary">
                  {probe.serial ? `#${probe.serial}` : 'Probe'}
                  {probe.label ? ` · ${probe.label}` : ''}
                </span>
                <span className="grower-list-meta">{probe.status || 'Not recorded'}</span>
              </div>
              <p className="grower-inline-link">
                <a href={`/grower/fields/${probe.fieldId}`}>{probe.fieldName}</a>
              </p>
              <dl className="grower-facts">
                <div>
                  <dt>Install date</dt>
                  <dd>{fmtDate(probe.installDate)}</dd>
                </div>
                {(probe.status || '').toLowerCase() === 'removed' || probe.removalDate || probe.removalAt ? (
                  <div>
                    <dt>Pulled</dt>
                    <dd>{formatRemovalWhen(probe.removalDate, probe.removalAt, 'long') || 'Not recorded'}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Age</dt>
                  <dd>{formatProbeAge(probe.ageSeasons)}</dd>
                </div>
                <div>
                  <dt>Elevation</dt>
                  <dd>
                    {probe.elevation != null && Number.isFinite(probe.elevation)
                      ? `${probe.elevation} ft`
                      : 'Not recorded'}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{fmtLocation(probe.lat, probe.lng)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
