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

interface SummaryData {
  season: number;
  total: number;
  installed: number;
  installedToday: number;
  remaining: number;
  percent: number;
  byInstaller: { installer: string; total: number; installed: number; installedToday: number; remaining: number }[];
}

export default function SummaryScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (fresh = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/installer/summary?season=${session.season}${fresh ? '&fresh=1' : ''}`);
      const json = await res.json();
      setData(json);
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button
          onClick={onBack}
          style={{ color: 'var(--field-green)', padding: 6, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Install Progress</div>
          <div style={{ fontSize: 10, color: 'var(--stone-500)', letterSpacing: '0.08em' }}>{session.season} season</div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--field-green)' }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="af-body" style={{ padding: '16px 14px 40px', background: '#fff', overflowY: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--stone-500)', fontSize: 13 }}>Loading…</div>
        )}
        {error && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--dry)', fontSize: 13 }}>{error}</div>
        )}
        {data && !loading && (
          <>
            {/* Overall stats */}
            <div style={{ background: 'var(--field-green)', borderRadius: 'var(--r-lg)', padding: '18px 20px', marginBottom: 20, color: 'var(--bone)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{data.installedToday}</div>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>Today</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{data.installed}</div>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>Total Done</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{data.remaining}</div>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>Left</div>
                </div>
                <div>
                  <div style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{data.percent}%</div>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>Done</div>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ marginTop: 14, background: 'rgba(246,242,234,0.2)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${data.percent}%`, height: '100%', background: 'var(--bone)', borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6, textAlign: 'center' }}>{data.total} total assigned</div>
            </div>

            {/* Per installer — today only */}
            <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>Today by installer</div>
            <div style={{ background: 'var(--bone-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              {data.byInstaller.filter(r => r.installedToday > 0).map((row, i, arr) => (
                <div
                  key={row.installer}
                  style={{
                    padding: '14px 16px',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--border-1)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>{row.installer}</div>
                  <div style={{ fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--field-green)' }}>{row.installedToday}</div>
                </div>
              ))}
              {data.byInstaller.filter(r => r.installedToday > 0).length === 0 && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--stone-500)', fontSize: 13 }}>No installs yet today</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
