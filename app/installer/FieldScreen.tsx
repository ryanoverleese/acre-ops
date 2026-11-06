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

export default function FieldScreen({ assignment: a, onBack, onStartInstall, onUpdateAssignment }: {
  assignment: InstallerAssignment; onBack: () => void; onStartInstall: () => void;
  onUpdateAssignment?: (updates: Partial<InstallerAssignment>) => void;
}) {
  const mapsUrl = a.lat && a.lng ? mapsUrlFor(a.lat, a.lng, getMapProvider()) : null;
  const fieldBoundary = useFieldBoundaries([a.fieldId]);
  const isDone = a.status.toLowerCase() === 'installed';

  // Edit mode for installed probes
  const [editMode, setEditMode] = useState<null | 'location' | 'note' | 'serial'>(null);
  const [editNote, setEditNote] = useState(a.installNotes || '');
  const [editSerial, setEditSerial] = useState('');
  const [editGps, setEditGps] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [editLivePos, setEditLivePos] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

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

  const captureEditGps = () => {
    if (editLivePos) { setEditGps(editLivePos); return; }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setEditGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => setEditError('Could not get location'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const saveEdit = async () => {
    setEditSaving(true); setEditError(''); setEditSuccess('');
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
        const match = (data.results ?? []).find((p: { serial_number?: string | number }) =>
          String(p.serial_number) === editSerial.trim()
        );
        if (!match) { setEditError(`Probe #${editSerial} not found in inventory`); setEditSaving(false); return; }
        body = { probe: match.id };
      }
      const res = await fetch(`/api/probe-assignments/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setEditError('Save failed — try again'); setEditSaving(false); return; }
      setEditSuccess('Saved');
      setEditMode(null);
      if (editMode === 'note') onUpdateAssignment?.({ installNotes: editNote });
      if (editMode === 'serial') onUpdateAssignment?.({ probeSerial: editSerial.trim() });
      if (editMode === 'location' && editGps) onUpdateAssignment?.({ lat: editGps.lat, lng: editGps.lng });
    } catch { setEditError('Network error'); }
    finally { setEditSaving(false); }
  };

  return (
    <div className="af-screen">
      {/* Top bar */}
      <div className="af-topbar">
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--field-green)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Route
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-eyebrow">
            {a.routeOrder ? `Stop ${a.routeOrder}` : 'Field Detail'}
          </div>
        </div>
        <div style={{ width: 32 }} />
      </div>

      <div className="af-body" style={{ paddingBottom: 24, background: '#FFFFFF' }}>
        {/* Satellite mini-map */}
        {a.lat && a.lng && (
          <div style={{ height: '50dvh', position: 'relative', background: '#c8d5b9' }}>
            <FieldMiniMap lat={a.lat} lng={a.lng} boundary={fieldBoundary} />
          </div>
        )}

        {/* Title */}
        <div style={{ padding: '10px 14px 8px' }}>
          <div className="af-eyebrow" style={{ fontSize: 10 }}>{a.operation}</div>
          <div className="af-display-text" style={{ fontSize: 24, marginTop: 3, textTransform: 'uppercase' }}>{a.fieldName}</div>
          {isDone && (
            <span className="af-chip af-chip--installed" style={{ marginTop: 6 }}>
              <svg width="12" height="12" stroke="currentColor" strokeWidth="3" fill="none" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
              Installed
            </span>
          )}
        </div>

        {/* Stat grid */}
        <div style={{ padding: '0 14px' }}>
          <div className="af-statgrid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="stat"><span className="lbl">Crop</span><span className="val" style={{ fontSize: 13 }}>{a.crop || '—'}</span></div>
            <div className="stat"><span className="lbl">Antenna</span><span className="val" style={{ fontSize: 13 }}>{a.antennaType || '—'}</span></div>
          </div>
        </div>

        {/* Probe card */}
        <div style={{ padding: '10px 14px 0' }}>
          <div className="af-eyebrow" style={{ marginBottom: 6, fontSize: 10 }}>Probe to install</div>
          <div className="af-probe" style={{ padding: '8px 12px' }}>
            <div className="sprite">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
              </svg>
            </div>
            <div className="info">
              <div className="serial" style={{ fontSize: 14 }}>{a.probeSerial ? `#${a.probeSerial}` : 'Not assigned'}</div>
              <div className="brand" style={{ fontSize: 12 }}>{a.probeBrand}{a.label ? ` · ${a.label}` : ''}</div>
            </div>
          </div>
        </div>

        {/* Install note / access notes */}
        {(a.accessNotes || (a.notesThread && a.notesThread.length > 0)) ? (
          <div style={{ padding: '10px 14px 0' }}>
            <div className="af-install-note" style={{ padding: '8px 10px' }}>
              {a.accessNotes && (
                <>
                  <div className="note-label" style={{ fontSize: 10 }}>Access Note</div>
                  <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--ink)', fontWeight: 500, whiteSpace: 'pre-wrap', marginBottom: a.notesThread?.length ? 8 : 0 }}>{a.accessNotes}</div>
                </>
              )}
              <NotesThread thread={a.notesThread} />
            </div>
          </div>
        ) : a.fieldNotes ? (
          <div style={{ padding: '10px 14px 0' }}>
            <div className="af-install-note" style={{ padding: '8px 10px' }}>
              <div className="note-label" style={{ fontSize: 10 }}>Install Note</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--ink)', fontWeight: 500 }}>{a.fieldNotes}</div>
            </div>
          </div>
        ) : null}

        {/* Open in Maps — compact */}
        {mapsUrl && (
          <div style={{ padding: '8px 14px 0' }}>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 10px',
                background: 'var(--bone-raised)',
                border: '1.5px solid var(--border-1)',
                borderRadius: 'var(--r-lg)',
                textDecoration: 'none',
                color: 'var(--field-green)',
              }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Open in Maps
              </span>
              {a.lat && a.lng && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--stone-500)' }}>
                  {a.lat.toFixed(4)}°N · {Math.abs(a.lng).toFixed(4)}°W
                </span>
              )}
            </a>
          </div>
        )}

      </div>

