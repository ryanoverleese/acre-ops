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
import NotesThread from '@/components/NotesThread';
import { useFieldBoundaries } from '@/components/useFieldBoundaries';
import { PullForm, type RemovalRow } from './RemovalsScreen';
import {
  defaultRouteFilter,
  loadRouteFilter,
  matchesRouteFilter,
  routeFilterLabel,
  saveRouteFilter,
  type RemovalsRouteFilter,
} from './removalsRouteFilter';
import { prefetchRemovalTiles } from './tilePrefetch';
import {
  chicagoToday,
  countTodayPulls,
  formatTodayPullCounts,
  matchesPlannedRemover,
} from './todayPullCounts';

type RemovalMapRow = RemovalRow;

export default function MapScreen({
  assignments,
  loading,
  onOpenField,
  onBack,
  season,
  installer,
  workflowMode = 'install',
  savedViewRef,
  onSelectRepair,
}: {
  assignments: InstallerAssignment[];
  loading?: boolean;
  onOpenField: (a: InstallerAssignment) => void;
  onBack: () => void;
  season: number;
  installer?: string;
  workflowMode?: WorkflowMode;
  savedViewRef?: React.MutableRefObject<{ center: [number, number]; zoom: number } | null>;
  onSelectRepair?: (id: number) => void;
}) {
  const isRemove = workflowMode === 'remove';

  // Install: preselect next stop. Remove: no preselect (tap opens PullForm).
  const [selectedId, setSelectedId] = useState<number | null>(
    isRemove ? null : (assignments.find(a => a.status.toLowerCase() !== 'installed')?.id ?? null)
  );
  const [layer, setLayer] = useState<'street' | 'satellite'>('satellite');
  const [showInstalled, setShowInstalled] = useState(false);
  const [repairPoints, setRepairPoints] = useState<{ id: number; lat: number; lng: number; fieldName: string; operation: string; problem: string; watchList?: boolean }[]>([]);
  const [removalRows, setRemovalRows] = useState<RemovalMapRow[]>([]);
  const [removalsLoading, setRemovalsLoading] = useState(false);
  const [showAllRemovals, setShowAllRemovals] = useState(false);
  const [routeFilter, setRouteFilter] = useState<RemovalsRouteFilter>('all');
  const [routeFilterReady, setRouteFilterReady] = useState(false);
  const boundaries = useFieldBoundaries([...assignments.map(a => a.fieldId), ...removalRows.map(row => row.fieldId)]);

  useEffect(() => {
    if (isRemove) return; // repairs clutter the pull map
    fetch(`/api/installer/repairs?season=${season}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setRepairPoints((d.repairs ?? []).filter((r: { lat: number; lng: number }) => r.lat && r.lng)));
  }, [season, isRemove]);

  useEffect(() => {
    if (!isRemove || !installer) return;
    setShowAllRemovals(getRemovalsShowAll());
    const stored = loadRouteFilter();
    if (stored) {
      setRouteFilter(stored);
      setRouteFilterReady(true);
    } else {
      setRouteFilterReady(false);
    }
  }, [isRemove, installer]);

  useEffect(() => {
    if (!isRemove || !installer) return;
    let cancelled = false;
    (async () => {
      setRemovalsLoading(true);
      try {
        // Fleet fetch so today Ryan/Brandon/Carter counts stay accurate under Mine.
        const qs = new URLSearchParams({ season: String(season), installer, all: '1' });
        const res = await fetch(`/api/installer/removals?${qs}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) setRemovalRows(data.rows ?? []);
      } catch {
        if (!cancelled) setRemovalRows([]);
      } finally {
        if (!cancelled) setRemovalsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isRemove, installer, season]);

  const [tileWarmHint, setTileWarmHint] = useState<string | null>(null);

  // Dead-zone mode: while Removals/pull map has signal, warm-fetch tiles around
  // still-out stops (Cache Storage via installer SW + browser Image cache).
  useEffect(() => {
    if (!isRemove) return;
    const scoped = showAllRemovals
      ? removalRows
      : removalRows.filter(r => matchesPlannedRemover(r.plannedRemover, installer || ''));
    const stillOut = scoped.filter(
      r => !r.removed && r.lat && r.lng && matchesRouteFilter(r.routeOrder, routeFilter),
    );
    if (stillOut.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    let cancelled = false;
    setTileWarmHint('Warming map tiles…');
    prefetchRemovalTiles(
      stillOut.map(r => ({ lat: r.lat, lng: r.lng })),
      layer
    ).then((res) => {
      if (cancelled) return;
      if (res.mode === 'online-warm' && res.urls > 0) {
        setTileWarmHint(`Tiles ready (${res.urls}) — open before dead zone`);
        window.setTimeout(() => { if (!cancelled) setTileWarmHint(null); }, 4500);
      } else {
        setTileWarmHint(null);
      }
    }).catch(() => { if (!cancelled) setTileWarmHint(null); });
    return () => { cancelled = true; };
  }, [isRemove, removalRows, layer, routeFilter, showAllRemovals, installer]);

  const toggleShowAllRemovals = () => {
    const next = !showAllRemovals;
    setShowAllRemovals(next);
    try { localStorage.setItem(REMOVALS_SHOW_ALL_KEY, next ? '1' : '0'); } catch { /* private mode */ }
  };

  // Default A/B/All once removal rows arrive when nothing persisted yet.
  useEffect(() => {
    if (!isRemove || routeFilterReady || removalsLoading) return;
    const stored = loadRouteFilter();
    if (stored) {
      setRouteFilter(stored);
      setRouteFilterReady(true);
      return;
    }
    const scoped = showAllRemovals
      ? removalRows
      : removalRows.filter(r => matchesPlannedRemover(r.plannedRemover, installer || ''));
    const next = defaultRouteFilter(scoped);
    setRouteFilter(next);
    saveRouteFilter(next);
    setRouteFilterReady(true);
  }, [isRemove, removalRows, removalsLoading, routeFilterReady, showAllRemovals, installer]);

  const handleRouteFilter = (next: RemovalsRouteFilter) => {
    setRouteFilter(next);
    saveRouteFilter(next);
    setRouteFilterReady(true);
  };

  // ── Remove-mode map ────────────────────────────────────────────────────────
  if (isRemove) {
    const todayCounts = countTodayPulls(removalRows);
    const scopedRows = showAllRemovals
      ? removalRows
      : removalRows.filter(r => matchesPlannedRemover(r.plannedRemover, installer || ''));
    const stillOut = scopedRows.filter(
      r => !r.removed && r.lat && r.lng && matchesRouteFilter(r.routeOrder, routeFilter),
    );
    const selectedRemoval = removalRows.find(r => r.id === selectedId) ?? null;
    const mapPoints = stillOut.map(r => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      // route_order is install-only — plain dots on the pull map
      routeOrder: '',
      status: 'Assigned', // still out — not installed checkmark styling
      fieldName: r.fieldName,
      operation: r.grower || r.plannedRemover || '',
      probeSerial: r.probeSerial,
      antennaType: r.antennaType,
      crop: r.crop,
      priority: r.removalPriority === 'Priority',
    }));

    // Pin tap opens the same PullForm as the Removals list — Navigate stays on that form.
    const handleSelectRemoval = (id: number) => {
      setSelectedId(id);
    };

    if (selectedRemoval && !selectedRemoval.removed && installer) {
      return (
        <PullForm
          row={selectedRemoval}
          installer={installer}
          onBack={() => setSelectedId(null)}
          onSaved={(id, removedBy) => {
            const today = chicagoToday();
            setRemovalRows(rs => rs.map(r => (r.id === id ? { ...r, removed: true, removedOn: today, removedBy } : r)));
            setSelectedId(null);
          }}
        />
      );
    }

    return (
      <div className="af-screen">
        <div className="af-topbar">
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--field-green)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
            Removals
          </button>
          <div style={{ textAlign: 'center' }}>
            <div className="af-topbar-title">Pull map</div>
            <div className="af-topbar-sub">
              {removalsLoading
                ? '…'
                : `${stillOut.length} still out · ${showAllRemovals ? 'all' : 'mine'} · ${routeFilterLabel(routeFilter)}`}
            </div>
          </div>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ flex: 1, position: 'relative', background: '#dde5d0' }}>
          {stillOut.length === 0 ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--stone-500)' }}>
              <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
              </svg>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {removalsLoading ? 'Loading map…' : 'No pull stops with coords'}
              </div>
              {!removalsLoading && routeFilter !== 'all' && (
                <div style={{ fontSize: 13, marginTop: 6 }}>Try All, or another route</div>
              )}
              {!removalsLoading && routeFilter === 'all' && !showAllRemovals && (
                <div style={{ fontSize: 13, marginTop: 6 }}>Tap Show all, or check Removals list</div>
              )}
            </div>
          ) : (
            <InstallerMapView
              points={mapPoints}
              selectedId={selectedId}
              onSelect={handleSelectRemoval}
              layer={layer}
              boundaries={boundaries}
              initialView={savedViewRef?.current ?? null}
              onViewChange={(v) => { if (savedViewRef) savedViewRef.current = v; }}
            />
          )}

          {tileWarmHint && stillOut.length > 0 && (
            <div
              style={{
                position: 'absolute', top: 14, left: 14, right: 120, zIndex: 400,
                background: 'rgba(31,64,42,0.92)', color: 'var(--bone)',
                borderRadius: 'var(--r-pill)', padding: '8px 12px',
                fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                pointerEvents: 'none',
              }}
            >
              {tileWarmHint}
            </div>
          )}

          {(removalRows.length > 0 || removalsLoading || stillOut.length > 0) && (
            <>
              <div style={{
                position: 'absolute', top: 14, right: 14, zIndex: 400,
                background: 'rgba(246,242,234,0.94)', backdropFilter: 'blur(10px)',
                border: '1px solid var(--border-1)', borderRadius: 'var(--r-pill)',
                padding: 3, display: 'flex', gap: 2,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
                {(['street', 'satellite'] as const).map(lyr => (
                  <button
                    key={lyr}
                    onClick={() => setLayer(lyr)}
                    aria-pressed={layer === lyr ? 'true' : 'false'}
                    style={{
                      minHeight: 32, padding: '0 12px', borderRadius: 999,
                      fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      background: layer === lyr ? 'var(--field-green)' : 'transparent',
                      color: layer === lyr ? 'var(--bone)' : 'var(--stone-700)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {lyr === 'street' ? 'Map' : 'Satellite'}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleShowAllRemovals}
                style={{
                  position: 'absolute', top: 58, right: 14, zIndex: 400,
                  background: showAllRemovals ? 'var(--field-green)' : 'rgba(246,242,234,0.94)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid var(--border-1)', borderRadius: 'var(--r-pill)',
                  padding: '0 12px', minHeight: 32,
                  fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: showAllRemovals ? 'var(--bone)' : 'var(--stone-700)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                }}
              >
                {showAllRemovals ? 'Show all: On' : 'Show all: Off'}
              </button>
              <div
                role="group"
                aria-label="Removal route filter"
                style={{
                  position: 'absolute', top: 98, left: 14, right: 14, zIndex: 400,
                  display: 'flex', gap: 4, padding: 3, borderRadius: 12,
                  background: 'rgba(246,242,234,0.94)', backdropFilter: 'blur(10px)',
                  border: '1px solid var(--border-1)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
              >
                {([
                  { id: 'A' as const, label: 'A' },
                  { id: 'B' as const, label: 'B' },
                  { id: 'all' as const, label: 'All' },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={routeFilter === opt.id ? 'true' : 'false'}
                    onClick={() => handleRouteFilter(opt.id)}
                    style={{
                      flex: 1, minHeight: 32, padding: '6px 0', borderRadius: 10, cursor: 'pointer',
                      border: 'none',
                      background: routeFilter === opt.id ? 'var(--field-green)' : 'transparent',
                      color: routeFilter === opt.id ? 'var(--bone)' : 'var(--stone-700)',
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {stillOut.length > 0 && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('af-recenter-me'))}
              aria-label="Recenter on my location"
              style={{
                position: 'absolute', bottom: 14, right: 14, zIndex: 400,
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--bone-raised)', color: 'var(--field-green)',
                border: '1px solid var(--border-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.18)', cursor: 'pointer',
              }}
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
                <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
              </svg>
            </button>
          )}
        </div>

        {/* Today pulls — above field tile / bottom nav, never over Navigate */}
        <div
          aria-label="Today's pulls"
          style={{
            flexShrink: 0,
            textAlign: 'center',
            padding: '5px 12px 6px',
            fontSize: 11,
            lineHeight: 1.2,
            color: 'var(--stone-500)',
            background: 'var(--bone)',
            borderTop: '1px solid var(--border-1)',
          }}
        >
          {removalsLoading ? '…' : formatTodayPullCounts(todayCounts)}
        </div>
      </div>
    );
  }

  // ── Install-mode map (unchanged) ───────────────────────────────────────────
  const todo = assignments.filter(a => a.status.toLowerCase() !== 'installed');
  const mapAssignments = showInstalled ? assignments : assignments.filter(a => a.status.toLowerCase() !== 'installed');
  const withCoords = mapAssignments.filter(a => a.lat && a.lng);
  const selected = assignments.find(a => a.id === selectedId) ?? null;

  const mapPoints = withCoords.map(a => ({
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    routeOrder: a.routeOrder,
    status: a.status,
    fieldName: a.fieldName,
    operation: a.operation,
    probeSerial: a.probeSerial,
    antennaType: a.antennaType,
    crop: a.crop,
    placementNotes: a.fieldNotes,
    probeRack: a.probeRack,
    probeRackSlot: a.probeRackSlot,
  }));

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--field-green)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          Route
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Today&apos;s map</div>
          <div className="af-topbar-sub">{todo.length} stop{todo.length !== 1 ? 's' : ''} remaining</div>
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative', background: '#dde5d0' }}>
        {withCoords.length === 0 && repairPoints.length === 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--stone-500)' }}>
            <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
            </svg>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {loading ? 'Loading map…' : 'No coordinates available'}
            </div>
          </div>
        ) : (
          <InstallerMapView
            points={mapPoints}
            selectedId={selectedId}
            onSelect={setSelectedId}
            layer={layer}
            boundaries={boundaries}
            repairPoints={repairPoints}
            onSelectRepair={onSelectRepair}
            initialView={savedViewRef?.current ?? null}
            onViewChange={(v) => { if (savedViewRef) savedViewRef.current = v; }}
          />
        )}

        {/* Layer toggle */}
        {(withCoords.length > 0 || repairPoints.length > 0) && (
          <>
            <div style={{
              position: 'absolute', top: 14, right: 14, zIndex: 400,
              background: 'rgba(246,242,234,0.94)', backdropFilter: 'blur(10px)',
              border: '1px solid var(--border-1)', borderRadius: 'var(--r-pill)',
              padding: 3, display: 'flex', gap: 2,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              {(['street', 'satellite'] as const).map(lyr => (
                <button
                  key={lyr}
                  onClick={() => setLayer(lyr)}
                  aria-pressed={layer === lyr ? 'true' : 'false'}
                  style={{
                    minHeight: 32, padding: '0 12px', borderRadius: 999,
                    fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: layer === lyr ? 'var(--field-green)' : 'transparent',
                    color: layer === lyr ? 'var(--bone)' : 'var(--stone-700)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {lyr === 'street' ? 'Map' : 'Satellite'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowInstalled(v => !v)}
              style={{
                position: 'absolute', top: 58, right: 14, zIndex: 400,
                background: showInstalled ? 'var(--field-green)' : 'rgba(246,242,234,0.94)',
                backdropFilter: 'blur(10px)',
                border: '1px solid var(--border-1)', borderRadius: 'var(--r-pill)',
                padding: '0 12px', minHeight: 32,
                fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: showInstalled ? 'var(--bone)' : 'var(--stone-700)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                cursor: 'pointer',
              }}
            >
              {showInstalled ? 'Installed: On' : 'Installed: Off'}
            </button>
          </>
        )}

        {/* Recenter on me */}
        {withCoords.length > 0 && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('af-recenter-me'))}
            aria-label="Recenter on my location"
            style={{
              position: 'absolute', bottom: 14, right: 14, zIndex: 400,
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--bone-raised)', color: 'var(--field-green)',
              border: '1px solid var(--border-1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)', cursor: 'pointer',
            }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
              <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
            </svg>
          </button>
        )}
      </div>

      {/* Selected stop card */}
      {selected && (
        <div style={{ padding: '14px 14px 16px', background: 'var(--bone)', borderTop: '1px solid var(--border-1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: selected.status.toLowerCase() === 'installed' ? 'var(--stone-100)' : 'var(--field-green)',
              color: selected.status.toLowerCase() === 'installed' ? 'var(--stone-400)' : 'var(--bone)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
            }}>
              {selected.status.toLowerCase() === 'installed' ? (
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
              ) : selected.routeOrder ? (
                selected.routeOrder
              ) : (
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'currentColor' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, textTransform: 'uppercase', lineHeight: 1.05, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.fieldName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 2 }}>{selected.operation}</div>
            </div>
            <button
              className="af-btn af-btn--primary"
              style={{ minHeight: 40, padding: '0 14px', fontSize: 12 }}
              onClick={() => onOpenField(selected)}
            >
              Open
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          {selected.notesThread && selected.notesThread.length > 0 && (
            <div style={{ marginTop: 10, color: 'var(--ink)', maxHeight: 140, overflowY: 'auto' }}>
              <NotesThread thread={selected.notesThread} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
