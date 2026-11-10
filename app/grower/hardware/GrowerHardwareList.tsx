'use client';

import { formatProbeAge } from '@/lib/grower-display';
import type { GrowerHardwareRow } from '@/lib/supabase/grower-fields';
import { GrowerStatusBadge } from '../GrowerStatus';

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
  farmName,
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
          <p className="grower-kicker">
            <a href="/grower" className="grower-back">
              ← {farmName}
            </a>
          </p>
          <h1 className="grower-title">Hardware</h1>
          <p className="grower-sub">{season} season · this farm only</p>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="grower-empty">No hardware placed for {season} yet.</p>
      ) : (
        <ul className="grower-probe-list">
          {items.map((probe) => (
            <li key={probe.id} className="grower-probe-card">
              <div className="grower-probe-head">
                <span className="grower-field-name">
                  {probe.serial ? `#${probe.serial}` : 'Probe'}
                  {probe.label ? ` · ${probe.label}` : ''}
                </span>
                <GrowerStatusBadge status={probe.status} />
              </div>
              <p className="grower-rec-field">
                <a href={`/grower/fields/${probe.fieldId}`} className="grower-back">
                  {probe.fieldName}
                </a>
              </p>
              <dl className="grower-probe-facts">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <GrowerStatusBadge status={probe.status} />
                  </dd>
                </div>
                <div>
                  <dt>Install date</dt>
                  <dd>{fmtDate(probe.installDate)}</dd>
                </div>
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
