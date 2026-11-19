'use client';
import { fieldBilling } from '@/lib/data-mappings';
import { buildStaffMapFields, hasMapCoords } from './staff-map-fields';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Field, Operation, Contact, ProbeAssignment, Repair, FieldSeason } from '@/lib/types';
import { CANALS_SOURCE_LABEL } from './canals-label';
import type { MapField, MapProbe, MapRepair, MapOperation, MapCell, Layers, SoilsViewStatus, SoilFamilyLegendRow } from './UnifiedMap';
import { DEFAULT_LOWSPOTS_SLIDERS, type LowSpotsSliders, type LowSpotsStatus } from '@/lib/terrain/lowspots-layer';
import LowSpotsSlidersControl from './LowSpotsSliders';
import { zoneOf, CENTER_LAT, CENTER_LNG } from '@/lib/territory-grid';
import { formatLegendRange, feetToMetersExact, metersToWholeFeet, type ElevRange } from '@/lib/terrain/color-scale';
import type { TerrainMode } from '@/lib/terrain/modes';
import {
  defaultElevColorPrefs,
  ELEV_COLOR_PREFS_KEY,
  parseElevColorPrefs,
  serializeElevColorPrefs,
  type ElevColorPrefs,
} from '@/lib/terrain/elev-color-prefs';
import { elevationButtonLabel } from '@/lib/terrain/viewport-scale';
import { ElevColorControls } from './ElevColorControls';

const UnifiedMap = dynamic(() => import('./UnifiedMap'), { ssr: false });

interface Props {
  fields: Field[];
  operations: Operation[];
  contacts: Contact[];
  fieldSeasons: FieldSeason[];
  probeAssignments: ProbeAssignment[];
  repairs: Repair[];
  boundedFieldIds: number[];
}

const LAYER_LABELS: Record<keyof Layers, string> = {
  fields: 'Fields',
  probes: 'Probes',
  plantDays: 'Planting Days',
  repairs: 'Repairs',
  customers: 'Customers',
  territory: 'Territory',
  canals: 'Canals',
  soils: 'Soils',
  lowSpots: 'Low spots',
};

/** Collapsed/expanded Layers panel. Absent means follow the viewport default. */
const LAYERS_PANEL_KEY = 'acre-ops-map-layers-open';
const LAYERS_PANEL_NARROW = '(max-width: 768px)';

function readStoredLayersOpen(): boolean | null {
  try {
    const raw = window.localStorage.getItem(LAYERS_PANEL_KEY);
    if (raw === 'open') return true;
    if (raw === 'closed') return false;
  } catch {
    // private mode or blocked storage
  }
  return null;
}

function defaultLayersOpen(): boolean {
  try {
    return !window.matchMedia(LAYERS_PANEL_NARROW).matches;
  } catch {
    return true;
  }
}


