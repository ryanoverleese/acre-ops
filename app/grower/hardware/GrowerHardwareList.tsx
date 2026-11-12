'use client';

import { useState } from 'react';
import { formatProbeAge } from '@/lib/grower-display';
import {
  canCollapseRemoved,
  formatProbeListDates,
  groupProbes,
  mapsSearchUrl,
  probesSubline,
  probeStatusesMixed,
  removedCount,
  uniformStatusLabel,
  type ProbeListItem,
} from '@/lib/grower-probes';
import { formatProbeSerial } from '@/lib/probe-row';

function Chevron() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
      <path d="M1 1.5L6.5 7 1 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function chipClass(status: string): string {
  const value = status.trim().toLowerCase();
  if (value === 'installed') return 'probe-chip probe-chip-installed';
  if (value === 'removed') return 'probe-chip probe-chip-removed';
  return 'probe-chip probe-chip-other';
}

export default function GrowerHardwareList({
  season,
  items,
}: {
  farmName: string;
  season: number;
  items: ProbeListItem[];
}) {
  const [showRemoved, setShowRemoved] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const mixed = probeStatusesMixed(items);
  const uniform = uniformStatusLabel(items);
  const collapse = canCollapseRemoved(items);
  const hiddenRemoved = removedCount(items);
  const groups = groupProbes(items, showRemoved);
  const selected = items.find((item) => item.id === selectedId) || null;

  if (selected) {
    const serial = formatProbeSerial(selected.serial);
    const dates = formatProbeListDates(selected.installDate, selected.removalDate);
    const age = selected.ageSeasons != null ? `Age: ${formatProbeAge(selected.ageSeasons)}` : null;
    const maps = mapsSearchUrl(selected.lat, selected.lng);
    return (
      <div className="grower-shell probes-page">
        <button type="button" className="field-page-back" aria-label="Back" onClick={() => setSelectedId(null)}>
          <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden="true">
            <path d="M10.5 1.5L2 10l8.5 8.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="grower-title">{serial || 'Probe'}</h1>
        {selected.status?.trim() ? <p className="probe-detail-line">{selected.status.trim()}</p> : null}
        <p className="probe-detail-line">
          <a href={`/grower/fields/${selected.fieldId}`}>{selected.fieldName}</a>
        </p>
        {selected.brand ? <p className="probe-detail-muted">{selected.brand}</p> : null}
        {selected.ownerName ? <p className="probe-detail-muted">{`Owned by: ${selected.ownerName}`}</p> : null}
        {dates ? <p className="probe-detail-muted">{dates}</p> : null}
        {age ? <p className="probe-detail-muted">{age}</p> : null}
        {maps ? (
          <p className="probe-detail-line">
            <a href={maps} target="_blank" rel="noopener noreferrer">Open in Maps</a>
          </p>
        ) : null}
      </div>
    );
  }

  const toggleLabel = showRemoved ? 'Hide removed' : `Show ${hiddenRemoved} removed`;

  return (
    <div className="grower-shell probes-page">
      <header className="probes-head">
        <div>
          <h1 className="grower-title">Probes</h1>
          <p className="grower-sub">{probesSubline(season, items.length, uniform)}</p>
        </div>
        {collapse ? (
          <button type="button" className="probes-toggle probes-toggle-desk" onClick={() => setShowRemoved((open) => !open)}>
            {toggleLabel}
          </button>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="probes-empty">No probes this season.</p>
      ) : (
        <>
          <div className={`probe-cols${mixed ? '' : ' is-plain'}`} aria-hidden="true">
            <span>Serial</span>
            {mixed ? <span>Status</span> : null}
            <span>Dates</span>
            <span>Age</span>
            <span />
          </div>
          {groups.map((group) => (
            <section key={group.fieldId} className="probe-group">
              <a className="probe-field-head" href={`/grower/fields/${group.fieldId}`}>
                {group.fieldName}
                <span className="probe-field-count">{` · ${group.probes.length}`}</span>
              </a>
              <ul className="probe-group-list">
                {group.probes.map((probe) => {
                  const serial = formatProbeSerial(probe.serial);
                  const dates = formatProbeListDates(probe.installDate, probe.removalDate);
                  const age = probe.ageSeasons != null ? `Age: ${formatProbeAge(probe.ageSeasons)}` : null;
                  const status = probe.status?.trim() || '';
                  return (
                    <li key={probe.id}>
                      <button
                        type="button"
                        className={`probe-line${mixed ? '' : ' is-plain'}`}
                        onClick={() => setSelectedId(probe.id)}
                      >
                        <span className="probe-serial-wrap">
                          <span className="probe-serial">{serial || 'Probe'}</span>
                          {probe.brand ? <span className="probe-brand">{probe.brand}</span> : null}
                        </span>
                        {mixed && status ? <span className={chipClass(status)}>{status}</span> : null}
                        <span className="probe-dates">{dates || ''}</span>
                        <span className="probe-age">{age || ''}</span>
                        <span className="probe-chev"><Chevron /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {collapse ? (
            <button type="button" className="probes-toggle probes-toggle-phone" onClick={() => setShowRemoved((open) => !open)}>
              {toggleLabel}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
