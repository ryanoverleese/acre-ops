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

interface HistoryEntry {
  id: number;
  fieldName: string;
  operation: string;
  crop: string;
  probeSerial: string;
  installDate: string;
  label: string;
  installNotes: string;
}

export default function HistoryScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editEntry, setEditEntry] = useState<HistoryEntry | null>(null);
  const [editMode, setEditMode] = useState<null | 'location' | 'note' | 'serial'>(null);
  const [editNote, setEditNote] = useState('');
  const [editSerial, setEditSerial] = useState('');
  const [editGps, setEditGps] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [editLivePos, setEditLivePos] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (editMode !== 'location') return;
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setEditLivePos({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [editMode]);

  const openEdit = (h: HistoryEntry) => { setEditEntry(h); setEditMode(null); setEditNote(h.installNotes || ''); setEditSerial(''); setEditGps(null); setEditError(''); };
  const closeEdit = () => { setEditEntry(null); setEditMode(null); setEditError(''); };

  const saveEdit = async () => {
    if (!editEntry) return;
    setEditSaving(true); setEditError('');
    try {
      let body: Record<string, unknown> = {};
      if (editMode === 'location') {
        if (!editGps) { setEditError('Capture location first'); setEditSaving(false); return; }
        body = { install_lat: editGps.lat, install_lng: editGps.lng };
      } else if (editMode === 'note') {
        body = { install_notes: editNote };
      } else if (editMode === 'serial') {
        if (!editSerial.trim()) { setEditError('Enter a serial number'); setEditSaving(false); return; }
        const res = await fetch(`/api/probes?search=${encodeURIComponent(editSerial.trim())}`);
        const data = await res.json();
        const match = (data.results ?? []).find((p: { serial_number?: string | number }) => String(p.serial_number) === editSerial.trim());
        if (!match) { setEditError(`Probe #${editSerial} not found in inventory`); setEditSaving(false); return; }
        body = { probe: match.id };
      }
      const res = await fetch(`/api/probe-assignments/${editEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setEditError('Save failed — try again'); setEditSaving(false); return; }
      if (editMode === 'serial') setHistory(prev => prev.map(h => h.id === editEntry.id ? { ...h, probeSerial: editSerial.trim() } : h));
      closeEdit();
    } catch { setEditError('Network error'); }
    finally { setEditSaving(false); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/installer/history?installer=${encodeURIComponent(session.installer)}&season=${session.season}`);
        const data = await res.json();
        if (!cancelled) setHistory(data.history ?? []);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session.installer, session.season]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? history.filter(h =>
        h.fieldName.toLowerCase().includes(q) ||
        h.operation.toLowerCase().includes(q) ||
        h.probeSerial.toLowerCase().includes(q))
    : history;

  // Group by date portion (YYYY-MM-DD) of installDate
  const groups: Record<string, HistoryEntry[]> = {};
  for (const h of filtered) {
    const date = (h.installDate || '').slice(0, 10) || 'unknown';
    if (!groups[date]) groups[date] = [];
    groups[date].push(h);
  }
  const dates = Object.keys(groups).filter(d => d !== 'unknown').sort().reverse();
  if (groups['unknown']) dates.push('unknown');

  const fmtDate = (iso: string) => {
    if (iso === 'unknown') return 'Undated';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  };
  const fmtTime = (iso: string) => {
    // Baserow date-only fields return "YYYY-MM-DD" (no time). Parsing that
    // with new Date() treats it as UTC midnight and renders as the previous
    // evening locally. Only show a time if the string actually has one.
    if (!iso || !iso.includes('T')) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  };

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
          <div className="af-topbar-title">Install history</div>
          <div className="af-topbar-sub">{history.length} install{history.length !== 1 ? 's' : ''} · {session.season} season</div>
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
            placeholder="Field, operation, or serial"
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
            Loading history…
          </div>
        )}

        {!loading && dates.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {q ? 'No installs match' : 'No installs yet this season'}
            </div>
          </div>
        )}

        {!loading && dates.map(date => (
          <div key={date} style={{ marginBottom: 18 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 10,
              padding: '0 4px 8px', borderBottom: '1px solid var(--border-1)',
              marginBottom: 8,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', color: 'var(--ink)', textTransform: 'uppercase' }}>
                {fmtDate(date)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--stone-500)', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.12em' }}>
                {groups[date].length} INSTALL{groups[date].length !== 1 ? 'S' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groups[date].map(h => (
                <button key={h.id} onClick={() => openEdit(h)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--bone-raised)',
                  border: '1px solid var(--border-1)',
                  borderRadius: 'var(--r-md)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: 'var(--sage-wash)', color: 'var(--field-green)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.02em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.fieldName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11, color: 'var(--stone-500)' }}>
                      {h.operation && <span>{h.operation}</span>}
                      {h.operation && h.crop && <span style={{ color: 'var(--stone-300)' }}>·</span>}
                      {h.crop && <span>{h.crop}</span>}
                      {h.label && <><span style={{ color: 'var(--stone-300)' }}>·</span><span>{h.label}</span></>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {fmtTime(h.installDate) && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtTime(h.installDate)}
                      </div>
                    )}
                    {h.probeSerial && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--stone-500)', marginTop: 2 }}>
                        #{h.probeSerial}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit sheet */}
      {editEntry && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,10,10,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={closeEdit}>
          <div style={{ background: 'var(--bone)', borderRadius: '16px 16px 0 0' }} onClick={e => e.stopPropagation()}>
            {/* Sheet header */}
            <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{editEntry.fieldName}</div>
                <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>{editEntry.operation}{editEntry.crop ? ` · ${editEntry.crop}` : ''} · #{editEntry.probeSerial}</div>
              </div>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--stone-500)', padding: 4 }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Inline form */}
            {editMode && (
              <div style={{ padding: '14px 16px 0' }}>
                {editMode === 'note' && (
                  <textarea className="af-input" style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, width: '100%' }}
                    value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Install note…" autoFocus />
                )}
                {editMode === 'serial' && (
                  <input className="af-input af-mono" type="text" inputMode="numeric"
                    value={editSerial} onChange={e => setEditSerial(e.target.value.replace(/\D/g, ''))} placeholder="New serial number" autoFocus />
                )}
                {editMode === 'location' && (
                  <button type="button" onClick={() => { if (editLivePos) { setEditGps(editLivePos); } else { navigator.geolocation?.getCurrentPosition(p => setEditGps({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy })); } }}
                    style={{ width: '100%', padding: '11px 0', background: editGps ? 'var(--field-green)' : 'transparent', color: editGps ? 'var(--bone)' : 'var(--field-green)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', border: '1.5px solid var(--field-green)', borderRadius: 'var(--r-md)', cursor: 'pointer' }}>
                    {editGps ? `✓ Captured (±${editGps.acc ? (editGps.acc * 3.28084).toFixed(0) : '?'} ft)` : editLivePos ? `Capture (±${editLivePos.acc ? (editLivePos.acc * 3.28084).toFixed(0) : '?'} ft)` : 'Waiting for GPS…'}
                  </button>
                )}
                {editError && <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}>{editError}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 14 }}>
                  <button type="button" onClick={saveEdit} disabled={editSaving}
                    style={{ flex: 1, padding: '11px 0', background: 'var(--field-green)', color: 'var(--bone)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', border: 'none', borderRadius: 'var(--r-md)', cursor: 'pointer', opacity: editSaving ? 0.6 : 1 }}>
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => { setEditMode(null); setEditError(''); }}
                    style={{ flex: 1, padding: '11px 0', background: 'transparent', color: 'var(--stone-500)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', border: '1.5px solid var(--border-1)', borderRadius: 'var(--r-md)', cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {/* Action buttons */}
            <div style={{ display: 'flex', borderTop: editMode ? '1px solid var(--border-1)' : 'none' }}>
              {[
                { key: 'location' as const, label: 'Change\nLocation', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> },
                { key: 'note' as const, label: 'Install\nNote', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
                { key: 'serial' as const, label: 'Change\nSerial', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/></svg> },
              ].map((btn, i) => (
                <button key={btn.key} type="button"
                  onClick={() => { setEditMode(editMode === btn.key ? null : btn.key); setEditError(''); }}
                  style={{ flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: editMode === btn.key ? 'var(--sage-wash)' : 'transparent', color: editMode === btn.key ? 'var(--field-green)' : 'var(--stone-500)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', borderLeft: i > 0 ? '1px solid var(--border-1)' : 'none', cursor: 'pointer', lineHeight: 1.3, whiteSpace: 'pre-line' }}>
                  {btn.icon}{btn.label}
                </button>
              ))}
            </div>
            <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} />
          </div>
        </div>
      )}
    </div>
  );
}