{/* CTA — Start Install (not yet done) */}
      {!isDone && (
        <button
          onClick={onStartInstall}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 14,
            width: '100%', minHeight: 84,
            padding: '0 24px', border: 'none', borderRadius: 0,
            background: 'var(--field-green)', color: 'var(--bone)',
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 22, letterSpacing: '0.06em', textTransform: 'uppercase',
            boxShadow: '0 -6px 20px rgba(31,64,42,0.18)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Start Install
          <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      )}

      {/* Edit actions — installed probes only */}
      {isDone && (
        <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-1)', background: '#FFFFFF' }}>
          {/* Inline edit form */}
          {editMode && (
            <div style={{ padding: '14px 14px 0' }}>
              {editMode === 'note' && (
                <textarea
                  className="af-input"
                  style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }}
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="Install note…"
                  autoFocus
                />
              )}
              {editMode === 'serial' && (
                <input
                  className="af-input af-mono"
                  type="text"
                  inputMode="numeric"
                  value={editSerial}
                  onChange={e => setEditSerial(e.target.value.replace(/\D/g, ''))}
                  placeholder="New serial number"
                  autoFocus
                />
              )}
              {editMode === 'location' && (
                <div>
                  <button
                    type="button"
                    onClick={captureEditGps}
                    style={{
                      width: '100%', padding: '11px 0', marginBottom: 8,
                      background: editGps ? 'var(--field-green)' : 'transparent',
                      color: editGps ? 'var(--bone)' : 'var(--field-green)',
                      fontFamily: 'var(--font-display)', fontWeight: 700,
                      fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
                      border: '1.5px solid var(--field-green)', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    }}
                  >
                    {editGps
                      ? `✓ Captured (±${editGps.acc ? (editGps.acc * 3.28084).toFixed(0) : '?'} ft)`
                      : editLivePos ? `Capture (±${editLivePos.acc ? (editLivePos.acc * 3.28084).toFixed(0) : '?'} ft)` : 'Waiting for GPS…'}
                  </button>
                </div>
              )}
              {editError && (
                <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}>{editError}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={editSaving}
                  style={{
                    flex: 1, padding: '11px 0',
                    background: 'var(--field-green)', color: 'var(--bone)',
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
                    border: 'none', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    opacity: editSaving ? 0.6 : 1,
                  }}
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditMode(null); setEditError(''); }}
                  style={{
                    flex: 1, padding: '11px 0',
                    background: 'transparent', color: 'var(--stone-500)',
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
                    border: '1.5px solid var(--border-1)', borderRadius: 'var(--r-md)', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {editSuccess && !editMode && (
            <div style={{ padding: '8px 14px 0', fontSize: 12, color: 'var(--field-green)', textAlign: 'center' }}>✓ {editSuccess}</div>
          )}
          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 0, borderTop: editMode ? '1px solid var(--border-1)' : 'none' }}>
            {[
              { key: 'location' as const, label: 'Change\nLocation', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> },
              { key: 'note' as const, label: 'Install\nNote', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
              { key: 'serial' as const, label: 'Change\nSerial', icon: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/></svg> },
            ].map((btn, i) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => { setEditMode(editMode === btn.key ? null : btn.key); setEditError(''); setEditSuccess(''); }}
                style={{
                  flex: 1, padding: '14px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  background: editMode === btn.key ? 'var(--sage-wash)' : 'transparent',
                  color: editMode === btn.key ? 'var(--field-green)' : 'var(--stone-500)',
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
                  border: 'none',
                  borderLeft: i > 0 ? '1px solid var(--border-1)' : 'none',
                  cursor: 'pointer', lineHeight: 1.3, whiteSpace: 'pre-line',
                }}
              >
                {btn.icon}
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