export default function MapClient({ fields, operations, contacts, fieldSeasons, probeAssignments, repairs, boundedFieldIds }: Props) {
  const [layers, setLayers] = useState<Layers>({
    fields: true,
    probes: true,
    plantDays: false,
    repairs: false,
    customers: false,
    territory: false,
    canals: false,
    soils: false,
    lowSpots: false,
  });
  const [soilsStatus, setSoilsStatus] = useState<SoilsViewStatus>('off');
  const [soilFamilies, setSoilFamilies] = useState<SoilFamilyLegendRow[]>([]);
  const [lowSpotsStatus, setLowSpotsStatus] = useState<LowSpotsStatus>('off');
  const [lowSpotsSliders, setLowSpotsSliders] = useState<LowSpotsSliders>(DEFAULT_LOWSPOTS_SLIDERS);
  const [elevationMode, setElevationMode] = useState<TerrainMode>('off');
  const [elevRange, setElevRange] = useState<ElevRange | null>(null);
  const [elevPrefs, setElevPrefs] = useState<ElevColorPrefs>(defaultElevColorPrefs);
  const [prefsReady, setPrefsReady] = useState(false);
  // null = no saved pref yet; CSS defaults to collapsed on phones, open on desktop
  const [layersOpen, setLayersOpen] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setElevPrefs(parseElevColorPrefs(window.localStorage.getItem(ELEV_COLOR_PREFS_KEY)));
    } catch {
      setElevPrefs(defaultElevColorPrefs());
    }
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      window.localStorage.setItem(ELEV_COLOR_PREFS_KEY, serializeElevColorPrefs(elevPrefs));
    } catch {
      // private mode or blocked storage — controls still work for this session
    }
  }, [elevPrefs, prefsReady]);

  useEffect(() => {
    setLayersOpen(readStoredLayersOpen());
  }, []);

  const autoLoFt = elevRange ? metersToWholeFeet(elevRange.lo) : null;
  const autoHiFt = elevRange ? metersToWholeFeet(elevRange.hi) : null;
  const colorOn = elevationMode === 'colorshade' || elevationMode === 'color';
  const elevOn = colorOn || elevationMode === 'shade';
  const elevColor = useMemo(() => {
    const manual = !elevPrefs.auto
      && elevPrefs.loFt != null
      && elevPrefs.hiFt != null
      && elevPrefs.hiFt > elevPrefs.loFt
      ? { lo: feetToMetersExact(elevPrefs.loFt), hi: feetToMetersExact(elevPrefs.hiFt) }
      : null;
    return { manualRange: manual, spread: elevPrefs.spread, relief: elevPrefs.relief / 100 };
  }, [elevPrefs]);

  const toggle = useCallback((key: keyof Layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleLayersPanel = useCallback(() => {
    setLayersOpen((prev) => {
      const next = !(prev ?? defaultLayersOpen());
      try {
        window.localStorage.setItem(LAYERS_PANEL_KEY, next ? 'open' : 'closed');
      } catch {
        // private mode or blocked storage — toggle still works for this session
      }
      return next;
    });
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
      m.set(f.id, fieldBilling(f).label);
    }
    return m;
  }, [fields]);

  // field_season → planting date
  const fsToPlantingDate = useMemo(() => {
    const m = new Map<number, string>();
    for (const fs of fieldSeasons) {
      if (fs.planting_date) m.set(fs.id, fs.planting_date);
    }
    return m;
  }, [fieldSeasons]);

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

  // Map fields: current-season fields plus every field that has a boundary.
  const mapFields = useMemo<MapField[]>(() => {
    return buildStaffMapFields({ fields, fieldSeasons, boundedFieldIds });
  }, [fields, fieldSeasons, boundedFieldIds]);

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
        plantingDate: fsToPlantingDate.get(fsLink.id),
      });
    }
    return out;
  }, [probeAssignments, fsToField, fsToOperationName, fsToPlantingDate]);

  // Planting days probes — uninstalled only, colored by days since planting
  const plantDaysProbes = useMemo<MapProbe[]>(() => {
    return mapProbes.filter((p) => {
      const s = p.status.toLowerCase();
      return !s.includes('install') && !s.includes('active');
    });
  }, [mapProbes]);

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

    for (const f of mapFields) {
      if (hasMapCoords(f.lat, f.lng)) ensure(f.lat!, f.lng!).fields++;
    }
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
    const located = mapFields.filter((f) => hasMapCoords(f.lat, f.lng));
    if (located.length === 0) return [CENTER_LAT, CENTER_LNG];
    const lat = located.reduce((s, f) => s + (f.lat as number), 0) / located.length;
    const lng = located.reduce((s, f) => s + (f.lng as number), 0) / located.length;
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
          plantDaysProbes={plantDaysProbes}
          repairs={mapRepairs}
          operations={mapOperations}
          cells={mapCells}
          layers={layers}
          center={mapCenter}
          zoom={10}
          onSoilsStatus={setSoilsStatus}
          onSoilFamilies={setSoilFamilies}
          onLowSpotsStatus={setLowSpotsStatus}
          lowSpotsSliders={lowSpotsSliders}
          elevationMode={elevationMode}
          onElevationRange={setElevRange}
          elevColor={elevColor}
          elevOpacity={elevPrefs.opacity / 100}
        />

        <img
          src="/acre-insights-logo-footer.png"
          alt="Acre Insights"
          width={140}
          height={21}
          style={{
            position: 'absolute',
            left: 10,
            bottom: 12,
            width: 'clamp(88px, 22vw, 140px)',
            height: 'auto',
            zIndex: 500,
            pointerEvents: 'none',
            userSelect: 'none',
            boxShadow: 'none',
            filter: 'none',
          }}
        />

        {/* Layer toggle panel */}
        <div
          className={`staff-layers-panel${elevOn || layers.lowSpots ? ' is-wide' : ''}${layersOpen === true ? ' is-open' : layersOpen === false ? ' is-closed' : ''}`}
        >
          <button
            type="button"
            className="staff-layers-toggle"
            aria-expanded={layersOpen ?? undefined}
            aria-controls="staff-layers-body"
            onClick={toggleLayersPanel}
          >
            Layers
            <svg className="staff-layers-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div id="staff-layers-body" className="staff-layers-body">
          {(Object.keys(layers) as (keyof Layers)[]).map((key) => (
            <div key={key}>
              <LayerToggle
                label={LAYER_LABELS[key]}
                active={layers[key]}
                onToggle={() => toggle(key)}
              />
              {key === 'soils' && layers.soils && soilsStatus === 'zoom' ? (
                <div style={{ fontSize: 11, color: '#78716c', padding: '0 0 6px 22px', lineHeight: 1.3 }}>
                  Zoom in to see soils
                </div>
              ) : null}
              {key === 'soils' && layers.soils && soilsStatus === 'wide' ? (
                <SoilFamiliesNote rows={soilFamilies} />
              ) : null}
              {key === 'soils' && layers.soils && soilsStatus === 'loading' ? (
                <div style={{ fontSize: 11, color: '#78716c', padding: '0 0 6px 22px', lineHeight: 1.3 }}>
                  Loading soils…
                </div>
              ) : null}
              {key === 'soils' && layers.soils && soilsStatus === 'error' ? (
                <div style={{ fontSize: 11, color: '#78716c', padding: '0 0 6px 22px', lineHeight: 1.3 }}>
                  Soil map isn’t available right now.
                </div>
              ) : null}
              {key === 'canals' && layers.canals ? (
                <div style={{ fontSize: 11, color: '#78716c', padding: '0 0 6px 22px', lineHeight: 1.3 }}>
                  Kearney and Phelps counties. {CANALS_SOURCE_LABEL}
                </div>
              ) : null}
              {key === 'lowSpots' && layers.lowSpots ? (
                <div className="map-lowspots-controls">
                  <LowSpotsNote status={lowSpotsStatus} />
                  <LowSpotsSlidersControl value={lowSpotsSliders} onChange={setLowSpotsSliders} />
                </div>
              ) : null}
            </div>
          ))}
          <ElevationToggle
            mode={elevationMode}
            range={elevRange}
            onChoose={setElevationMode}
          />
          {elevOn ? (
            <ElevColorControls
              autoLoFt={autoLoFt}
              autoHiFt={autoHiFt}
              loFt={elevPrefs.loFt}
              hiFt={elevPrefs.hiFt}
              auto={elevPrefs.auto}
              spread={elevPrefs.spread}
              relief={elevPrefs.relief}
              opacity={elevPrefs.opacity}
              showColor={colorOn}
              onAuto={() => setElevPrefs((prev) => ({
                ...prev,
                auto: true,
                loFt: autoLoFt,
                hiFt: autoHiFt,
              }))}
              onSpread={(spread) => setElevPrefs((prev) => ({ ...prev, spread }))}
              onRange={(loFt, hiFt) => setElevPrefs((prev) => ({ ...prev, auto: false, loFt, hiFt }))}
              onRelief={(relief) => setElevPrefs((prev) => ({ ...prev, relief }))}
              onOpacity={(opacity) => setElevPrefs((prev) => ({ ...prev, opacity }))}
            />
          ) : null}
          {layers.plantDays && (
            <div style={{ borderTop: '1px solid #e7e5e4', marginTop: 8, paddingTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Days Since Planting</div>
              {[
                { color: '#34c759', label: '16+ — ready' },
                { color: '#ff9f0a', label: '11–15 days' },
                { color: '#ff6b35', label: '6–10 days' },
                { color: '#ff3b30', label: '0–5 — too early' },
                { color: '#c7c7cc', label: 'No date' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ color: '#57534e' }}>{label}</span>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ElevationToggle({
  mode,
  range,
  onChoose,
}: {
  mode: TerrainMode;
  range: ElevRange | null;
  onChoose: (mode: TerrainMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const on = mode === 'colorshade' || mode === 'shade' || mode === 'color';
  const label = elevationButtonLabel(mode);
  const phrase = on && range ? formatLegendRange(range.lo, range.hi) : '';

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (next: TerrainMode) => {
    onChoose(next);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={on}
        onClick={() => setOpen((value) => !value)}
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
          color: on ? '#4a7a5b' : '#a8a29e',
          fontWeight: on ? 600 : 400,
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: `2px solid ${on ? '#4a7a5b' : '#d4cfc9'}`,
            background: on ? '#4a7a5b' : 'transparent',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {on && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 4L3.5 6L6.5 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span style={{ flex: 1 }}>{label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Elevation"
          style={{
            margin: '0 0 6px 22px',
            padding: '4px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          {on ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => pick('off')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '4px 0',
                fontSize: 13,
                color: '#78716c',
              }}
            >
              Off
            </button>
          ) : null}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'colorshade'}
            onClick={() => pick('colorshade')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              padding: '4px 0',
              fontSize: 13,
              fontWeight: mode === 'colorshade' ? 600 : 400,
              color: mode === 'colorshade' ? '#4a7a5b' : '#57534e',
            }}
          >
            Color
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'shade'}
            onClick={() => pick('shade')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              padding: '4px 0',
              fontSize: 13,
              fontWeight: mode === 'shade' ? 600 : 400,
              color: mode === 'shade' ? '#4a7a5b' : '#57534e',
            }}
          >
            Gray
          </button>
        </div>
      ) : null}
      {phrase ? (
        <div style={{ fontSize: 11, color: '#78716c', padding: '0 0 6px 22px', lineHeight: 1.3 }}>
          {phrase}
        </div>
      ) : null}
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

const LOWSPOTS_NOTE: Partial<Record<LowSpotsStatus, string>> = {
  zoom: 'Zoom in to see low spots',
  loading: 'Finding low spots…',
  nodata: 'No lidar here.',
  error: 'Lidar isn’t available right now.',
};

function LowSpotsNote({ status }: { status: LowSpotsStatus }) {
  const text = LOWSPOTS_NOTE[status]
    ?? (status === 'ready' ? 'Blue: where water pools, darker is deeper (2 ft+). Lines: where water runs.' : null);
  if (!text) return null;
  return (
    <div style={{ fontSize: 11, color: '#78716c', padding: '0 0 4px', lineHeight: 1.3 }}>
      {text}
    </div>
  );
}

/** Zoomed-out Soils: the most common soil families on screen, with their fill colors. */
function SoilFamiliesNote({ rows }: { rows: SoilFamilyLegendRow[] }) {
  return (
    <div style={{ fontSize: 11, color: '#57534e', padding: '0 0 6px 22px', lineHeight: 1.35, maxWidth: 210 }}>
      <div style={{ color: '#78716c', marginBottom: 3 }}>Soil families. Tap the map for a name; zoom in for map units.</div>
      {rows.map((row) => (
        <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: row.color, flex: '0 0 auto' }} />
          <span>{row.name}</span>
        </div>
      ))}
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
