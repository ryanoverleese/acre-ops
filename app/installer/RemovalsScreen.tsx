'use client';

import { useEffect, useRef, useState } from 'react';
import { compressImage, playSuccessSound } from './InstallerApp';

/**
 * The pull half of the season. Lists every probe still in the ground —
 * fleet-wide, not per-installer, because whoever is out that day pulls what
 * they reach — and records each one coming out with who, notes, and photos.
 */

interface RemovalRow {
  id: number;
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
  fieldNotes: string;
  removed: boolean;
  removedOn: string;
  removedBy: string;
  removalNotes: string;
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
  background: '#fff', color: 'var(--ink)', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const taStyle: React.CSSProperties = {
  ...inputStyle, resize: 'vertical', minHeight: 90,
};

const backBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  color: 'var(--field-green)', fontWeight: 600, fontSize: 14,
  fontFamily: 'var(--font-display)', letterSpacing: '0.08em',
  textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer',
};

// ── PullForm ──────────────────────────────────────────────────────────────────

function PullForm({ row, installer, onBack, onSaved }: {
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
  const photoRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (file: File | null) => {
    if (!file) return;
    setCompressing(true);
    const compressed = await compressImage(file);
    setPhotos(p => [...p, compressed]);
    setCompressing(false);
  };

  const canSubmit = removedBy.trim().length > 0 && !submitting && !compressing;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError('');
    try {
      const fd = new FormData();
      fd.append('probeAssignmentId', String(row.id));
      fd.append('removedBy', removedBy.trim());
      if (notes.trim()) fd.append('removalNotes', notes.trim());
      photos.forEach(p => fd.append('photo', p));
      const res = await fetch('/api/removal', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save — try again'); setSubmitting(false); return; }
      playSuccessSound();
      const note = data.alreadyRemoved
        ? 'Already recorded as removed'
        : data.photoErrors?.length
          ? 'Removal saved — a photo failed to upload'
          : '';
      onSaved(row.id, removedBy.trim(), note);
    } catch { setError('Network error — removal NOT saved'); setSubmitting(false); }
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

      <div className="af-body" style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* What's coming out */}
        <div style={{
          padding: '12px 14px', background: 'var(--bone-raised,#f0ede8)', borderRadius: 12,
          border: '1.5px solid var(--border-1)',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {row.fieldName}
          </div>
          {row.grower && <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 2 }}>{row.grower}</div>}
          {row.probeSerial && (
            <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
              #{row.probeSerial}{row.label ? ` · ${row.label}` : ''}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 4 }}>
            Installed {fmtDate(row.installedOn)}{row.installedBy ? ` by ${row.installedBy}` : ''}
            {row.antennaType ? ` · ${row.antennaType}` : ''}
          </div>
        </div>

        {/* Gate codes, where it sits — what the crew needs on the way out */}
        {row.fieldNotes && (
          <div style={{
            padding: '12px 14px', background: '#FEF9C3', borderRadius: 12,
            border: '1.5px solid #FDE047', fontSize: 14, lineHeight: 1.45,
            whiteSpace: 'pre-wrap', color: 'var(--ink)',
          }}>
            {row.fieldNotes}
          </div>
        )}

        {/* Navigate to probe */}
        {!!(row.lat && row.lng) && (
          <a
            href={navigateUrl(row.lat, row.lng)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px', borderRadius: 12, textDecoration: 'none',
              background: 'var(--bone-raised,#f0ede8)', border: '1.5px solid var(--border-1)',
              color: 'var(--field-green)',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Navigate to probe
          </a>
        )}

        {/* Who pulled it */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 6 }}>Pulled by</div>
          <input
            type="text"
            value={removedBy}
            onChange={e => setRemovedBy(e.target.value)}
            style={inputStyle}
            autoComplete="off"
          />
        </div>

        {/* Notes */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 6 }}>Notes (optional)</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Antenna damaged, cable chewed, left flags in place…"
            style={taStyle}
          />
        </div>

        {/* Photos */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 6 }}>Photos (optional)</div>
          <input
            ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { handlePhoto(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={URL.createObjectURL(p)}
                  alt={`Removal photo ${i + 1}`}
                  style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, border: '1.5px solid var(--border-1)', display: 'block' }}
                />
                <button
                  onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}
                  aria-label="Remove photo"
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 24, height: 24,
                    borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: 'var(--ink)', color: '#fff', fontSize: 14, lineHeight: 1,
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
                width: 84, height: 84, borderRadius: 10, cursor: 'pointer',
                border: '1.5px dashed var(--border-1)', background: '#fff',
                color: 'var(--stone-500)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11,
              }}
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {compressing ? 'Working…' : 'Add photo'}
            </button>
          </div>
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 14 }}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding: '16px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--field-green)', color: 'var(--bone)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {submitting ? 'Saving…' : 'Mark Pulled ✓'}
        </button>
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

  const fetchRows = async (fresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/installer/removals?season=${season}${fresh ? '&fresh=1' : ''}`, fresh ? { cache: 'no-store' } : undefined);
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRows(); }, [season]);

  const handleSaved = (id: number, removedBy: string, note: string) => {
    const today = new Date().toISOString().slice(0, 10);
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

  const stillOut = rows.filter(r => !r.removed);
  const pulled = rows.filter(r => r.removed);
  const base = tab === 'out' ? stillOut : pulled;
  const q = query.trim().toLowerCase();
  const visible = q.length >= 2
    ? base.filter(r =>
        r.fieldName.toLowerCase().includes(q) ||
        r.grower.toLowerCase().includes(q) ||
        r.probeSerial.toLowerCase().includes(q))
    : base;

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <div style={{ width: 44 }} />
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Removals</div>
          <div className="af-topbar-sub">
            {loading ? '…' : `${stillOut.length} still out · ${pulled.length} pulled`}
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

      <div className="af-body" style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>
        {banner && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: '#FEF9C3', border: '1.5px solid #FDE047', color: 'var(--ink)',
          }}>
            {banner}
          </div>
        )}

        {/* Still out / Pulled tabs */}
        <div style={{ display: 'flex', gap: 8, padding: '2px 0 2px' }}>
          {(['out', 'pulled'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
                border: `1.5px solid ${tab === t ? 'var(--field-green)' : 'var(--border-1)'}`,
                background: tab === t ? 'var(--field-green)' : '#fff',
                color: tab === t ? 'var(--bone)' : 'var(--stone-500)',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}
            >
              {t === 'out' ? `Still out (${stillOut.length})` : `Pulled (${pulled.length})`}
            </button>
          ))}
        </div>

        {/* Search — the pull list is the whole fleet */}
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
              {q.length >= 2 ? 'No matches' : tab === 'pulled' ? 'Nothing pulled yet' : 'All probes are out of the ground'}
            </div>
            <div style={{ fontSize: 13 }}>
              {q.length >= 2 ? 'Try a different search' : tab === 'pulled' ? 'Pulled probes show up here' : 'Season complete 🎉'}
            </div>
          </div>
        ) : (
          visible.map(r => (
            <button
              key={r.id}
              onClick={() => { if (!r.removed) setSelected(r); }}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
                padding: '14px 16px', borderRadius: 12, width: '100%', textAlign: 'left',
                background: r.removed ? 'var(--bone-raised,#f0ede8)' : '#fff',
                border: '1.5px solid var(--border-1)',
                boxShadow: r.removed ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
                cursor: r.removed ? 'default' : 'pointer',
                opacity: r.removed ? 0.75 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                {r.routeOrder && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--field-green)',
                    background: 'var(--sage-wash,#e8ede4)', borderRadius: 6,
                    padding: '2px 7px', flexShrink: 0, fontFamily: 'var(--font-display)',
                    letterSpacing: '0.04em',
                  }}>
                    {r.routeOrder}
                  </div>
                )}
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.04em', flex: 1, color: 'var(--ink)' }}>
                  {r.fieldName}
                </div>
                {r.removed ? (
                  <svg width="18" height="18" fill="none" stroke="var(--field-green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="none" stroke="var(--stone-400,#a8a29e)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
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
            </button>
          ))
        )}
      </div>
    </div>
  );
}
