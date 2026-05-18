'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { Field, Operation, Contact, ProbeAssignment, Repair, FieldSeason } from '@/lib/baserow';
import type { MapField, MapProbe, MapRepair, MapOperation, MapCell, Layers } from './UnifiedMap';
import { zoneOf, CENTER_LAT, CENTER_LNG } from '@/lib/territory-grid';

const UnifiedMap = dynamic(() => import('./UnifiedMap'), { ssr: false });

interface Props {
  fields: Field[];
  operations: Operation[];
  contacts: Contact[];
  fieldSeasons: FieldSeason[];
  probeAssignments: ProbeAssignment[];
  repairs: Repair[];
}

const LAYER_LABELS: Record<keyof Layers, string> = {
  fields: 'Fields',
  probes: 'Probes',
  repairs: 'Repairs',
  customers: 'Customers',
  territory: 'Territory',
};


export default function MapClient({ fields, operations, contacts, fieldSeasons, probeAssignments, repairs }: Props) {
  const [layers, setLayers] = useState<Layers>({
    fields: true,
    probes: true,
    repairs: false,
    customers: false,
    territory: false,
  });

  const toggle = useCallback((key: keyof Layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Build lookup maps
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const operationMap = useMemo(() => new Map(operations.map((o) => [o.id, o])), [operations]);

  // field_season → field
  const fsToField = useMemo(() => {
    const m = new Map<number, Field>();
    for (const fs of fieldSeasons) {
      const fieldLink = fs.field?.[0];
      if (!fieldLink) continue;
      const f = fieldMap.get(fieldLink.id);
      if (f) m.set(fs.id, f);
    }
    return m;
  }, [fieldSeasons, fieldMap]);

  // field → operation name
  const fieldToOperation = useMemo(() => {
    const m = new Map<number, string>();
    for (const f of fields) {
      const be = f.billing_entity?.[0];
      if (be) m.set(f.id, be.value);
    }
    return m;
  }, [fields]);

  // field_season → operation name
  const fsToOperationName = useMemo(() => {
    const m = new Map<number, string>();
    for (const fs of fieldSeasons) {
      const fieldLink = fs.field?.[0];
      if (!fieldLink) continue;
      const opName = fieldToOperation.get(fieldLink.id) ?? '';
      m.set(fs.id, opName);
    }
    return m;
  }, [fieldSeasons, fieldToOperation]);

  // Map fields
  const mapFields = useMemo<MapField[]>(() => {
    const seen = new Set<number>();
    const out: MapField[] = [];
    for (const fs of fieldSeasons) {
      const fieldLink = fs.field?.[0];
      if (!fieldLink) continue;
      if (seen.has(fieldLink.id)) continue;
      seen.add(fieldLink.id);
      const f = fieldMap.get(fieldLink.id);
      const lat = Number(f?.lat);
      const lng = Number(f?.lng);
      if (!f || !lat || !lng || isNaN(lat) || isNaN(lng)) continue;
      out.push({
        id: f.id,
        name: f.name,
        operation: fieldToOperation.get(f.id) ?? '',
        lat,
        lng,
        acres: f.acres,
        crop: fs.crop?.value,
      });
    }
    return out;
  }, [fieldSeasons, fieldMap, fieldToOperation]);

  // Map probes
  const mapProbes = useMemo<MapProbe[]>(() => {
    const out: MapProbe[] = [];
    for (const pa of probeAssignments) {
      const fsLink = pa.field_season?.[0];
      if (!fsLink) continue;
      const field = fsToField.get(fsLink.id);
      if (!field) continue;
      const lat = Number(pa.placement_lat ?? pa.install_lat ?? field.lat);
      const lng = Number(pa.placement_lng ?? pa.install_lng ?? field.lng);
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;
      out.push({
        id: pa.id,
        label: pa.label ?? `Probe ${pa.probe_number ?? 1}`,
        fieldName: field.name,
        operation: fsToOperationName.get(fsLink.id) ?? '',
        lat,
        lng,
        status: pa.probe_status?.value ?? 'Unknown',
      });
    }
    return out;
  }, [probeAssignments, fsToField, fsToOperationName]);

  // Map repairs — join through probe_assignment → field_season → field
  const paToFs = useMemo(() => {
    const m = new Map<number, number>();
    for (const pa of probeAssignments) {
      const fsLink = pa.field_season?.[0];
      if (fsLink) m.set(pa.id, fsLink.id);
    }
    return m;
  }, [probeAssignments]);

  const mapRepairs = useMemo<MapRepair[]>(() => {
    const out: MapRepair[] = [];
    for (const r of repairs) {
      // Try probe_assignment link first
      const paLink = r.probe_assignment?.[0];
      let field: Field | undefined;
      let opName = '';
      if (paLink) {
        const fsId = paToFs.get(paLink.id);
        if (fsId) {
          field = fsToField.get(fsId);
          opName = fsToOperationName.get(fsId) ?? '';
        }
      }
      // Fallback to field_season link
      if (!field) {
        const fsLink = r.field_season?.[0];
        if (fsLink) {
          field = fsToField.get(fsLink.id);
          opName = fsToOperationName.get(fsLink.id) ?? '';
        }
      }
      const rLat = Number(field?.lat);
      const rLng = Number(field?.lng);
      if (!field || !rLat || !rLng || isNaN(rLat) || isNaN(rLng)) continue;
      out.push({
        id: r.id,
        fieldName: field.name,
        operation: opName,
        lat: rLat,
        lng: rLng,
        problem: r.problem,
        fix: r.fix,
        repairedAt: r.repaired_at,
      });
    }
    return out;
  }, [repairs, probeAssignments, paToFs, fsToField, fsToOperationName]);

  // Map operations — centroid of contact lat/lngs
  const mapOperations = useMemo<MapOperation[]>(() => {
    const opContacts = new Map<string, { lats: number[]; lngs: number[]; fieldCount: number }>();

    for (const c of contacts) {
      const cLat = Number(c.address_lat);
      const cLng = Number(c.address_lng);
      if (!cLat || !cLng || isNaN(cLat) || isNaN(cLng)) continue;
      for (const op of c.operations ?? []) {
        if (!opContacts.has(op.value)) {
          opContacts.set(op.value, { lats: [], lngs: [], fieldCount: 0 });
        }
        opContacts.get(op.value)!.lats.push(cLat);
        opContacts.get(op.value)!.lngs.push(cLng);
      }
    }

    // Field counts per operation
    for (const f of mapFields) {
      const entry = opContacts.get(f.operation);
      if (entry) entry.fieldCount++;
    }

    const out: MapOperation[] = [];
    let syntheticId = -1;
    for (const [name, data] of opContacts) {
      if (!data.lats.length) continue;
      const lat = data.lats.reduce((a, b) => a + b, 0) / data.lats.length;
      const lng = data.lngs.reduce((a, b) => a + b, 0) / data.lngs.length;
      out.push({ id: syntheticId--, name, lat, lng, fieldCount: data.fieldCount });
    }
    return out;
  }, [contacts, mapFields]);

  // Territory cells — aggregate fields + probes per cell
  const mapCells = useMemo<MapCell[]>(() => {
    type ZoneData = { band: import('@/lib/territory-grid').LatBand; col: number; name: string; fields: number; probes: number };
    const cellData = new Map<string, ZoneData>();

    const ensure = (lat: number, lng: number) => {
      const z = zoneOf(lat, lng);
      const key = z.name;
      if (!cellData.has(key)) cellData.set(key, { band: z.band, col: z.col, name: z.name, fields: 0, probes: 0 });
      return cellData.get(key)!;
    };

    for (const f of mapFields) ensure(f.lat, f.lng).fields++;
    for (const p of mapProbes) ensure(p.lat, p.lng).probes++;

    return Array.from(cellData.values()).map((d) => ({
      band: d.band,
      col: d.col,
      name: d.name,
      fieldCount: d.fields,
      probeCount: d.probes,
      isHome: d.name === 'M1E',
    }));
  }, [mapFields, mapProbes]);

  // Territory stats
  const territoryStats = useMemo(() => {
    if (!layers.territory) return null;
    const totalFields = mapFields.length;
    const activeZones = mapCells.length;
    const homeCell = mapCells.find((c) => c.isHome);
    const homeCount = homeCell?.fieldCount ?? 0;
    const strongestZone = mapCells.reduce((a, b) => (b.fieldCount > a.fieldCount ? b : a), mapCells[0] ?? { name: '—', fieldCount: 0 });

    return { totalFields, activeZones, homeCount, strongestZone };
  }, [layers.territory, mapFields, mapCells]);

  // Map center: centroid of all fields or home base fallback
  const mapCenter = useMemo<[number, number]>(() => {
    if (mapFields.length === 0) return [CENTER_LAT, CENTER_LNG];
    const lat = mapFields.reduce((s, f) => s + f.lat, 0) / mapFields.length;
    const lng = mapFields.reduce((s, f) => s + f.lng, 0) / mapFields.length;
    return [lat, lng];
  }, [mapFields]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary, #f7f5f2)' }}>
      {/* Territory stat bar */}
      {layers.territory && territoryStats && (
        <div
          style={{
            display: 'flex',
            gap: 24,
            padding: '10px 16px',
            background: '#1a1a1a',
            color: '#fff',
            fontSize: 13,
            flexWrap: 'wrap',
          }}
        >
          <StatChip label="Total Fields" value={territoryStats.totalFields} />
          <StatChip label="Active Zones" value={territoryStats.activeZones} />
          <StatChip label="M1E (Home)" value={`${territoryStats.homeCount} fields`} />
          <StatChip label="Strongest" value={`${territoryStats.strongestZone.name} · ${territoryStats.strongestZone.fieldCount}f`} />
        </div>
      )}

      {/* Map area */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <UnifiedMap
          fields={mapFields}
          probes={mapProbes}
          repairs={mapRepairs}
          operations={mapOperations}
          cells={mapCells}
          layers={layers}
          center={mapCenter}
          zoom={10}
        />

        {/* Layer toggle panel */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 1000,
            background: 'rgba(255,255,255,0.97)',
            borderRadius: 10,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            padding: '10px 14px',
            minWidth: 140,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Layers
          </div>
          {(Object.keys(layers) as (keyof Layers)[]).map((key) => (
            <LayerToggle
              key={key}
              label={LAYER_LABELS[key]}
              active={layers[key]}
              onToggle={() => toggle(key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function LayerToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '4px 0',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        color: active ? '#4a7a5b' : '#a8a29e',
        fontWeight: active ? 600 : 400,
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `2px solid ${active ? '#4a7a5b' : '#d4cfc9'}`,
          background: active ? '#4a7a5b' : 'transparent',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {active && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3.5 6L6.5 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}
