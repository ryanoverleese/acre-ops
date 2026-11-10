'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import { formatProbeAge } from '@/lib/grower-display';
import type { GrowerProbePin, GrowerWaterRec } from '@/lib/supabase/grower-fields';

const GrowerFieldMap = dynamic(() => import('../../GrowerFieldMap'), { ssr: false });

function fmtDate(value: unknown): string {
  if (value == null || value === '') return 'Not recorded';
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return 'Not recorded';
    return value.toISOString().slice(0, 10);
  }
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : 'Not recorded';
}

export default function FieldDetailClient({
  farmName,
  field,
}: {
  farmName: string;
  field: {
    id: number;
    name: string;
    acres: number | null;
    lat: number | null;
    lng: number | null;
    season: number;
    boundaries: FieldBoundaryCollection;
    probes: GrowerProbePin[];
    waterRecs: GrowerWaterRec[];
  };
}) {
  return (
    <div className="grower-shell grower-shell-wide">
      <header className="grower-top">
        <div>
          <p className="grower-kicker">
            <Link href="/grower" className="grower-back">
              ← {farmName}
            </Link>
          </p>
          <h1 className="grower-title">{field.name}</h1>
          <p className="grower-sub">
            {field.season}
            {field.acres != null && Number.isFinite(field.acres) ? ` · ${field.acres} ac` : ''}
          </p>
        </div>
      </header>

      <div className="grower-map-wrap">
        <GrowerFieldMap
          fieldId={field.id}
          lat={field.lat}
          lng={field.lng}
          boundaries={field.boundaries}
          probes={field.probes}
        />
      </div>

      <h2 className="grower-section-title">Probes</h2>
      {field.probes.length === 0 ? (
        <p className="grower-empty">No probes placed for {field.season}.</p>
      ) : (
        <ul className="grower-probe-list">
          {field.probes.map((probe) => (
            <li key={probe.id} className="grower-probe-card">
              <div className="grower-probe-head">
                <span className="grower-field-name">
                  {probe.serial ? `#${probe.serial}` : 'Probe'}
                  {probe.label ? ` · ${probe.label}` : ''}
                </span>
                {probe.status && <span className="grower-field-meta">{probe.status}</span>}
              </div>
              <dl className="grower-probe-facts">
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
                  <dt>Soil</dt>
                  <dd>{probe.soilType?.trim() || 'Not recorded'}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      <h2 className="grower-section-title">Water recommendations</h2>
      {field.waterRecs.length === 0 ? (
        <p className="grower-empty">No recommendations for {field.season} yet.</p>
      ) : (
        <ul className="grower-probe-list">
          {field.waterRecs.map((rec) => (
            <li key={rec.id} className="grower-probe-card">
              <div className="grower-probe-head">
                <span className="grower-field-name">{fmtDate(rec.date)}</span>
                <span className="grower-field-meta">
                  {rec.reportType === 'update' ? 'Update' : 'Full'}
                  {rec.suggestedWaterDay ? ` · ${rec.suggestedWaterDay}` : ''}
                </span>
              </div>
              <p className="grower-rec-text">{rec.recommendation?.trim() || '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
