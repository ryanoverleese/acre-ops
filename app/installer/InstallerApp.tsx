'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstallerAssignment {
  id: number;
  fieldSeasonId: number;
  fieldId: number;
  fieldName: string;
  operation: string;
  lat: number;
  lng: number;
  crop: string;
  sideDress: string;
  rowDirection: string;
  routeOrder: number;
  probeNumber: number;
  label: string;
  probeId: number | null;
  probeSerial: string;
  probeBrand: string;
  antennaType: string;
  fieldNotes: string;
  status: string;
}

type Screen = 'login' | 'route' | 'field' | 'install' | 'success';
type Filter = 'todo' | 'done' | 'all';

interface Session {
  installer: string;
  season: number;
}

interface SuccessData {
  fieldName: string;
  probeSerial: string;
  flags: { pink: number; blue: number; white: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcFlags(antennaType: string, sideDress: string) {
  const antenna = antennaType.toLowerCase();
  const sd = sideDress.toLowerCase();
  const hasCoulter = antenna.includes('coulter') || sd.includes('cultivat') || sd.includes('coulter');
  const hasStub = antenna.includes('stub');
  const white = hasStub && !hasCoulter ? 2 : 1;
  return { pink: 1, blue: 5, white };
}

const TARGET_SIZE = 2 * 1024 * 1024;

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (file.size > TARGET_SIZE * 2) {
        const scale = Math.sqrt(TARGET_SIZE / file.size);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), { type: 'image/jpeg' }) : file),
        'image/jpeg', 0.82
      );
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

const SESSION_KEY = 'installer-session';
function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s.installer ? s : null;
  } catch { return null; }
}
function saveSession(s: Session) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

