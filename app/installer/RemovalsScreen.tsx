'use client';

import { useEffect, useRef, useState } from 'react';
import { compressImage, playSuccessSound } from './InstallerApp';
import NotesThread from '@/components/NotesThread';
import type { NoteStage } from '@/lib/notes-thread';
import {
  defaultRouteFilter,
  loadRouteFilter,
  matchesRouteFilter,
  routeFilterLabel,
  saveRouteFilter,
  type RemovalsRouteFilter,
} from './removalsRouteFilter';
import {
  chicagoToday,
  countTodayPulls,
  formatTodayPullCounts,
  matchesPlannedRemover,
} from './todayPullCounts';

/**
 * The pull half of the season. Defaults to probes assigned to the logged-in
 * installer as planned_remover. Toggle Show all for the whole fleet.
 */

export interface RemovalRow {
  id: number;
  fieldId: number;
  fieldName: string;
  grower: string;
  routeOrder: string;
  probeNumber: number;
  label: string;
  probeSerial: string;
  antennaType: string;
  lat: number;
  lng: number;
  installedOn: string;
  installedBy: string;
  plannedRemover?: string;
  removalPriority?: string;
  crop?: string;
  rowDirection?: string;
  fieldNotes: string;
  removed: boolean;
  removedOn: string;
  removedBy: string;
  removalNotes: string;
  accessNotes?: string;
  notesThread?: NoteStage[];
}

const SHOW_ALL_KEY = 'af-removals-show-all';

function loadShowAll(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SHOW_ALL_KEY) === '1';
}
function saveShowAll(v: boolean) {
  try { localStorage.setItem(SHOW_ALL_KEY, v ? '1' : '0'); } catch { /* private mode */ }
}

