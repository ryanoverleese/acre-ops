'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode, type MutableRefObject } from 'react';
import dynamic from 'next/dynamic';
const InstallerMapView = dynamic(() => import('./InstallerMapView'), { ssr: false });
const InstallGpsMap = dynamic(() => import('./InstallGpsMap'), { ssr: false });
const FieldMiniMap = dynamic(() => import('./FieldMiniMap'), { ssr: false });
import {
  ANTENNA_OPTIONS,
  TopoDeco,
  calcFlags,
  compressImage,
  getMapProvider,
  getRemovalsShowAll,
  mapsUrlFor,
  probeBadgeColors,
  playSuccessSound,
  MAP_PROVIDER_KEY,
  REMOVALS_SHOW_ALL_KEY,
  MenuGroup,
  MenuRow,
  type Filter,
  type HideableTab,
  type InstallerAssignment,
  type MapProvider,
  type Session,
  type SuccessData,
  type WorkflowMode,
} from './installerShared';

interface FieldLocation {
  id: number;
  name: string;
  operation: string;
  acres: number;
  lat: number;
  lng: number;
  installLat?: number;
  installLng?: number;
  waterSource?: string;
  fuelSource?: string;
  notes?: string;
  irrigationType?: string;
  rowDirection?: string;
  dripTubingDirection?: string;
  dripTubingSpacing?: number;
  dripEmitterSpacing?: number;
  dripZones?: number;
  dripGpm?: number;
  dripDepth?: number;
  elevation?: string | number;
  soilType?: string;
  placementNotes?: string;
}

export default function LocationsScreen({ onBack }: { onBack: () => void }) {
  const [locations, setLocations] = useState<FieldLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<FieldLocation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/installer/locations');
        const data = await res.json();
        if (!cancelled) setLocations(data.fields ?? []);
      } catch {
        if (!cancelled) setLocations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? locations.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.operation.toLowerCase().includes(q))
    : locations;

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button
          onClick={onBack}
          style={{ color: 'var(--field-green)', padding: 6, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="Back"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Locations</div>
          <div className="af-topbar-sub">{locations.length} field{locations.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="af-body" style={{ padding: '12px 14px 24px', background: '#FFFFFF' }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', background: 'var(--bone-raised)',
          border: '1px solid var(--border-1)', borderRadius: 'var(--r-md)',
          marginBottom: 14,
        }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ color: 'var(--stone-500)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Field or operation"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit' }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ color: 'var(--stone-500)', padding: 4, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
              aria-label="Clear"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          )}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)', fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Loading fields…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {q ? 'No fields match' : 'No fields found'}
            </div>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(f => {
              const isInstalled = !!(f.installLat && f.installLng);
              return (
                <button
                  key={f.id}
                  onClick={() => setSelected(f)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', textAlign: 'left',
                    padding: '14px', background: 'var(--bone-raised)',
                    border: '1px solid var(--border-1)', borderRadius: 'var(--r-md)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)', letterSpacing: '0.01em' }}>{f.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 2 }}>
                      {f.operation}{f.acres ? ` · ${f.acres} ac` : ''}
                    </div>
                  </div>
                  {isInstalled && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--field-green)', background: 'var(--sage-wash)',
                      padding: '4px 8px', borderRadius: 'var(--r-pill)',
                    }}>
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                      Installed
                    </span>
                  )}
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ color: 'var(--stone-400)', flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,10,10,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={() => setSelected(null)}>
          <div style={{ background: 'var(--bone)', borderRadius: '16px 16px 0 0', maxHeight: '85%', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Sheet header */}
            <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 2 }}>{selected.operation}{selected.acres ? ` · ${selected.acres} ac` : ''}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--stone-500)', padding: 4 }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Detail body */}
            <div style={{ padding: '14px 16px', overflowY: 'auto' }}>
              <DetailRows selected={selected} />
            </div>

            {/* Nav actions */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border-1)', flexShrink: 0 }}>
              {selected.lat !== 0 && selected.lng !== 0 && (
                <a
                  href={mapsUrlFor(selected.lat, selected.lng, getMapProvider())}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 0', background: 'var(--field-green)', color: 'var(--bone)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 'var(--r-md)', textDecoration: 'none' }}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  Planned
                </a>
              )}
              {selected.installLat && selected.installLng && (
                <a
                  href={mapsUrlFor(selected.installLat, selected.installLng, getMapProvider())}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 0', background: 'transparent', color: 'var(--field-green)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', border: '1.5px solid var(--field-green)', borderRadius: 'var(--r-md)', textDecoration: 'none' }}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                  Installed
                </a>
              )}
            </div>
            <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function LocationDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-1)' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--stone-500)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--ink)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function DetailRows({ selected }: { selected: FieldLocation }) {
  const isDrip = selected.irrigationType === 'Drip';
  return (
    <>
      {selected.acres > 0 && <LocationDetailRow label="Acres" value={selected.acres} />}
      {selected.lat !== 0 && selected.lng !== 0 && (
        <LocationDetailRow
          label="Coordinates"
          value={
            <a href={mapsUrlFor(selected.lat, selected.lng, getMapProvider())} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--field-green)', fontFamily: 'var(--font-mono)' }}>
              {Number(selected.lat).toFixed(5)}, {Number(selected.lng).toFixed(5)}
            </a>
          }
        />
      )}
      {selected.waterSource && <LocationDetailRow label="Water Source" value={selected.waterSource} />}
      {selected.fuelSource && <LocationDetailRow label="Fuel Source" value={selected.fuelSource} />}
      {selected.notes && <LocationDetailRow label="Notes" value={selected.notes} />}

      {(selected.irrigationType || selected.rowDirection) && (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone-400)', margin: '14px 0 4px' }}>Irrigation</div>
          {selected.irrigationType && <LocationDetailRow label="Type" value={selected.irrigationType} />}
          {selected.rowDirection && <LocationDetailRow label="Row Direction" value={selected.rowDirection} />}
          {isDrip && selected.dripTubingDirection && <LocationDetailRow label="Tubing Direction" value={selected.dripTubingDirection} />}
          {isDrip && selected.dripTubingSpacing && <LocationDetailRow label="Tubing Spacing" value={`${selected.dripTubingSpacing}"`} />}
          {isDrip && selected.dripEmitterSpacing && <LocationDetailRow label="Emitter Spacing" value={`${selected.dripEmitterSpacing}"`} />}
          {isDrip && selected.dripZones && <LocationDetailRow label="Zones" value={selected.dripZones} />}
          {isDrip && selected.dripGpm && <LocationDetailRow label="GPM" value={selected.dripGpm} />}
          {isDrip && selected.dripDepth && <LocationDetailRow label="Depth" value={`${selected.dripDepth}"`} />}
        </>
      )}

      {(selected.elevation || selected.soilType || selected.placementNotes) && (
        <>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone-400)', margin: '14px 0 4px' }}>Location Details</div>
          {selected.elevation && <LocationDetailRow label="Elevation" value={`${selected.elevation} ft`} />}
          {selected.soilType && <LocationDetailRow label="Soil Type" value={selected.soilType} />}
          {selected.placementNotes && <LocationDetailRow label="Placement Notes" value={selected.placementNotes} />}
        </>
      )}
    </>
  );
}

// ─── Probe Lookup Screen ──────────────────────────────────────────────────────

interface ProbeSearchResult {
  id: number;
  serialNumber: string;
  brand: string;
  billingEntity: string;
  rack: string;
  rackSlot: string;
  currentField: string;
}

