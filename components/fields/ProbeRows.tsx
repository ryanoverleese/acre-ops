'use client';

import { useEffect } from 'react';
import { formatProbeAge } from '@/lib/grower-display';
import { formatProbeDates, formatProbeSerial } from '@/lib/probe-row';

export type ProbeRowData = {
  id: number;
  probeNumber: number | null;
  serial: string | null;
  status: string | null;
  installDate: string | null;
  removalDate: string | null;
  lat: number | null;
  lng: number | null;
  ageSeasons?: number | null;
  elevation?: number | string | null;
  soilType?: string | null;
};

export function probeHasPin(probe: ProbeRowData): boolean {
  return probe.probeNumber != null
    && Number.isFinite(probe.probeNumber)
    && probe.probeNumber > 0
    && probe.lat != null
    && probe.lng != null
    && Number.isFinite(probe.lat)
    && Number.isFinite(probe.lng);
}

function elevationText(value: number | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  return /ft$/i.test(text) ? text : `${text} ft`;
}

export default function ProbeRows({
  probes,
  selectedId,
  onSelect,
}: {
  probes: ProbeRowData[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  useEffect(() => {
    if (selectedId == null) return;
    document.getElementById(`probe-row-${selectedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  if (!probes.length) return null;

  return (
    <section className="probe-rows">
      <h2 className="probe-rows-label">Probes</h2>
      <ul className="probe-rows-list">
        {probes.map((probe) => {
          const selected = probe.id === selectedId;
          const serial = formatProbeSerial(probe.serial);
          const dates = formatProbeDates(probe.installDate, probe.removalDate);
          const number = probe.probeNumber != null && probe.probeNumber > 0
            ? String(probe.probeNumber)
            : '';
          const age = probe.ageSeasons != null ? formatProbeAge(probe.ageSeasons) : null;
          const elevation = elevationText(probe.elevation);
          const soil = probe.soilType?.trim() || null;
          return (
            <li key={probe.id}>
              <button
                id={`probe-row-${probe.id}`}
                type="button"
                className={`probe-row${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => onSelect(selected ? null : probe.id)}
              >
                {number ? (
                  <span className={`probe-badge${selected ? ' is-selected' : ''}`}>{number}</span>
                ) : (
                  <span className="probe-badge probe-badge-empty" aria-hidden="true" />
                )}
                <span className="probe-row-body">
                  <span className="probe-row-top">
                    <span className="probe-row-serial">{serial || '—'}</span>
                    {probe.status ? <span className="probe-row-status">{probe.status}</span> : null}
                  </span>
                  {dates ? <span className="probe-row-dates">{dates}</span> : null}
                  {selected && (age || elevation || soil) ? (
                    <span className="probe-row-extra">
                      {age ? <span>Age {age}</span> : null}
                      {elevation ? <span>Elevation {elevation}</span> : null}
                      {soil ? <span>Soil {soil}</span> : null}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
