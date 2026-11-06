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

export default function MeScreen({
  session, assignments, onLogout, onOpenHistory, onOpenMileage, onOpenSettings, onOpenSummary, onOpenProbes, onOpenLocations,
}: {
  session: Session;
  assignments: InstallerAssignment[];
  onLogout: () => void;
  onOpenHistory: () => void;
  onOpenMileage: () => void;
  onOpenSettings: () => void;
  onOpenSummary: () => void;
  onOpenProbes: () => void;
  onOpenLocations: () => void;
}) {
  const initials = session.installer.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const installedToday = assignments.filter(a => a.status.toLowerCase() === 'installed').length;
  const totalToday = assignments.length;

  // Fetch season history to compute Season / Streak / Avg per day
  const [seasonCount, setSeasonCount] = useState<number | null>(null);
  const [streak, setStreak] = useState<number | null>(null);
  const [avgPerDay, setAvgPerDay] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/installer/history?installer=${encodeURIComponent(session.installer)}&season=${session.season}`);
        const data = await res.json();
        if (cancelled) return;
        const entries: Array<{ installDate?: string }> = data.history ?? [];
        const count = entries.length;
        setSeasonCount(count);

        // Unique install dates (YYYY-MM-DD), newest first
        const uniqueDays = Array.from(new Set(
          entries.map(h => (h.installDate || '').slice(0, 10)).filter(Boolean)
        )).sort().reverse();

        // Average per active day
        setAvgPerDay(uniqueDays.length > 0 ? (count / uniqueDays.length).toFixed(1) : '0');

        // Streak: consecutive days back from latest install, only "active" if
        // the most recent install was today or yesterday.
        if (uniqueDays.length === 0) {
          setStreak(0);
        } else {
          const today = new Date();
          today.setHours(12, 0, 0, 0);
          const latest = new Date(uniqueDays[0] + 'T12:00:00');
          const daysSince = Math.round((today.getTime() - latest.getTime()) / 86400000);
          if (daysSince > 1) {
            setStreak(0);
          } else {
            let s = 1;
            for (let i = 1; i < uniqueDays.length; i++) {
              const prev = new Date(uniqueDays[i - 1] + 'T12:00:00');
              const curr = new Date(uniqueDays[i] + 'T12:00:00');
              const gap = Math.round((prev.getTime() - curr.getTime()) / 86400000);
              if (gap === 1) s++; else break;
            }
            setStreak(s);
          }
        }
      } catch {
        if (!cancelled) { setSeasonCount(0); setStreak(0); setAvgPerDay('0'); }
      }
    })();
    return () => { cancelled = true; };
  }, [session.installer, session.season]);

  const val = (v: number | string | null) => (v == null ? '—' : String(v));

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <div style={{ width: 40 }} />
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Account</div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="af-body" style={{ padding: '0 0 24px', background: '#FFFFFF' }}>
        {/* Profile header — green with topo, avatar + name */}
        <div style={{
          padding: '24px 18px 28px',
          background: 'var(--field-green)', color: 'var(--bone)',
          position: 'relative', overflow: 'hidden',
        }}>
          <TopoDeco />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 32,
              background: 'rgba(246,242,234,0.18)',
              border: '1px solid rgba(246,242,234,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24,
              letterSpacing: '0.04em', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.18em', opacity: 0.72, fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase' }}>
                Field installer
              </div>
              <div className="af-display-text" style={{ fontSize: 26, marginTop: 2, lineHeight: 1, color: 'var(--bone)' }}>
                {session.installer}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                Acre Insights · {session.season} season
              </div>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ padding: '16px 14px 0' }}>
          <div className="af-statgrid">
            <div className="stat"><span className="lbl">Today</span><span className="val">{installedToday}/{totalToday}</span></div>
            <div className="stat"><span className="lbl">Season</span><span className="val">{val(seasonCount)}</span></div>
            <div className="stat"><span className="lbl">Streak</span><span className="val">{streak != null ? `${streak}d` : '—'}</span></div>
            <div className="stat"><span className="lbl">Avg / day</span><span className="val">{val(avgPerDay)}</span></div>
          </div>
        </div>

        {/* Menu */}
        <div style={{ padding: '20px 14px 0' }}>
          <MenuGroup label="Work">
            <MenuRow
              icon={
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              }
              label="Install history"
              sub="All my installs this season"
              onClick={onOpenHistory}
              showChevron
            />
            <MenuRow
              icon={
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" /><path d="M12 6v6l4 2" /><path d="M5 12H3M21 12h-2M12 5V3M12 21v-2" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                </svg>
              }
              label="Mileage log"
              sub="Track daily start & end miles"
              onClick={onOpenMileage}
              showChevron
            />
            <MenuRow
              icon={
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
              }
              label="Locations"
              sub="Find & navigate to any field"
              onClick={onOpenLocations}
              showChevron
            />
            <MenuRow
              icon={
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              }
              label="Probe lookup"
              sub="Find a probe by serial number"
              onClick={onOpenProbes}
              showChevron
              last
            />
          </MenuGroup>
          {session.installer.toLowerCase().includes('ryan') && (
            <MenuGroup label="Ops">
              <MenuRow
                icon={
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                }
                label="Install progress"
                sub="All installers · today's counts"
                onClick={onOpenSummary}
                showChevron
                last
              />
            </MenuGroup>
          )}
          <MenuGroup label="App">
            <MenuRow
              icon={
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              }
              label="Settings"
              sub="Map provider, preferences"
              onClick={onOpenSettings}
              showChevron
              last
            />
          </MenuGroup>
          <MenuGroup label="Support">
            <a href="tel:4025121850" style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
              <MenuRow
                icon={
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                  </svg>
                }
                label="Call CropX support"
                sub="402-512-1850"
                showChevron
              />
            </a>
            <MenuRow
              icon={
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              }
              label="Sign out"
              destructive
              onClick={onLogout}
              last
            />
          </MenuGroup>
        </div>
      </div>
    </div>
  );
}
