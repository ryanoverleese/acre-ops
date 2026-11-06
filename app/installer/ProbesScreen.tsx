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

interface ProbeSearchResult {
  id: number;
  serialNumber: string;
  brand: string;
  billingEntity: string;
  rack: string;
  rackSlot: string;
  currentField: string;
}

const PROBE_INDEX_KEY = 'af-probe-index-supabase-v1';

function rankProbeMatch(serial: string, digits: string): number {
  if (serial === digits) return 0;
  if (serial.startsWith(digits)) return 1;
  return 2;
}

export default function ProbesScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProbeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // Whole probe list kept on the phone so typing filters instantly.
  const [index, setIndex] = useState<ProbeSearchResult[] | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(PROBE_INDEX_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed?.results) && parsed.results.length ? parsed.results : null;
    } catch { return null; }
  });

  // Refresh the saved list in the background every time the screen opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/installer/probe-index', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.results) || data.results.length === 0) return;
        setIndex(data.results);
        try { window.localStorage.setItem(PROBE_INDEX_KEY, JSON.stringify({ results: data.results, builtAt: data.builtAt })); } catch { /* storage full */ }
      } catch { /* offline: keep the saved list */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearched(false); setLoading(false); return; }

    // Instant local search when the probe list is on the phone.
    if (index) {
      const matches = index
        .filter(p => p.serialNumber.includes(q))
        .sort((a, b) => rankProbeMatch(a.serialNumber, q) - rankProbeMatch(b.serialNumber, q) || a.serialNumber.localeCompare(b.serialNumber))
        .slice(0, 20);
      setResults(matches); setSearched(true); setLoading(false);
      return;
    }

    // First-ever open (no saved list yet): fall back to the server search.
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/installer/probe-search?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) { setResults(data.results ?? []); setSearched(true); }
      } catch {
        if (!cancelled) { setResults([]); setSearched(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, index]);

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
          <div className="af-topbar-title">Probe lookup</div>
          <div className="af-topbar-sub">Search by serial number</div>
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
            onChange={e => setQuery(e.target.value.replace(/\D/g, ''))}
            placeholder="Serial number"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            autoFocus
            className="af-mono"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, color: 'var(--ink)', outline: 'none' }}
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
            Searching…
          </div>
        )}

        {!loading && !query.trim() && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)', fontSize: 13 }}>
            Enter a serial number to look up a probe.
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              No probes match
            </div>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map(p => (
              <div
                key={p.id}
                style={{
                  padding: '12px 14px', background: 'var(--bone-raised)',
                  border: '1px solid var(--border-1)', borderRadius: 'var(--r-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span className="af-mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
                    {p.serialNumber || '—'}
                  </span>
                  {p.brand && (
                    <span style={{ fontSize: 11, color: 'var(--stone-500)', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {p.brand}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
                  <ProbeInfoRow label="Billing Entity" value={p.billingEntity} />
                  <ProbeInfoRow label="Rack" value={p.rack === '—' && p.rackSlot === '—' ? '—' : `${p.rack} · Slot ${p.rackSlot}`} />
                  <ProbeInfoRow label="Field (this year)" value={p.currentField} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProbeInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--stone-500)', fontFamily: 'var(--font-display)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--ink)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

