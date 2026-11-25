'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import ProbeRows from '@/components/fields/ProbeRows';
import type { FieldBoundaryCollection } from '@/components/useFieldBoundaries';
import {
  formatGrowerAcres,
  summarizeGrowerFieldProbeStatus,
} from '@/lib/grower-display';
import { compareProbePinOrder } from '@/lib/probe-pin-label';
import type { GrowerProbePin } from '@/lib/supabase/grower-fields';

const FieldMapBlock = dynamic(() => import('@/components/fields/FieldMapBlock'), { ssr: false });

export default function FieldDetailClient({
  field,
  operationLabel = null,
}: {
  farmName: string;
  /** Staff All operations view: which farm this field belongs to. */
  operationLabel?: string | null;
  field: {
    id: number;
    name: string;
    acres: number | null;
    acresFromBoundary: boolean;
    lat: number | null;
    lng: number | null;
    season: number;
    boundaries: FieldBoundaryCollection;
    probes: GrowerProbePin[];
  };
}) {
  const fieldStatus = summarizeGrowerFieldProbeStatus(field.probes.map((p) => p.status));
  const probes = useMemo(
    () => field.probes.slice().sort(compareProbePinOrder),
    [field.probes],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="grower-shell grower-field-page">
      <header className="field-page-header">
        <Link href="/grower/fields" className="field-page-back" aria-label="Back">
          <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden="true">
            <path d="M10.5 1.5L2 10l8.5 8.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        {operationLabel ? <p className="field-page-op">{operationLabel}</p> : null}
        <h1 className="field-page-title">{field.name}</h1>
        <p className="field-page-sub">
          {formatGrowerAcres(field.acres, {
            fromBoundary: field.acresFromBoundary,
          }) ?? 'Acres not recorded'}
          {' · '}
          {fieldStatus.label}
        </p>
      </header>

      <div className="grower-field-layout">
        <FieldMapBlock
          fieldId={field.id}
          lat={field.lat}
          lng={field.lng}
          boundaries={field.boundaries}
          probes={probes}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div>
          <ProbeRows probes={probes} selectedId={selectedId} onSelect={setSelectedId} />
          {probes.length === 0 ? <p className="grower-empty">No probes for {field.season}.</p> : null}
        </div>
      </div>
    </div>
  );
}
