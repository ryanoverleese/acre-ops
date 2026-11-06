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
import { Fireworks } from './InstallScreen';

export default function RouteScreen({
  session, assignments, loading, filter, onFilterChange, onSelect, onLogout, onRefresh, sessionInstalledIds, activeGroups, onActiveGroupsChange,
}: {
  session: Session; assignments: InstallerAssignment[];
  loading: boolean; filter: Filter;
  onFilterChange: (f: Filter) => void;
  onSelect: (a: InstallerAssignment) => void;
  onLogout: () => void;
  onRefresh: () => void;
  sessionInstalledIds: Set<number>;
  activeGroups: Set<number>;
  onActiveGroupsChange: (groups: Set<number>) => void;
}) {
  const allGroups = [...new Set(assignments.map(a => a.installGroup).filter((g): g is number => g != null))].sort((a, b) => a - b);
  const hasGroups = allGroups.length > 0;

  function toggleGroup(n: number) {
    onActiveGroupsChange((() => {
      const next = new Set(activeGroups);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    })());
  }

  const todo = assignments.filter(a => a.status.toLowerCase() !== 'installed');
  const done = assignments.filter(a => a.status.toLowerCase() === 'installed');
  const groupFiltered = activeGroups.size > 0 ? assignments.filter(a => a.installGroup != null && activeGroups.has(a.installGroup)) : assignments;
  const groupTodo = groupFiltered.filter(a => a.status.toLowerCase() !== 'installed');
  const groupDone = groupFiltered.filter(a => a.status.toLowerCase() === 'installed');
  const baseVisible = filter === 'todo' ? groupTodo : filter === 'done' ? groupDone : groupFiltered;
  const visible = baseVisible;
  const sessionDoneCount = assignments.filter(a => sessionInstalledIds.has(a.id)).length;
  const routeTotal = sessionDoneCount + todo.length;
  const progress = routeTotal > 0 ? sessionDoneCount / routeTotal : 0;
  const [fireworksFired, setFireworksFired] = useState(false);
  const [fireworksKey, setFireworksKey] = useState(0);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allDone = !loading && assignments.length > 0 && todo.length === 0;
  // Only fire fireworks when you finish the last install during this session,
  // not when you open the page with everything already done
  const hadTodoRef = useRef(false);
  useEffect(() => {
    if (todo.length > 0) hadTodoRef.current = true;
  }, [todo.length]);
  useEffect(() => {
    if (allDone && hadTodoRef.current && !fireworksFired) setFireworksFired(true);
  }, [allDone, fireworksFired]);

  function handleDateTap() {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 600);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      setFireworksFired(true);
      setFireworksKey(k => k + 1);
    }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="af-screen">
      {/* Green progress header */}
      <div className="af-progress-header">
        <TopoDeco />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="greeting">Hi, {session.installer}</div>
            <div className="date" onClick={handleDateTap} style={{ userSelect: 'none' }}>{dateStr}</div>
            <div className="subdate">Spring install · {session.season} season</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onRefresh}
              disabled={loading}
              style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(246,242,234,0.14)', border: '1px solid rgba(246,242,234,0.3)', color: 'var(--bone)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Refresh"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={onLogout}
              style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(246,242,234,0.14)', border: '1px solid rgba(246,242,234,0.3)', color: 'var(--bone)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Sign out"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        <div className="af-pb-row">
          <div className="af-pb-stat">
            <div className="num">{sessionDoneCount}</div>
            <div className="label">Done today</div>
          </div>
          <div className="af-pb-stat">
            <div className="num">{todo.length}</div>
            <div className="label">Left to go</div>
          </div>
        </div>
        <div className="af-pb-bar">
          <div className="fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="af-filterbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="af-segmented">
            {(['todo', 'done', 'all'] as Filter[]).map(f => (
              <button
                key={f}
                aria-pressed={filter === f ? 'true' : 'false'}
                onClick={() => onFilterChange(f)}
              >
                {f === 'todo' ? 'To install' : f === 'done' ? 'Done' : 'All'}
                <span className="count">{f === 'todo' ? groupTodo.length : f === 'done' ? groupDone.length : groupFiltered.length}</span>
              </button>
            ))}
          </div>
        </div>
        {hasGroups && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone-400)', marginRight: 2, fontFamily: 'var(--font-display)' }}>Group</span>
            {allGroups.map(n => {
              const active = activeGroups.has(n);
              return (
                <button
                  key={n}
                  onClick={() => toggleGroup(n)}
                  style={{
                    height: 28, paddingInline: 14, borderRadius: 'var(--r-pill)',
                    border: active ? 'none' : '1.5px solid var(--border-1)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
                    background: active ? 'var(--field-green)' : 'transparent',
                    color: active ? 'var(--bone)' : 'var(--stone-500)',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {n}
                </button>
              );
            })}
            {activeGroups.size > 0 && (
              <button
                onClick={() => onActiveGroupsChange(new Set())}
                style={{
                  height: 28, paddingInline: 10, borderRadius: 'var(--r-pill)',
                  border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: 'transparent', color: 'var(--stone-400)',
                  fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
                }}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="af-body" style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10, background: '#FFFFFF' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)', fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Loading route…
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)' }}>
            <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ margin: '0 auto' }}>
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {filter === 'todo' ? 'All done for today! 🎉' : 'Nothing here yet'}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Switch filters to see other stops.</div>
          </div>
        )}
        <Fireworks key={fireworksKey} active={fireworksFired} />
        {!loading && visible.map(a => {
          const isInstalled = a.status.toLowerCase() === 'installed';
          const orderLabel = a.routeOrder || '—';
          return (
            <button
              key={a.id}
              className="af-stop"
              data-status={isInstalled ? 'installed' : 'todo'}
              onClick={() => onSelect(a)}
            >
              <div className="af-stop-order">
                {isInstalled ? (
                  <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : orderLabel}
                <span className="stop-label">{isInstalled ? 'DONE' : 'STOP'}</span>
              </div>
              <div className="af-stop-main" style={{ padding: '2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div className="af-stop-field">{a.fieldName}</div>
                  {a.fieldNotes && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      fontFamily: 'var(--font-display)', fontWeight: 800,
                      fontSize: 10, letterSpacing: '0.16em',
                      color: '#fff', background: '#B91C1C',
                      padding: '3px 8px', borderRadius: 3,
                      textTransform: 'uppercase',
                      boxShadow: '0 0 0 2px #FEE2E2',
                    }}>
                      Install Note
                    </span>
                  )}
                </div>
                <div className="af-stop-op">{a.operation}</div>
                {(a.probeSerial || a.probeBrand || a.label) && (
                  <div className="af-stop-probe" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {a.probeSerial && <span>#{a.probeSerial}</span>}
                    {a.probeBrand && (() => {
                      const c = probeBadgeColors(a.probeBrand, a.antennaType);
                      return (
                        <span style={{
                          fontFamily: 'var(--font-display)', fontWeight: 600,
                          fontSize: 10, letterSpacing: '0.1em',
                          color: c.fg, background: c.bg,
                          padding: '2px 6px', borderRadius: 3,
                          textTransform: 'uppercase',
                        }}>
                          {a.probeBrand}
                        </span>
                      );
                    })()}
                    {a.label && (
                                        <span style={{
                                          fontFamily: 'var(--font-display)', fontWeight: 700,
                                          fontSize: 10, letterSpacing: '0.08em',
                                          color: 'var(--field-green)',
                                          background: 'var(--sage-wash)',
                                          padding: '2px 6px', borderRadius: 3,
                                          textTransform: 'uppercase',
                                          border: '1px solid var(--field-green)',
                                        }}>
                                          {a.label}
                                        </span>
                                      )}
                  </div>
                )}
              </div>
              <div className="af-stop-right">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