// Topo SVG decoration used in green headers
function TopoDeco() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.12, pointerEvents: 'none' }} viewBox="0 0 400 220" preserveAspectRatio="none">
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M-20 40 Q 80 10, 180 50 T 420 30" />
        <path d="M-20 70 Q 100 40, 200 80 T 420 60" />
        <path d="M-20 100 Q 120 70, 220 110 T 420 90" />
        <path d="M-20 130 Q 140 100, 240 140 T 420 120" />
        <path d="M-20 160 Q 160 130, 260 170 T 420 150" />
        <path d="M-20 190 Q 180 160, 280 200 T 420 180" />
      </g>
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InstallerApp({ installerNames }: { installerNames: string[] }) {
  const [screen, setScreen] = useState<Screen>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [assignments, setAssignments] = useState<InstallerAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [selected, setSelected] = useState<InstallerAssignment | null>(null);
  const [filter, setFilter] = useState<Filter>('todo');
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (s) { setSession(s); fetchAssignments(s); setScreen('route'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAssignments = useCallback(async (s: Session) => {
    setLoadingAssignments(true);
    try {
      const res = await fetch(`/api/installer/assignments?installer=${encodeURIComponent(s.installer)}&season=${s.season}`);
      const data = await res.json();
      setAssignments(data.assignments ?? []);
    } catch { setAssignments([]); }
    finally { setLoadingAssignments(false); }
  }, []);

  const handleLogin = (s: Session) => { setSession(s); saveSession(s); fetchAssignments(s); setScreen('route'); };
  const handleLogout = () => { clearSession(); setSession(null); setAssignments([]); setScreen('login'); };
  const handleSelectAssignment = (a: InstallerAssignment) => { setSelected(a); setScreen('field'); };
  const handleInstallSuccess = (data: SuccessData, assignmentId: number) => {
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, status: 'Installed' } : a));
    setSuccessData(data);
    setScreen('success');
  };
  const handleBackToRoute = () => { setSelected(null); setSuccessData(null); setScreen('route'); };

  return (
    <div className="af-app" data-theme="standard">
      {screen === 'login' && (
        <LoginScreen installerNames={installerNames} onLogin={handleLogin} />
      )}
      {screen === 'route' && session && (
        <RouteScreen
          session={session}
          assignments={assignments}
          loading={loadingAssignments}
          filter={filter}
          onFilterChange={setFilter}
          onSelect={handleSelectAssignment}
          onLogout={handleLogout}
          onRefresh={() => fetchAssignments(session)}
        />
      )}
      {screen === 'field' && selected && (
        <FieldScreen
          assignment={selected}
          onBack={() => setScreen('route')}
          onStartInstall={() => setScreen('install')}
        />
      )}
      {screen === 'install' && selected && session && (
        <InstallScreen
          assignment={selected}
          installer={session.installer}
          onBack={() => setScreen('field')}
          onSuccess={handleInstallSuccess}
        />
      )}
      {screen === 'success' && successData && (
        <SuccessScreen data={successData} onBack={handleBackToRoute} />
      )}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ installerNames, onLogin }: { installerNames: string[]; onLogin: (s: Session) => void }) {
  const [installer, setInstaller] = useState(installerNames[0] ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  const handleDigit = (d: string) => { if (pin.length < 4) setPin(p => p + d); };
  const handleDelete = () => setPin(p => p.slice(0, -1));

  // Auto-submit when 4th digit is entered
  useEffect(() => {
    if (pin.length === 4 && installer && !loading) {
      handleSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleSubmit = async () => {
    if (!installer) { setError('Select your name'); return; }
    if (pin.length < 4) { setError('Enter your 4-digit PIN'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/installer-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installer, pin }),
      });
      if (res.ok) {
        onLogin({ installer, season: currentYear });
      } else {
        const data = await res.json();
        setError(data.error || 'Incorrect PIN');
        setPin('');
      }
    } catch { setError('Connection error — try again'); }
    finally { setLoading(false); }
  };

  const numpadRows = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];

  return (
    <div className="af-screen" style={{ overflowY: 'auto', background: 'var(--bone)' }}>
      {/* Green header */}
      <div style={{ background: 'var(--field-green)', color: 'var(--bone)', padding: '56px 20px 28px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <TopoDeco />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', opacity: 0.72 }}>
            Acre Insights
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 40, textTransform: 'uppercase', lineHeight: 0.95, marginTop: 6 }}>
            Field App
          </div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 8, letterSpacing: '0.02em' }}>
            {currentYear} season · Installer login
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
        {/* Installer picker */}
        <div className="af-field">
          <label>Your name</label>
          {installerNames.length === 0 ? (
            <div style={{ padding: '14px 16px', background: 'var(--bone-raised)', border: '1px solid var(--border-2)', borderRadius: 'var(--r-md)', fontSize: 15, color: 'var(--stone-500)' }}>
              No installers configured
            </div>
          ) : installerNames.length <= 5 ? (
            <div className="af-pills">
              {installerNames.map(n => (
                <button
                  key={n}
                  aria-pressed={installer === n}
                  onClick={() => { setInstaller(n); setPin(''); setError(''); }}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <select
              className="af-select"
              value={installer}
              onChange={e => { setInstaller(e.target.value); setPin(''); setError(''); }}
            >
              {installerNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>

        {/* PIN dots */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--stone-500)', marginBottom: 14 }}>
            PIN
          </div>
          <div className="af-pin-dots">
            {[0,1,2,3].map(i => (
              <div key={i} className={`af-pin-dot${i < pin.length ? ' filled' : ''}`} />
            ))}
          </div>
        </div>

        {/* Numpad */}
        <div className="af-numpad">
          {numpadRows.flat().map((d, i) => {
            if (d === '') return <button key={i} className="af-numpad-btn ghost" disabled />;
            if (d === '⌫') return <button key={i} className="af-numpad-btn delete" onClick={handleDelete}>⌫</button>;
            return <button key={i} className="af-numpad-btn" onClick={() => handleDigit(d)}>{d}</button>;
          })}
        </div>

        {error && <div className="af-error-msg">{error}</div>}

        {loading && (
          <div style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--stone-500)' }}>
            Signing in…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Route Screen ─────────────────────────────────────────────────────────────

function RouteScreen({
  session, assignments, loading, filter, onFilterChange, onSelect, onLogout, onRefresh,
}: {
  session: Session; assignments: InstallerAssignment[];
  loading: boolean; filter: Filter;
  onFilterChange: (f: Filter) => void;
  onSelect: (a: InstallerAssignment) => void;
  onLogout: () => void;
  onRefresh: () => void;
}) {
  const todo = assignments.filter(a => a.status.toLowerCase() !== 'installed');
  const done = assignments.filter(a => a.status.toLowerCase() === 'installed');
  const visible = filter === 'todo' ? todo : filter === 'done' ? done : assignments;
  const progress = assignments.length > 0 ? done.length / assignments.length : 0;

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
            <div className="date">{dateStr}</div>
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
            <div className="num">{done.length}<span style={{ opacity: 0.4, fontSize: '0.6em' }}> / {assignments.length}</span></div>
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
      <div className="af-filterbar">
        <div className="af-segmented">
          {(['todo', 'done', 'all'] as Filter[]).map(f => (
            <button
              key={f}
              aria-pressed={filter === f ? 'true' : 'false'}
              onClick={() => onFilterChange(f)}
            >
              {f === 'todo' ? 'To install' : f === 'done' ? 'Done' : 'All'}
              <span className="count">{f === 'todo' ? todo.length : f === 'done' ? done.length : assignments.length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="af-body" style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              {filter === 'todo' ? 'All done for today!' : 'Nothing here yet'}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Switch filters to see other stops.</div>
          </div>
        )}
        {!loading && visible.map(a => {
          const isInstalled = a.status.toLowerCase() === 'installed';
          const orderLabel = a.routeOrder !== 999 ? String(a.routeOrder) : '—';
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
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 9, letterSpacing: '0.16em', color: '#fff', background: '#B91C1C', padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase' }}>
                      Note
                    </span>
                  )}
                </div>
                <div className="af-stop-op">{a.operation}</div>
                {(a.probeSerial || a.label) && (
                  <div className="af-stop-probe">
                    {a.probeSerial ? `#${a.probeSerial}` : ''}
                    {a.probeSerial && a.label ? '  ·  ' : ''}
                    {a.label || ''}
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

// ─── Field Detail Screen ──────────────────────────────────────────────────────

function FieldScreen({ assignment: a, onBack, onStartInstall }: {
  assignment: InstallerAssignment; onBack: () => void; onStartInstall: () => void;
}) {
  const mapsUrl = a.lat && a.lng ? `https://maps.google.com/?daddr=${a.lat},${a.lng}` : null;
  const isDone = a.status.toLowerCase() === 'installed';

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
            {a.routeOrder !== 999 ? `Stop ${a.routeOrder}` : 'Field Detail'}
          </div>
        </div>
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--field-green)', padding: 6, display: 'flex', alignItems: 'center' }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M3 11l19-9-9 19-2-8-8-2z" />
            </svg>
          </a>
        ) : <div style={{ width: 32 }} />}
      </div>

      <div className="af-body" style={{ paddingBottom: 100 }}>
        {/* Hero */}
        <div className="af-field-hero">
          <TopoDeco />
          <div style={{ position: 'absolute', left: 18, bottom: 18, color: 'var(--bone)' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', fontFamily: 'var(--font-display)', fontWeight: 600, opacity: 0.72, textTransform: 'uppercase' }}>
              Field location
            </div>
            {a.lat && a.lng && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginTop: 4, opacity: 0.85 }}>
                {a.lat.toFixed(4)}°N · {Math.abs(a.lng).toFixed(4)}°W
              </div>
            )}
          </div>
          {mapsUrl && (
            <div style={{ position: 'absolute', right: 18, bottom: 18, color: 'var(--bone)', opacity: 0.7, fontSize: 10, letterSpacing: '0.14em', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase' }}>
              Tap for maps ►
            </div>
          )}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ position: 'absolute', inset: 0 }} aria-label="Open in maps" />
          )}
        </div>

        {/* Title */}
        <div style={{ padding: '18px 18px 8px' }}>
          <div className="af-eyebrow">{a.operation}</div>
          <div className="af-display-text" style={{ fontSize: 32, marginTop: 6, textTransform: 'uppercase' }}>{a.fieldName}</div>
          {isDone && (
            <span className="af-chip af-chip--installed" style={{ marginTop: 10 }}>
              <svg width="12" height="12" stroke="currentColor" strokeWidth="3" fill="none" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
              Installed
            </span>
          )}
        </div>

        {/* Stat grid */}
        <div style={{ padding: '0 14px' }}>
          <div className="af-statgrid">
            <div className="stat"><span className="lbl">Crop</span><span className="val">{a.crop || '—'}</span></div>
            <div className="stat"><span className="lbl">Brand</span><span className="val" style={{ fontSize: 13 }}>{a.probeBrand || '—'}</span></div>
            <div className="stat"><span className="lbl">Rows</span><span className="val" style={{ fontSize: a.rowDirection ? 14 : 17 }}>{a.rowDirection || '—'}</span></div>
            <div className="stat"><span className="lbl">Antenna</span><span className="val" style={{ fontSize: 11, lineHeight: 1.2 }}>{a.antennaType || '—'}</span></div>
          </div>
        </div>

        {/* Probe card */}
        <div style={{ padding: '16px 14px 0' }}>
          <div className="af-eyebrow" style={{ marginBottom: 8 }}>Probe to install</div>
          <div className="af-probe">
            <div className="sprite">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
              </svg>
            </div>
            <div className="info">
              <div className="serial">{a.probeSerial ? `#${a.probeSerial}` : 'Not assigned'}</div>
              <div className="brand">{a.probeBrand}{a.label ? ` · ${a.label}` : ''}</div>
            </div>
          </div>
        </div>

        {/* Install note / access notes */}
        {a.fieldNotes && (
          <div style={{ padding: '16px 14px 0' }}>
            <div className="af-install-note">
              <div className="note-label">Install Note</div>
              <div style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink)', fontWeight: 500 }}>{a.fieldNotes}</div>
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      {!isDone && (
        <div className="af-cta-bar">
          <button className="af-btn af-btn--primary af-btn--xl af-btn--block" onClick={onStartInstall}>
            Start Install
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Install Screen ───────────────────────────────────────────────────────────

function InstallScreen({ assignment: a, installer, onBack, onSuccess }: {
  assignment: InstallerAssignment; installer: string;
  onBack: () => void; onSuccess: (data: SuccessData, assignmentId: number) => void;
}) {
  const [probeSerial, setProbeSerial] = useState(a.probeSerial);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [cropConfirmed, setCropConfirmed] = useState<null | true | false>(null);
  const [cropChanged, setCropChanged] = useState('');
  const [rowDir, setRowDir] = useState<string | null>(null);
  const [cropxId, setCropxId] = useState('');
  const [photoEnd, setPhotoEnd] = useState<File | null>(null);
  const [photoExtra, setPhotoExtra] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const photoEndRef = useRef<HTMLInputElement>(null);
  const photoExtraRef = useRef<HTMLInputElement>(null);

  const doneMap = {
    gps: !!gps,
    crop: cropConfirmed !== null,
    photoEnd: !!photoEnd,
    rowDir: !!rowDir,
  };
  const requiredKeys = ['gps', 'crop', 'photoEnd', 'rowDir'] as const;
  const completedCount = requiredKeys.filter(k => doneMap[k]).length;
  const progress = completedCount / requiredKeys.length;
  const canSubmit = completedCount === requiredKeys.length;

  const captureGps = () => {
    if (!navigator.geolocation) { setGpsError('GPS not available on this device'); return; }
    setGpsLoading(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }); setGpsLoading(false); },
      () => { setGpsError('Could not get location — check permissions'); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handlePhoto = async (field: 'end' | 'extra', file: File | null) => {
    if (!file) return;
    const compressed = file.size > TARGET_SIZE ? await compressImage(file) : file;
    if (field === 'end') setPhotoEnd(compressed);
    else setPhotoExtra(compressed);
  };

  const handleSubmit = async () => {
    if (!gps) { setError('GPS location is required'); return; }
    if (!photoEnd) { setError('Field end photo is required'); return; }
    setError(''); setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('probeAssignmentId', String(a.id));
      fd.append('fieldSeasonId', String(a.fieldSeasonId));
      fd.append('installer', installer);
      fd.append('lat', String(gps.lat));
      fd.append('lng', String(gps.lng));
      fd.append('crop', cropConfirmed === false && cropChanged ? cropChanged : a.crop);
      if (rowDir) fd.append('rowDirection', rowDir);
      if (cropxId) fd.append('cropxTelemetryId', cropxId);
      if (notes) fd.append('installNotes', notes);
      fd.append('photoFieldEnd', photoEnd);
      if (photoExtra) fd.append('photoExtra', photoExtra);

      const res = await fetch('/api/install', { method: 'POST', body: fd });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Submit failed — try again'); return; }
      const flags = calcFlags(a.antennaType, a.sideDress);
      onSuccess({ fieldName: a.fieldName, probeSerial, flags }, a.id);
    } catch { setError('Network error — check connection and try again'); }
    finally { setSubmitting(false); }
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
          Back
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Log install</div>
          <div className="af-topbar-sub">{completedCount} / {requiredKeys.length} complete</div>
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Thin progress bar */}
      <div style={{ height: 3, background: 'var(--stone-50)', position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, right: 'auto', width: `${progress * 100}%`, background: 'var(--field-green)', transition: 'width 200ms var(--ease-out)' }} />
      </div>

      <div className="af-body" style={{ paddingBottom: 120 }}>
        {/* Compact field header */}
        <div style={{ background: 'var(--field-green)', color: 'var(--bone)', padding: '14px 18px 16px', position: 'relative', overflow: 'hidden' }}>
          <TopoDeco />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', opacity: 0.72, fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase' }}>
              {a.operation} · {a.crop}
            </div>
            <div className="af-display-text" style={{ fontSize: 26, marginTop: 4, textTransform: 'uppercase', color: 'var(--bone)' }}>{a.fieldName}</div>
          </div>
        </div>

        {/* Section 1: Probe serial */}
        <InstallSection num={1} title="Probe serial" done={!!probeSerial}>
          <div className="af-probe">
            <div className="sprite">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" />
              </svg>
            </div>
            <div className="info">
              <div className="serial">#{probeSerial || '—'}</div>
              <div className="brand">{a.probeBrand}{a.label ? ` · ${a.label}` : ''}</div>
            </div>
          </div>
          <div className="af-field" style={{ marginTop: 10 }}>
            <label>Override serial number</label>
            <input
              className="af-input af-mono"
              type="text"
              inputMode="numeric"
              value={probeSerial}
              onChange={e => setProbeSerial(e.target.value.replace(/\D/g, ''))}
              placeholder="Serial number"
            />
          </div>
        </InstallSection>

        {/* Section 2: GPS */}
        <InstallSection num={2} title="GPS location" done={doneMap.gps} hint="Stand at the probe, then capture.">
          <div className="af-gps-cap">
            {/* Mini map */}
            <div className={`af-minimap${gpsLoading ? ' af-capturing' : ''}`}>
              <div className="grid" />
              <svg style={{ position: 'absolute', inset: 0 }} viewBox="0 0 100 100" preserveAspectRatio="none">
                <g stroke="rgba(107,100,86,0.3)" strokeWidth="0.5" fill="none">
                  <path d="M 0 35 L 100 38" /><path d="M 0 70 L 100 68" />
                  <path d="M 35 0 L 37 100" /><path d="M 72 0 L 70 100" />
                </g>
                <rect x="25" y="20" width="50" height="50" fill="rgba(31,64,42,0.12)" stroke="var(--field-green)" strokeWidth="0.8" strokeDasharray="2 1.5" />
                <text x="50" y="16" textAnchor="middle" fontSize="3" fill="var(--field-green)" fontFamily="monospace" fontWeight="600">
                  {a.fieldName.toUpperCase().slice(0, 20)}
                </text>
              </svg>
              <div className="user-dot">
                <div className="pulse" />
                <div className="core" />
              </div>
              {gps && (
                <div className="probe-pin">
                  <div className="inner">
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                </div>
              )}
              {gps && gps.acc && (
                <div className="acc-badge">±{gps.acc.toFixed(1)} m</div>
              )}
            </div>
            {/* Coords row */}
            <div className="coords-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                {gps ? (
                  <div className="coords-text">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</div>
                ) : (
                  <div className="coords-placeholder">{gpsLoading ? 'Searching satellites…' : 'Not yet captured'}</div>
                )}
              </div>
            </div>
          </div>
          <button
            className={`af-btn ${gps ? 'af-btn--secondary' : 'af-btn--primary'} af-btn--lg af-btn--block`}
            onClick={captureGps}
            disabled={gpsLoading}
            style={{ marginTop: 10 }}
            type="button"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2m-3.3-6.7-1.4 1.4M6.7 17.3l-1.4 1.4m0-12.1 1.4 1.4m8.5 8.5 1.4 1.4" />
            </svg>
            {gpsLoading ? 'Capturing…' : gps ? 'Re-capture' : 'Capture point'}
          </button>
          {gpsError && <div className="af-error-msg" style={{ marginTop: 8 }}>{gpsError}</div>}
        </InstallSection>

        {/* Section 3: Crop confirmation */}
        <InstallSection num={3} title="Crop confirmation" done={doneMap.crop} hint={`Planned: ${a.crop}`}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              aria-pressed={cropConfirmed === true ? 'true' : 'false'}
              onClick={() => { setCropConfirmed(true); setCropChanged(''); }}
              className="af-btn af-btn--lg"
              style={{
                background: cropConfirmed === true ? 'var(--field-green)' : 'var(--bone-raised)',
                color: cropConfirmed === true ? 'var(--bone)' : 'var(--ink)',
                border: `1px solid ${cropConfirmed === true ? 'var(--field-green)' : 'var(--border-2)'}`,
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {a.crop}
            </button>
            <button
              aria-pressed={cropConfirmed === false ? 'true' : 'false'}
              onClick={() => setCropConfirmed(false)}
              className="af-btn af-btn--lg"
              style={{
                background: cropConfirmed === false ? 'var(--dry)' : 'var(--bone-raised)',
                color: cropConfirmed === false ? 'white' : 'var(--ink)',
                border: `1px solid ${cropConfirmed === false ? 'var(--dry)' : 'var(--border-2)'}`,
              }}
            >
              Changed
            </button>
          </div>
          {cropConfirmed === false && (
            <div className="af-field" style={{ marginTop: 10 }}>
              <label>What&apos;s planted?</label>
              <input
                className="af-input"
                placeholder="e.g. Soybeans"
                value={cropChanged}
                onChange={e => setCropChanged(e.target.value)}
              />
            </div>
          )}
        </InstallSection>

        {/* Section 4: Row direction */}
        <InstallSection num={4} title="Row direction" done={doneMap.rowDir} hint="Planting rows run…">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['N–S', 'E–W', 'NE–SW', 'NW–SE'] as const).map(dir => (
              <button
                key={dir}
                aria-pressed={rowDir === dir ? 'true' : 'false'}
                onClick={() => setRowDir(dir)}
                className="af-btn af-btn--lg"
                style={{
                  background: rowDir === dir ? 'var(--field-green)' : 'var(--bone-raised)',
                  color: rowDir === dir ? 'var(--bone)' : 'var(--ink)',
                  border: `1px solid ${rowDir === dir ? 'var(--field-green)' : 'var(--border-2)'}`,
                }}
              >
                {dir}
              </button>
            ))}
          </div>
        </InstallSection>

        {/* Section 5: Photos */}
        <InstallSection num={5} title="Photos" done={doneMap.photoEnd} hint="Field end shot + optional extra.">
          <div>
            <input ref={photoEndRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => handlePhoto('end', e.target.files?.[0] ?? null)} />
            <input ref={photoExtraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => handlePhoto('extra', e.target.files?.[0] ?? null)} />
            <div className="af-photos">
              <button
                className={`af-photo-slot${photoEnd ? ' filled' : ''}`}
                onClick={() => photoEndRef.current?.click()}
                type="button"
              >
                {!photoEnd && (
                  <>
                    <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    Field end <span style={{ fontSize: 9, color: '#B23A2A' }}>*</span>
                  </>
                )}
                {photoEnd && (
                  <>
                    <div className="check">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="lbl-bottom">
                      <span>Field end</span>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </div>
                  </>
                )}
              </button>
              <button
                className={`af-photo-slot${photoExtra ? ' filled' : ''}`}
                onClick={() => photoExtraRef.current?.click()}
                type="button"
              >
                {!photoExtra && (
                  <>
                    <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    Extra
                  </>
                )}
                {photoExtra && (
                  <>
                    <div className="check">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="lbl-bottom">
                      <span>Extra</span>
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </div>
                  </>
                )}
              </button>
            </div>
          </div>
        </InstallSection>

        {/* Section 6: CropX telemetry ID */}
        <InstallSection num={6} title="CropX telemetry ID" done={!!cropxId} hint="Optional — found on probe unit.">
          <input
            className="af-input af-mono"
            placeholder="TX-000000"
            value={cropxId}
            onChange={e => setCropxId(e.target.value.toUpperCase())}
            style={{ textTransform: 'uppercase' }}
          />
        </InstallSection>

        {/* Section 7: Install notes */}
        <InstallSection num={7} title="Install notes" done={!!notes} hint="Optional — anything unusual?">
          <textarea
            className="af-textarea"
            placeholder="Residue heavy, soil dry on top, grower mentioned replant in west end…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </InstallSection>

        {error && <div style={{ padding: '0 14px 8px' }}><div className="af-error-msg">{error}</div></div>}
      </div>

      {/* Sticky submit bar */}
      <div className="af-cta-bar">
        <button
          className="af-btn af-btn--primary af-btn--xl af-btn--block"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{ opacity: canSubmit ? 1 : 0.55 }}
        >
          {submitting ? (
            'Submitting…'
          ) : canSubmit ? (
            <>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Submit install
            </>
          ) : (
            `${requiredKeys.length - completedCount} field${requiredKeys.length - completedCount === 1 ? '' : 's'} to go`
          )}
        </button>
      </div>
    </div>
  );
}

function InstallSection({ num, title, done, hint, children }: {
  num: number; title: string; done: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ padding: '20px 14px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <div className={`af-section-num ${done ? 'done' : 'todo'}`}>
          {done ? (
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : num}
        </div>
        <div className="af-display-text" style={{ fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--stone-500)', marginLeft: 34, marginBottom: 10 }}>{hint}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({ data, onBack }: { data: SuccessData; onBack: () => void }) {
  return (
    <div className="af-screen">
      <div className="af-body" style={{ padding: '40px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        {/* Check circle */}
        <div style={{
          width: 120, height: 120, borderRadius: '50%',
          background: 'var(--sage-wash)', color: 'var(--field-green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', marginBottom: 24,
        }}>
          <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '2px solid var(--field-green)', opacity: 0.2 }} />
          <svg width="56" height="56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div className="af-eyebrow" style={{ textAlign: 'center', marginBottom: 8 }}>Install logged</div>
        <div className="af-display-text" style={{ fontSize: 36, textAlign: 'center', textTransform: 'uppercase', marginBottom: 10 }}>
          Done!
        </div>
        <p style={{ textAlign: 'center', color: 'var(--stone-700)', fontSize: 16, marginBottom: 28, fontWeight: 500 }}>
          {data.fieldName}{data.probeSerial ? ` · #${data.probeSerial}` : ''}
        </p>

        {/* Flag stakes card */}
        <div style={{
          background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
          borderRadius: 'var(--r-lg)', padding: '20px 24px',
          width: '100%', maxWidth: 320,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--stone-500)', marginBottom: 14 }}>
            Flag stakes needed
          </div>
          {[
            { count: data.flags.pink, label: 'pink', color: '#f472b6' },
            { count: data.flags.blue, label: 'blue', color: '#3b82f6' },
            { count: data.flags.white, label: 'white', color: '#e5e7eb', border: '1.5px solid #9ca3af' },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: f.color, border: f.border, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
                {f.count}
              </span>
              <span style={{ fontSize: 14, color: 'var(--stone-500)', textTransform: 'capitalize' }}>{f.label}</span>
            </div>
          ))}
        </div>

        <button
          className="af-btn af-btn--primary af-btn--xl af-btn--block"
          style={{ marginTop: 24, maxWidth: 320 }}
          onClick={onBack}
        >
          Continue route
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