function navigateUrl(lat: number, lng: number): string {
  const provider = typeof window !== 'undefined' && localStorage.getItem('af-map-provider') === 'apple' ? 'apple' : 'google';
  if (provider === 'apple') return `https://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}`;
  return `https://maps.google.com/?q=${lat},${lng}`;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${Number(m)}/${Number(d)}/${y}`;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 16,
  border: '1.5px solid var(--border-1)', borderRadius: 10,
  background: 'var(--bone-raised)', color: 'var(--ink)', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

/** Denser inputs for PullForm only (list search keeps roomier inputStyle). */
const pullInputStyle: React.CSSProperties = {
  ...inputStyle, padding: '8px 10px', borderRadius: 8,
};

const pullTaStyle: React.CSSProperties = {
  ...pullInputStyle, resize: 'vertical', minHeight: 56,
};

const backBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  color: 'var(--field-green)', fontWeight: 600, fontSize: 14,
  fontFamily: 'var(--font-display)', letterSpacing: '0.08em',
  textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer',
};

// ── PullForm ──────────────────────────────────────────────────────────────────

export function PullForm({ row, installer, onBack, onSaved }: {
  row: RemovalRow;
  installer: string;
  onBack: () => void;
  onSaved: (id: number, removedBy: string, note: string) => void;
}) {
  const [removedBy, setRemovedBy] = useState(installer);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Two-tap removal: first tap arms, second ("Confirm removal") saves.
  const [confirming, setConfirming] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (file: File | null) => {
    if (!file) return;
    setCompressing(true);
    const compressed = await compressImage(file);
    setPhotos(p => [...p, compressed]);
    setCompressing(false);
  };

  const canSubmit = removedBy.trim().length > 0 && !submitting && !compressing;

  // Any edit to the form disarms the confirm step.
  useEffect(() => { setConfirming(false); }, [removedBy, notes, photos]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError('');
    try {
      const fd = new FormData();
      fd.append('probeAssignmentId', String(row.id));
      fd.append('source', 'crew');
      fd.append('removedBy', removedBy.trim());
      if (notes.trim()) fd.append('removalNotes', notes.trim());
      photos.forEach(p => fd.append('photo', p));
      const res = await fetch('/api/removal', { method: 'POST', body: fd });
      const raw = await res.text();
      let data: { error?: string; alreadyRemoved?: boolean; photoErrors?: string[] } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {
        setError(res.redirected || res.status === 307 || res.status === 302
          ? 'Session blocked the save — tell Ryan (auth redirect)'
          : `Save failed (HTTP ${res.status}) — removal NOT saved`);
        setSubmitting(false);
        setConfirming(false);
        return;
      }
      if (!res.ok) { setError(data.error || 'Failed to save — try again'); setSubmitting(false); setConfirming(false); return; }
      playSuccessSound();
      const note = data.alreadyRemoved
        ? 'Already recorded as removed'
        : data.photoErrors?.length
          ? 'Removal saved — a photo failed to upload'
          : '';
      onSaved(row.id, removedBy.trim(), note);
    } catch { setError('Network error — removal NOT saved'); setSubmitting(false); setConfirming(false); }
  };

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button onClick={onBack} style={backBtnStyle}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Pull Probe</div>
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Single-stack PullForm — denser spacing so Navigate + Mark Pulled fit with notes */}
      <div className="af-body" style={{ padding: '10px 12px 18px', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bone)' }}>
        {/* What's coming out */}
        <div style={{ padding: '2px 2px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.05 }}>
              {row.fieldName}
            </div>
            {row.removalPriority === 'Priority' && (
              <span className="af-chip" style={{ background: '#FEE2E2', color: '#B91C1C', padding: '2px 7px', fontSize: 10 }}>
                Priority
              </span>
            )}
          </div>
          {row.grower && <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 3 }}>{row.grower}</div>}
          {row.probeSerial && (
            <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              #{row.probeSerial}{row.label ? ` · ${row.label}` : ''}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 3 }}>
            Installed {fmtDate(row.installedOn)}{row.installedBy ? ` by ${row.installedBy}` : ''}
            {row.antennaType ? ` · ${row.antennaType}` : ''}
          </div>
          {row.plannedRemover && (
            <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 1 }}>
              Planned remover: {row.plannedRemover}
            </div>
          )}
          {(row.crop || row.rowDirection) && (
            <div style={{ fontSize: 11, color: 'var(--stone-700)', marginTop: 3 }}>
              {[row.crop && `Crop ${row.crop}`, row.rowDirection && `Rows ${row.rowDirection}`].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>

        {/* Gate codes / placement / install notes — same callout as Install flow */}
        {(row.accessNotes || (row.notesThread && row.notesThread.length > 0)) ? (
          <div className="af-install-note" style={{ padding: '6px 8px', color: 'var(--ink)' }}>
            {row.accessNotes && (
              <>
                <div className="note-label" style={{ fontSize: 9 }}>Access Note</div>
                <div style={{ fontSize: 12, lineHeight: 1.3, fontWeight: 500, whiteSpace: 'pre-wrap', marginBottom: row.notesThread?.length ? 6 : 0 }}>{row.accessNotes}</div>
              </>
            )}
            <NotesThread thread={row.notesThread} compact />
          </div>
        ) : row.fieldNotes ? (
          <div className="af-install-note" style={{ padding: '6px 8px' }}>
            <div className="note-label" style={{ fontSize: 9 }}>Install Note</div>
            <div style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--ink)', fontWeight: 500, whiteSpace: 'pre-wrap' }}>
              {row.fieldNotes}
            </div>
          </div>
        ) : null}

        {/* Navigate to probe */}
        {!!(row.lat && row.lng) && (
          <a
            href={navigateUrl(row.lat, row.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="af-btn af-btn--secondary af-btn--block"
            style={{ textDecoration: 'none', color: 'var(--field-green)', minHeight: 44, fontSize: 13 }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Navigate to probe
          </a>
        )}

        {/* Who pulled it */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 3 }}>Pulled by</div>
          <input
            type="text"
            value={removedBy}
            onChange={e => setRemovedBy(e.target.value)}
            style={pullInputStyle}
            autoComplete="off"
          />
        </div>

        {/* Notes */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 3 }}>Removal Notes (optional)</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Antenna damaged, cable chewed, left flags in place…"
            style={pullTaStyle}
          />
        </div>

        {/* Photos */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 3 }}>Photos (optional)</div>
          <input
            ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { handlePhoto(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(p)}
                  alt={`Removal photo ${i + 1}`}
                  style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border-1)', display: 'block' }}
                />
                <button
                  onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}
                  aria-label="Remove photo"
                  style={{
                    position: 'absolute', top: -5, right: -5, width: 22, height: 22,
                    borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: 'var(--ink)', color: '#fff', fontSize: 13, lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => photoRef.current?.click()}
              disabled={compressing}
              type="button"
              style={{
                width: 64, height: 64, borderRadius: 8, cursor: 'pointer',
                border: '1.5px dashed var(--border-1)', background: 'var(--bone-raised)',
                color: 'var(--stone-500)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 10,
              }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {compressing ? 'Working…' : 'Add photo'}
            </button>
          </div>
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

        {!confirming ? (
          <button
            onClick={() => { if (canSubmit) setConfirming(true); }}
            disabled={!canSubmit}
            className="af-btn af-btn--primary af-btn--block"
            style={{ opacity: canSubmit ? 1 : 0.5 }}
          >
            Mark Pulled
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="af-btn af-btn--primary af-btn--block"
              style={{ background: '#B91C1C', opacity: canSubmit ? 1 : 0.5 }}
            >
              {submitting ? 'Saving…' : 'Confirm removal'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={submitting}
              className="af-btn af-btn--secondary af-btn--block"
              style={{ opacity: submitting ? 0.5 : 1 }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── RemovalsScreen ────────────────────────────────────────────────────────────

export default function RemovalsScreen({ season, installer }: {
  season: number;
  installer: string;
}) {
  const [rows, setRows] = useState<RemovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'out' | 'pulled'>('out');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RemovalRow | null>(null);
  const [banner, setBanner] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [routeFilter, setRouteFilter] = useState<RemovalsRouteFilter>('all');
  const [routeFilterReady, setRouteFilterReady] = useState(false);

  const fetchRows = async (fresh = false) => {
    setLoading(true);
    try {
      // Always fetch the fleet so today Ryan/Brandon/Carter counts stay accurate
      // under Mine. List still filters client-side via showAll.
      const qs = new URLSearchParams({
        season: String(season),
        installer,
        all: '1',
      });
      if (fresh) qs.set('fresh', '1');
      const res = await fetch(`/api/installer/removals?${qs}`, fresh ? { cache: 'no-store' } : undefined);
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setShowAll(loadShowAll());
    const stored = loadRouteFilter();
    if (stored) {
      setRouteFilter(stored);
      setRouteFilterReady(true);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRows(); }, [season, installer]);

  // Default A/B/All once rows arrive when nothing persisted yet.
  useEffect(() => {
    if (routeFilterReady || loading) return;
    const stored = loadRouteFilter();
    if (stored) {
      setRouteFilter(stored);
      setRouteFilterReady(true);
      return;
    }
    const scoped = showAll
      ? rows
      : rows.filter(r => matchesPlannedRemover(r.plannedRemover, installer));
    const next = defaultRouteFilter(scoped);
    setRouteFilter(next);
    saveRouteFilter(next);
    setRouteFilterReady(true);
  }, [rows, loading, routeFilterReady, showAll, installer]);

  const handleShowAll = (next: boolean) => {
    setShowAll(next);
    saveShowAll(next);
  };

  const handleRouteFilter = (next: RemovalsRouteFilter) => {
    setRouteFilter(next);
    saveRouteFilter(next);
    setRouteFilterReady(true);
  };

  const handleSaved = (id: number, removedBy: string, note: string) => {
    const today = chicagoToday();
    setRows(rs => rs.map(r => (r.id === id ? { ...r, removed: true, removedOn: today, removedBy } : r)));
    setSelected(null);
    if (note) {
      setBanner(note);
      setTimeout(() => setBanner(''), 4000);
    }
  };

  if (selected) {
    return (
      <PullForm
        row={selected}
        installer={installer}
        onBack={() => setSelected(null)}
        onSaved={handleSaved}
      />
    );
  }

  // Fleet rows power today-by-person counts; Mine/Show all only scopes the list.
  const todayCounts = countTodayPulls(rows);
  const scopedRows = showAll
    ? rows
    : rows.filter(r => matchesPlannedRemover(r.plannedRemover, installer));
  const routeRows = scopedRows.filter(r => matchesRouteFilter(r.routeOrder, routeFilter));
  const stillOut = routeRows.filter(r => !r.removed);
  const pulled = routeRows.filter(r => r.removed);
  const base = tab === 'out' ? stillOut : pulled;
  const q = query.trim().toLowerCase();
  const visible = q.length >= 2
    ? base.filter(r =>
        r.fieldName.toLowerCase().includes(q) ||
        r.grower.toLowerCase().includes(q) ||
        r.probeSerial.toLowerCase().includes(q) ||
        (r.plannedRemover || '').toLowerCase().includes(q))
    : base;

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <div style={{ width: 44 }} />
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Removals</div>
          <div className="af-topbar-sub">
            {loading
              ? '…'
              : `${stillOut.length} still out · ${pulled.length} pulled · ${showAll ? 'all' : 'mine'} · ${routeFilterLabel(routeFilter)}`}
          </div>
        </div>
        <button
          onClick={() => fetchRows(true)}
          disabled={loading}
          style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--bone-raised,#f0ede8)', border: '1px solid var(--border-1)',
            color: 'var(--field-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
          aria-label="Refresh"
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="af-body" style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bone)' }}>
        {banner && (
          <div style={{
            padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: 'var(--sage-wash)', border: '1px solid var(--border-1)', color: 'var(--stone-700)',
          }}>
            {banner}
          </div>
        )}

        {!loading && stillOut.some(r => r.removalPriority === 'Priority') && tab === 'out' && (
          <div style={{
            padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: '#FEE2E2', border: '1px solid #FECACA', color: '#B91C1C',
            fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span className="af-chip" style={{ background: '#B91C1C', color: '#fff', padding: '2px 6px', fontSize: 9 }}>Priority</span>
            {stillOut.filter(r => r.removalPriority === 'Priority').length} pull{stillOut.filter(r => r.removalPriority === 'Priority').length === 1 ? '' : 's'}
          </div>
        )}

        <div className="af-segmented" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {([
            { id: false, label: 'Mine' },
            { id: true, label: 'Show all' },
          ] as const).map(opt => (
            <button
              key={String(opt.id)}
              type="button"
              aria-pressed={showAll === opt.id ? 'true' : 'false'}
              onClick={() => handleShowAll(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="af-segmented" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }} role="group" aria-label="Removal route filter">
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
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="af-segmented" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {(['out', 'pulled'] as const).map(t => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t ? 'true' : 'false'}
              onClick={() => setTab(t)}
            >
              {t === 'out' ? `Out (${stillOut.length})` : `Pulled (${pulled.length})`}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search field, grower, or serial…"
          style={inputStyle}
          autoComplete="off"
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)', fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Loading…
          </div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--stone-500)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {q.length >= 2
                ? 'No matches'
                : tab === 'pulled'
                  ? 'Nothing pulled yet'
                  : routeFilter !== 'all'
                    ? `No ${routeFilter} stops`
                    : showAll
                      ? 'All probes are out of the ground'
                      : 'No removals assigned to you'}
            </div>
            <div style={{ fontSize: 13 }}>
              {q.length >= 2
                ? 'Try a different search'
                : tab === 'pulled'
                  ? 'Pulled probes show up here'
                  : routeFilter !== 'all'
                    ? 'Try All, or the other route'
                    : showAll
                      ? 'Season complete 🎉'
                      : 'Tap Show all to see every stop'}
            </div>
          </div>
        ) : (
          visible.map(r => (
            <button
              key={r.id}
              onClick={() => { if (!r.removed) setSelected(r); }}
              style={{
                display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start',
                padding: '12px 14px', borderRadius: 12, width: '100%', textAlign: 'left',
                background: 'var(--bone-raised)',
                border: r.removalPriority === 'Priority' && !r.removed
                  ? '1px solid #FECACA'
                  : '1px solid var(--border-1)',
                cursor: r.removed ? 'default' : 'pointer',
                opacity: r.removed ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.02em', flex: 1, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{r.fieldName}</span>
                  {r.fieldNotes && (
                    <span className="af-chip" style={{ background: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', fontSize: 9 }}>Note</span>
                  )}
                  {r.removalPriority === 'Priority' && !r.removed && (
                    <span className="af-chip" style={{ background: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', fontSize: 9 }}>Priority</span>
                  )}
                </div>
                {r.removed ? (
                  <svg width="16" height="16" fill="none" stroke="var(--field-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
              </div>
              {r.grower && <div style={{ fontSize: 12, color: 'var(--stone-500)' }}>{r.grower}</div>}
              <div style={{ fontSize: 12, color: 'var(--stone-500)', fontFamily: 'var(--font-mono)' }}>
                #{r.probeSerial}{r.label ? ` · ${r.label}` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--stone-500)' }}>
                {r.removed
                  ? `Pulled ${fmtDate(r.removedOn)}${r.removedBy ? ` by ${r.removedBy}` : ''}`
                  : `Installed ${fmtDate(r.installedOn)}${r.installedBy ? ` by ${r.installedBy}` : ''}`}
              </div>
              {r.crop && (
                <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>
                  Crop: {r.crop}
                </div>
              )}
              {r.rowDirection && (
                <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>
                  Rows: {r.rowDirection}
                </div>
              )}
              {showAll && r.plannedRemover && !r.removed && (
                <div style={{ fontSize: 11, color: 'var(--stone-500)' }}>
                  Remover: {r.plannedRemover}
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {/* Today pulls — compact chrome above bottom nav; not over field-tile actions */}
      <div
        aria-label="Today's pulls"
        style={{
          flexShrink: 0,
          textAlign: 'center',
          padding: '5px 12px 7px',
          fontSize: 11,
          lineHeight: 1.2,
          color: 'var(--stone-500)',
          background: 'var(--bone)',
          borderTop: '1px solid var(--border-1)',
        }}
      >
        {loading ? '…' : formatTodayPullCounts(todayCounts)}
      </div>
    </div>
  );
}
