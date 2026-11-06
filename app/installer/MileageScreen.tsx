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

interface MileageLog { id: number; date: string; start_miles: number | null; end_miles: number | null; notes: string; }

export default function MileageScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Today's entry
  const [logId, setLogId] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Full history
  const [allLogs, setAllLogs] = useState<MileageLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline edit state for history rows
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mileage?installer=${encodeURIComponent(session.installer)}`);
        const data = await res.json();
        if (cancelled) return;
        const logs: MileageLog[] = data.logs ?? [];
        console.log('mileage client: received', logs.length, 'logs, today=', today, 'sample date=', logs[0]?.date);
        setAllLogs(logs);
        const todayLog = logs.find(l => l.date === today);
        if (todayLog) {
          setLogId(todayLog.id);
          setStart(todayLog.start_miles != null ? String(todayLog.start_miles) : '');
          setEnd(todayLog.end_miles != null ? String(todayLog.end_miles) : '');
          setNotes(todayLog.notes ?? '');
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [session.installer, today]);

  const total = start && end ? (parseFloat(end) - parseFloat(start)).toFixed(1) : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        installer_name: session.installer,
        date: today,
        start_miles: start ? parseFloat(start) : null,
        end_miles: end ? parseFloat(end) : null,
        notes,
      };
      if (logId) {
        await fetch(`/api/mileage?id=${logId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setAllLogs(prev => prev.map(l => l.id === logId ? { ...l, ...payload, date: today } : l));
      } else {
        const res = await fetch('/api/mileage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const created = await res.json();
        if (created?.id) {
          setLogId(created.id);
          setAllLogs(prev => [{ id: created.id, date: today, start_miles: payload.start_miles, end_miles: payload.end_miles, notes: payload.notes }, ...prev]);
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bone)', border: '1px solid var(--border-1)',
    borderRadius: 'var(--r-sm)', padding: '9px 12px',
    fontSize: 15, color: 'var(--ink)', outline: 'none',
    fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, letterSpacing: '0.14em', fontFamily: 'var(--font-display)',
    fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-2)', marginBottom: 4,
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  };

  const pastLogs = allLogs.filter(l => l.date !== today);
  const seasonTotal = allLogs.reduce((sum, l) => {
    if (l.start_miles != null && l.end_miles != null) return sum + (l.end_miles - l.start_miles);
    return sum;
  }, 0);

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
          <div className="af-topbar-title">Mileage log</div>
          {seasonTotal > 0 && <div className="af-topbar-sub" style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{seasonTotal.toFixed(1)} mi total · {session.season} season</div>}
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="af-body" style={{ padding: '14px 14px 24px', background: '#FFFFFF' }}>
        {/* Today's entry */}
        <div style={{ marginBottom: 22 }}>
          <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>Today — {fmtDate(today)}</div>
          <div style={{
            background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--r-lg)', padding: '14px',
          }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Start miles</div>
                <input type="number" inputMode="decimal" placeholder="0.0" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>End miles</div>
                <input type="number" inputMode="decimal" placeholder="0.0" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
              </div>
            </div>
            {total != null && (
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10, letterSpacing: '0.14em', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--ink-2)' }}>Total</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{total}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>mi</span>
              </div>
            )}
            <input type="text" placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
            <button
              onClick={handleSave}
              disabled={saving || (!start && !end)}
              style={{
                width: '100%', padding: '10px', borderRadius: 'var(--r-sm)',
                background: saved ? '#34c759' : 'var(--field-green)', color: 'var(--bone)',
                border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                opacity: saving || (!start && !end) ? 0.5 : 1, fontFamily: 'inherit',
              }}
            >
              {saved ? 'Saved ✓' : saving ? 'Saving…' : logId ? 'Update' : 'Save'}
            </button>
          </div>
        </div>

        {/* History */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--stone-500)', fontSize: 13 }}>Loading…</div>
        )}
        {!loading && pastLogs.length > 0 && (
          <div>
            <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>History</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pastLogs.map(log => {
                const logTotal = log.start_miles != null && log.end_miles != null
                  ? (log.end_miles - log.start_miles).toFixed(1) : null;
                const isEditing = editingId === log.id;

                const openEdit = () => {
                  setEditingId(log.id);
                  setEditStart(log.start_miles != null ? String(log.start_miles) : '');
                  setEditEnd(log.end_miles != null ? String(log.end_miles) : '');
                  setEditNotes(log.notes ?? '');
                };

                const saveEdit = async () => {
                  setEditSaving(true);
                  try {
                    await fetch(`/api/mileage?id=${log.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        start_miles: editStart ? parseFloat(editStart) : null,
                        end_miles: editEnd ? parseFloat(editEnd) : null,
                        notes: editNotes,
                      }),
                    });
                    setAllLogs(prev => prev.map(l => l.id === log.id ? {
                      ...l,
                      start_miles: editStart ? parseFloat(editStart) : null,
                      end_miles: editEnd ? parseFloat(editEnd) : null,
                      notes: editNotes,
                    } : l));
                    setEditingId(null);
                  } finally { setEditSaving(false); }
                };

                return (
                  <div key={log.id} style={{
                    background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
                    borderRadius: 'var(--r-md)', overflow: 'hidden',
                  }}>
                    {/* Row header — always visible */}
                    <button onClick={() => isEditing ? setEditingId(null) : openEdit()} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink)' }}>
                          {fmtDate(log.date)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 2 }}>
                          {log.start_miles ?? '—'} → {log.end_miles ?? '—'} mi
                          {log.notes ? ` · ${log.notes}` : ''}
                        </div>
                      </div>
                      {logTotal != null && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{logTotal}</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>mi</span>
                        </div>
                      )}
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ color: 'var(--stone-500)', flexShrink: 0, transform: isEditing ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {/* Inline edit form */}
                    {isEditing && (
                      <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border-1)' }}>
                        <div style={{ display: 'flex', gap: 10, marginTop: 10, marginBottom: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={labelStyle}>Start miles</div>
                            <input type="number" inputMode="decimal" value={editStart} onChange={e => setEditStart(e.target.value)}
                              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bone)', border: '1px solid var(--border-1)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 14, color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={labelStyle}>End miles</div>
                            <input type="number" inputMode="decimal" value={editEnd} onChange={e => setEditEnd(e.target.value)}
                              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bone)', border: '1px solid var(--border-1)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 14, color: 'var(--ink)', outline: 'none', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }} />
                          </div>
                        </div>
                        <input type="text" placeholder="Notes (optional)" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bone)', border: '1px solid var(--border-1)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 14, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', marginBottom: 8 }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={saveEdit} disabled={editSaving}
                            style={{ flex: 1, padding: '9px', borderRadius: 'var(--r-sm)', background: 'var(--field-green)', color: 'var(--bone)', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: editSaving ? 0.5 : 1, fontFamily: 'inherit' }}>
                            {editSaving ? 'Saving…' : 'Save changes'}
                          </button>
                          <button onClick={async () => {
                            if (!confirm('Delete this entry?')) return;
                            await fetch(`/api/mileage?id=${log.id}`, { method: 'DELETE' });
                            setAllLogs(prev => prev.filter(l => l.id !== log.id));
                            setEditingId(null);
                          }} style={{ padding: '9px 14px', borderRadius: 'var(--r-sm)', background: 'none', color: '#ff3b30', border: '1px solid #ff3b30', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!loading && pastLogs.length === 0 && allLogs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--stone-500)', fontSize: 13 }}>No previous entries</div>
        )}
      </div>
    </div>
  );
}
