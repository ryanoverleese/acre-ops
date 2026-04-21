'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Leaflet needs window — render only on the client
const InstallerMapView = dynamic(() => import('./InstallerMapView'), { ssr: false });
const InstallGpsMap = dynamic(() => import('./InstallGpsMap'), { ssr: false });

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
  probeRack: string;
  probeRackSlot: number | null;
  antennaType: string;
  batteryType: string;
  fieldNotes: string;
  status: string;
}

type Screen = 'login' | 'route' | 'field' | 'install' | 'success' | 'map' | 'loadout' | 'me' | 'history' | 'settings';

type MapProvider = 'google' | 'apple';
const MAP_PROVIDER_KEY = 'af-map-provider';
function getMapProvider(): MapProvider {
  if (typeof window === 'undefined') return 'google';
  const v = localStorage.getItem(MAP_PROVIDER_KEY);
  return v === 'apple' ? 'apple' : 'google';
}
function mapsUrlFor(lat: number, lng: number, provider: MapProvider): string {
  if (provider === 'apple') return `https://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}`;
  return `https://maps.google.com/?daddr=${lat},${lng}`;
}
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

function playSuccessSound() {
  try {
    const AudioCtx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const note = (freq: number, startOffset: number, duration: number, vol = 0.25) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + startOffset);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startOffset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration + 0.05);
    };
    // Ascending C–E–G major arpeggio
    note(523, 0,    0.18); // C5
    note(659, 0.12, 0.18); // E5
    note(784, 0.24, 0.40); // G5
  } catch { /* silently ignore if audio unavailable */ }
}

// Muted color palette for probe-brand badges.
// Matches on brand + antenna combined so "Sentek 36\"/CropX Gateway (Small Diameter)"
// picks up the 'small' rule regardless of which piece it lives in.
function probeBadgeColors(brand: string, antenna = ''): { bg: string; fg: string } {
  const combined = `${brand} ${antenna}`.toLowerCase();
  if (/gateway[^a-z]*small|small[^a-z]*diameter/.test(combined)) return { bg: '#FEE2E2', fg: '#991B1B' };           // muted red
  if (/gateway[^a-z]*large|large[^a-z]*diameter/.test(combined)) return { bg: '#FEF3C7', fg: '#92400E' };           // muted yellow/amber
  if (/sentek/.test(combined)) return { bg: '#DCFCE7', fg: '#166534' };                                            // muted green
  if (/cropx\s*v\d|cropx\s*v(?!\w)|v4/.test(combined)) return { bg: '#DBEAFE', fg: '#1E40AF' };                    // muted blue
  return { bg: 'var(--sage-wash)', fg: 'var(--field-green)' };                                                      // default sage
}

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

  const fetchAssignments = useCallback(async (s: Session, fresh = false) => {
    setLoadingAssignments(true);
    try {
      const url = `/api/installer/assignments?installer=${encodeURIComponent(s.installer)}&season=${s.season}${fresh ? '&fresh=1' : ''}`;
      const res = await fetch(url, fresh ? { cache: 'no-store' } : undefined);
      const data = await res.json();
      setAssignments(data.assignments ?? []);
    } catch { setAssignments([]); }
    finally { setLoadingAssignments(false); }
  }, []);

  const handleLogin = (s: Session) => { setSession(s); saveSession(s); fetchAssignments(s); setScreen('route'); };
  const handleLogout = () => { clearSession(); setSession(null); setAssignments([]); setScreen('login'); };
  const handleSelectAssignment = (a: InstallerAssignment) => { setSelected(a); setScreen('field'); };
  const handleInstallSuccess = (data: SuccessData, assignmentId: number) => {
    playSuccessSound();
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, status: 'Installed' } : a));
    setSuccessData(data);
    setScreen('success');
  };
  const handleBackToRoute = () => { setSelected(null); setSuccessData(null); setScreen('route'); };

  return (
    <div className="af-app" data-theme="standard">
      {/* Screen wrapper — af-screen uses position:absolute inset:0 relative to this */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
            onRefresh={() => fetchAssignments(session, true)}
          />
        )}
        {screen === 'map' && session && (
          <MapScreen
            assignments={assignments}
            onOpenField={(a) => { setSelected(a); setScreen('field'); }}
            onBack={() => setScreen('route')}
          />
        )}
        {screen === 'loadout' && session && (
          <LoadoutScreen
            session={session}
            assignments={assignments}
          />
        )}
        {screen === 'me' && session && (
          <MeScreen
            session={session}
            assignments={assignments}
            onLogout={handleLogout}
            onOpenHistory={() => setScreen('history')}
            onOpenSettings={() => setScreen('settings')}
          />
        )}
        {screen === 'history' && session && (
          <HistoryScreen
            session={session}
            onBack={() => setScreen('me')}
          />
        )}
        {screen === 'settings' && session && (
          <SettingsScreen
            session={session}
            onBack={() => setScreen('me')}
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

      {/* Bottom nav — hidden on login */}
      {screen !== 'login' && (
        <BottomBar
          current={screen}
          onNav={setScreen}
        />
      )}
    </div>
  );
}

function BottomBar({ current, onNav }: { current: Screen; onNav: (s: Screen) => void }) {
  const isRoute = current === 'route' || current === 'field' || current === 'install' || current === 'success';
  return (
    <div className="af-bottombar">
      <button className="af-tab" aria-current={isRoute ? 'true' : undefined} onClick={() => onNav('route')}>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        Route
      </button>
      <button className="af-tab" aria-current={current === 'map' ? 'true' : undefined} onClick={() => onNav('map')}>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
        </svg>
        Map
      </button>
      <button className="af-tab" aria-current={current === 'loadout' ? 'true' : undefined} onClick={() => onNav('loadout')}>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        </svg>
        Loadout
      </button>
      <button className="af-tab" aria-current={current === 'me' ? 'true' : undefined} onClick={() => onNav('me')}>
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
        Me
      </button>
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
                    {a.label && <span style={{ color: 'var(--stone-500)' }}>{a.label}</span>}
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
  const mapsUrl = a.lat && a.lng ? mapsUrlFor(a.lat, a.lng, getMapProvider()) : null;
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
        <div style={{ width: 32 }} />
      </div>

      <div className="af-body" style={{ paddingBottom: 24, background: '#FFFFFF' }}>
        {/* Decorative green header strip */}
        <div className="af-field-hero" style={{ height: 90 }}>
          <TopoDeco />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: '0 20px 16px', color: 'var(--bone)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>
              Field Info
            </div>
          </div>
        </div>

        {/* Title */}
        <div style={{ padding: '18px 18px 14px' }}>
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

        {/* Open in Maps — secondary action near thumb zone */}
        {mapsUrl && (
          <div style={{ padding: '20px 14px 0' }}>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: 'var(--bone-raised)',
                border: '1.5px solid var(--border-1)',
                borderRadius: 'var(--r-lg)',
                textDecoration: 'none',
                color: 'var(--field-green)',
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                background: 'var(--sage-wash)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 }}>
                  Open in Maps
                </div>
                {a.lat && a.lng && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--stone-500)', marginTop: 4 }}>
                    {a.lat.toFixed(5)}°N · {Math.abs(a.lng).toFixed(5)}°W
                  </div>
                )}
              </div>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0.5 }}>
                <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
              </svg>
            </a>
          </div>
        )}
      </div>

      {/* CTA — edge-to-edge bold green bar, no gap to bottom nav */}
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
  const [livePos, setLivePos] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  // Continuous live-location watch so the blue dot on the map updates
  // as the installer walks to the probe location.
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLivePos({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
      },
      () => { /* silently ignore watch errors; capture button still works */ },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
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
    // Prefer the continuously-watched livePos (already warm) — instant lock.
    if (livePos) {
      setGps({ lat: livePos.lat, lng: livePos.lng, acc: livePos.acc });
      setGpsError('');
      return;
    }
    // Fall back to a one-shot fix if the watcher hasn't produced one yet.
    if (!navigator.geolocation) { setGpsError('GPS not available on this device'); return; }
    setGpsLoading(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
        setGps(p);
        setLivePos(p);
        setGpsLoading(false);
      },
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

      <div className="af-body" style={{ paddingBottom: 120, background: '#FFFFFF' }}>
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
            {/* Real satellite map with live blue dot + captured pin */}
            <div style={{ position: 'relative' }}>
              <InstallGpsMap
                fallbackLat={a.lat}
                fallbackLng={a.lng}
                captured={gps}
                userPos={livePos}
              />
              {/* Accuracy badge overlay */}
              {livePos && livePos.acc != null && (
                <div style={{
                  position: 'absolute', top: 8, left: 8, zIndex: 500,
                  background: 'rgba(255,255,255,0.94)',
                  borderRadius: 999, padding: '3px 10px',
                  fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--field-green)',
                  border: '1px solid var(--border-1)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                }}>
                  ±{livePos.acc.toFixed(1)} m
                </div>
              )}
              {/* Waiting-for-GPS overlay */}
              {!livePos && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(31,64,42,0.35)',
                  color: 'var(--bone)',
                  fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  pointerEvents: 'none',
                }}>
                  Acquiring GPS…
                </div>
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

// ─── Map Screen ───────────────────────────────────────────────────────────────

function MapScreen({
  assignments,
  onOpenField,
  onBack,
}: {
  assignments: InstallerAssignment[];
  onOpenField: (a: InstallerAssignment) => void;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(
    (assignments.find(a => a.status.toLowerCase() !== 'installed') ?? assignments[0])?.id ?? null
  );
  const [layer, setLayer] = useState<'street' | 'satellite'>('street');

  const todo = assignments.filter(a => a.status.toLowerCase() !== 'installed');
  const withCoords = assignments.filter(a => a.lat && a.lng);
  const selected = assignments.find(a => a.id === selectedId) ?? null;

  const mapPoints = withCoords.map(a => ({
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    routeOrder: a.routeOrder,
    status: a.status,
    fieldName: a.fieldName,
    operation: a.operation,
  }));

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--field-green)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          Route
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Today&apos;s map</div>
          <div className="af-topbar-sub">{todo.length} stop{todo.length !== 1 ? 's' : ''} remaining</div>
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative', background: '#dde5d0' }}>
        {withCoords.length === 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--stone-500)' }}>
            <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
            </svg>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginTop: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>No coordinates available</div>
          </div>
        ) : (
          <InstallerMapView
            points={mapPoints}
            selectedId={selectedId}
            onSelect={setSelectedId}
            layer={layer}
          />
        )}

        {/* Layer toggle */}
        {withCoords.length > 0 && (
          <div style={{
            position: 'absolute', top: 14, right: 14, zIndex: 400,
            background: 'rgba(246,242,234,0.94)', backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-1)', borderRadius: 'var(--r-pill)',
            padding: 3, display: 'flex', gap: 2,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            {(['street', 'satellite'] as const).map(lyr => (
              <button
                key={lyr}
                onClick={() => setLayer(lyr)}
                aria-pressed={layer === lyr ? 'true' : 'false'}
                style={{
                  minHeight: 32, padding: '0 12px', borderRadius: 999,
                  fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  background: layer === lyr ? 'var(--field-green)' : 'transparent',
                  color: layer === lyr ? 'var(--bone)' : 'var(--stone-700)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {lyr === 'street' ? 'Map' : 'Satellite'}
              </button>
            ))}
          </div>
        )}

        {/* Recenter on me */}
        {withCoords.length > 0 && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('af-recenter-me'))}
            aria-label="Recenter on my location"
            style={{
              position: 'absolute', bottom: 14, right: 14, zIndex: 400,
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--bone-raised)', color: 'var(--field-green)',
              border: '1px solid var(--border-1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)', cursor: 'pointer',
            }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
              <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
            </svg>
          </button>
        )}
      </div>

      {/* Selected stop card */}
      {selected && (
        <div style={{ padding: '14px 14px 16px', background: 'var(--bone)', borderTop: '1px solid var(--border-1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: selected.status.toLowerCase() === 'installed' ? 'var(--stone-100)' : 'var(--field-green)',
              color: selected.status.toLowerCase() === 'installed' ? 'var(--stone-400)' : 'var(--bone)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
            }}>
              {selected.status.toLowerCase() === 'installed' ? (
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
              ) : selected.routeOrder !== 999 ? (
                selected.routeOrder
              ) : (
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'currentColor' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, textTransform: 'uppercase', lineHeight: 1.05, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.fieldName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 2 }}>{selected.operation}</div>
            </div>
            <button
              className="af-btn af-btn--primary"
              style={{ minHeight: 40, padding: '0 14px', fontSize: 12 }}
              onClick={() => onOpenField(selected)}
            >
              Open
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loadout Screen ───────────────────────────────────────────────────────────

function supplyColor(type: string): { bg: string; fg: string } {
  const t = type.toLowerCase();
  if (t.includes('sentek'))  return { bg: 'rgba(196,130,30,0.11)',  fg: '#9A6810' }; // amber
  if (t.includes('cropx'))   return { bg: 'rgba(59,120,196,0.11)',  fg: '#2E6BAF' }; // blue
  if (t.includes('aquaspy')) return { bg: 'rgba(140,64,180,0.10)',  fg: '#7A3AAF' }; // purple
  return { bg: 'var(--sage-wash)', fg: 'var(--field-green)' };                       // default green
}

type LoadedMap = Record<string, boolean>;
const LOADED_KEY = 'af-loaded';

function LoadoutScreen({ session, assignments }: { session: Session; assignments: InstallerAssignment[] }) {
  const todo = assignments.filter(a => a.status.toLowerCase() !== 'installed');

  // Persisted "loaded" state per probe serial
  const [loaded, setLoaded] = useState<LoadedMap>(() => {
    try { return JSON.parse(localStorage.getItem(LOADED_KEY) || '{}'); } catch { return {}; }
  });
  const toggleLoaded = (serial: string) => {
    setLoaded(prev => {
      const next = { ...prev, [serial]: !prev[serial] };
      localStorage.setItem(LOADED_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Today's probes: one row per todo assignment with a serial
  const probeStops = todo.filter(a => a.probeSerial);
  const totalProbes = probeStops.length;
  const loadedCount = probeStops.filter(s => loaded[s.probeSerial]).length;

  // Aggregate supplies over todo only
  const antennas: Record<string, number> = {};
  const batteries: Record<string, number> = {};
  const flags = { pink: 0, blue: 0, white: 0 };
  let gatewayCount = 0;
  for (const a of todo) {
    const ant = a.antennaType || 'Standard';
    antennas[ant] = (antennas[ant] || 0) + 1;
    const bat = a.batteryType || 'Unspecified';
    batteries[bat] = (batteries[bat] || 0) + 1;
    const f = calcFlags(a.antennaType, a.sideDress);
    flags.pink += f.pink; flags.blue += f.blue; flags.white += f.white;
    // Gateway rule: 1 per probe whose TYPE is a CropX Gateway
    // (e.g. 'CropX Gateway Small Diameter'). Ignore antenna type.
    if (/gateway/i.test(a.probeBrand)) gatewayCount += 1;
  }
  const totalBatteries = Object.values(batteries).reduce((s, n) => s + n, 0);

  const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const initials = session.installer.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--stone-500)' }}>
          {todayStr}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Loadout</div>
          <div className="af-topbar-sub">{todo.length} install{todo.length !== 1 ? 's' : ''} today</div>
        </div>
        <div style={{ width: 40, textAlign: 'right', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--field-green)' }}>
          {initials}
        </div>
      </div>

      <div className="af-body" style={{ padding: '0 0 24px', background: '#FFFFFF' }}>
        {/* Hero card */}
        <div style={{
          margin: '14px 14px 0', padding: '18px 18px 20px',
          background: 'var(--field-green)', color: 'var(--bone)',
          borderRadius: 'var(--r-xl)',
          position: 'relative', overflow: 'hidden',
        }}>
          <TopoDeco />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.18em', opacity: 0.72, fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase' }}>
              Morning, {session.installer}
            </div>
            <div className="af-display-text" style={{ fontSize: 26, marginTop: 4, lineHeight: 1, color: 'var(--bone)' }}>
              Pack the truck
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              <span style={{ fontSize: 40, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{loadedCount}</span>
              <span style={{ fontSize: 18, opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>/ {totalProbes}</span>
              <span style={{ fontSize: 11, letterSpacing: '0.14em', opacity: 0.8, marginLeft: 6, textTransform: 'uppercase' }}>probes loaded</span>
            </div>
            <div style={{ height: 5, background: 'rgba(246,242,234,0.2)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(loadedCount / Math.max(totalProbes, 1)) * 100}%`, background: 'var(--bone)', transition: 'width 300ms var(--ease-out)' }} />
            </div>
          </div>
        </div>

        {/* Today's probes */}
        <SectionCard title="Today's probes" count={`${loadedCount}/${totalProbes}`} countLabel="LOADED" icon={<RackIcon />} collapsible defaultExpanded>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {probeStops.length === 0 && (
              <div style={{ background: 'var(--bone-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--r-md)', padding: 14, fontSize: 12, color: 'var(--stone-500)', textAlign: 'center' }}>
                No probes assigned yet.
              </div>
            )}
            {[...probeStops].sort((a, b) => {
              const aL = loaded[a.probeSerial] ? 1 : 0;
              const bL = loaded[b.probeSerial] ? 1 : 0;
              if (aL !== bL) return aL - bL;
              return (a.probeRack || '').localeCompare(b.probeRack || '', undefined, { numeric: true });
            }).map(s => {
              const isLoaded = !!loaded[s.probeSerial];
              const badgeColors = probeBadgeColors(s.probeBrand, s.antennaType);
              const hasRack = !!s.probeRack;
              return (
                <div key={s.probeSerial + s.id} style={{
                  display: 'flex', alignItems: 'stretch',
                  background: isLoaded ? 'var(--stone-50)' : 'var(--bone-raised)',
                  border: '1px solid var(--border-1)',
                  borderRadius: 'var(--r-md)', overflow: 'hidden',
                  transition: 'all 200ms var(--ease-out)',
                  opacity: isLoaded ? 0.5 : 1,
                }}>
                  {/* Big rack location badge — acts as a physical shelf marker */}
                  <div style={{
                    width: 88, flexShrink: 0,
                    background: isLoaded ? 'var(--stone-100)' : 'var(--field-green)',
                    color: isLoaded ? 'var(--stone-400)' : 'var(--bone)',
                    borderRight: '1px solid var(--border-1)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 4, padding: '10px 6px',
                  }}>
                    {hasRack ? (
                      <span style={{
                        fontFamily: 'var(--font-display)', fontWeight: 700,
                        fontSize: 22, lineHeight: 1, letterSpacing: '0.02em',
                        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      }}>
                        {s.probeRack}
                        {s.probeRackSlot != null && (
                          <>
                            <span style={{ margin: '0 3px', opacity: 0.55 }}>·</span>
                            {s.probeRackSlot}
                          </>
                        )}
                      </span>
                    ) : (
                      <span style={{ fontSize: 22, opacity: 0.4 }}>—</span>
                    )}
                    <span style={{
                      fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase',
                      fontFamily: 'var(--font-display)', fontWeight: 700,
                      opacity: 0.7,
                    }}>
                      Rack
                    </span>
                  </div>
                  {/* Serial + brand */}
                  <div style={{ flex: 1, minWidth: 0, padding: '12px 10px 12px 14px', display: 'flex', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
                        color: isLoaded ? 'var(--stone-500)' : 'var(--ink)',
                        fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
                        letterSpacing: '0.01em',
                        textDecoration: isLoaded ? 'line-through' : 'none',
                        textDecorationColor: 'var(--stone-500)', textDecorationThickness: '1.5px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        #{s.probeSerial || '—'}
                      </div>
                      {s.probeBrand && (
                        <div style={{ marginTop: 4 }}>
                          <span style={{
                            fontFamily: 'var(--font-display)', fontWeight: 600,
                            fontSize: 10, letterSpacing: '0.1em',
                            color: isLoaded ? 'var(--stone-500)' : badgeColors.fg,
                            background: isLoaded ? 'var(--stone-100)' : badgeColors.bg,
                            padding: '2px 6px', borderRadius: 3,
                            textTransform: 'uppercase', display: 'inline-block',
                          }}>
                            {s.probeBrand}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleLoaded(s.probeSerial)}
                    aria-pressed={isLoaded}
                    aria-label={isLoaded ? 'Mark not loaded' : 'Mark loaded'}
                    style={{
                      width: 60, flexShrink: 0,
                      background: 'transparent',
                      border: 'none', borderLeft: '1px solid var(--border-1)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                      cursor: 'pointer',
                      color: isLoaded ? 'var(--stone-500)' : 'var(--stone-500)',
                      transition: 'background 150ms',
                    }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 6,
                      background: isLoaded ? 'var(--sage-wash)' : 'transparent',
                      border: isLoaded ? '1px solid color-mix(in oklab, var(--field-green) 30%, transparent)' : '2px solid var(--stone-300)',
                      color: 'var(--field-green)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isLoaded && (
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <span style={{
                      fontSize: 8, letterSpacing: '0.14em',
                      fontFamily: 'var(--font-display)', fontWeight: 700,
                      textTransform: 'uppercase',
                      opacity: 0.55,
                    }}>
                      {isLoaded ? 'Loaded' : 'Load'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* CropX Gateways */}
        <SectionCard title="CropX Gateways" count={gatewayCount} icon={<WifiIcon />}>
          {gatewayCount === 0 ? (
            <div style={{ background: 'var(--bone-raised)', border: '1px solid var(--border-1)', borderRadius: 'var(--r-md)', padding: 14, fontSize: 12, color: 'var(--stone-500)', textAlign: 'center' }}>
              No gateways needed today.
            </div>
          ) : (
            <div style={{
              background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
              borderRadius: 'var(--r-md)', padding: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sage-wash)', color: 'var(--field-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <WifiIcon size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                    CropX Gateways
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>
                    1 per probe using a CropX Gateway antenna
                  </div>
                </div>
              </div>
              <BigCount n={gatewayCount} />
            </div>
          )}
        </SectionCard>

        {/* Antennas */}
        <SectionCard title="Antennas" count={totalProbes} icon={<WifiIcon />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            {Object.entries(antennas).sort().map(([type, count]) => (
              <div key={type} style={{ background: 'var(--bone-raised)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: supplyColor(type).bg, color: supplyColor(type).fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <WifiIcon size={16} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{type}</div>
                    <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>{count === 1 ? '1 unit' : `${count} units`}</div>
                  </div>
                </div>
                <BigCount n={count} />
              </div>
            ))}
            {Object.keys(antennas).length === 0 && (
              <div style={{ background: 'var(--bone-raised)', padding: 14, fontSize: 12, color: 'var(--stone-500)', textAlign: 'center' }}>No antennas needed.</div>
            )}
          </div>
        </SectionCard>

        {/* Batteries */}
        <SectionCard title="Batteries" count={totalBatteries} icon={<BoltIcon />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            {Object.entries(batteries).sort().map(([type, count]) => (
              <div key={type} style={{ background: 'var(--bone-raised)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: supplyColor(type).bg, color: supplyColor(type).fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BoltIcon size={16} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{type}</div>
                    <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>{count === 1 ? '1 probe' : `${count} probes`}</div>
                  </div>
                </div>
                <BigCount n={count} />
              </div>
            ))}
            {Object.keys(batteries).length === 0 && (
              <div style={{ background: 'var(--bone-raised)', padding: 14, fontSize: 12, color: 'var(--stone-500)', textAlign: 'center' }}>No batteries needed.</div>
            )}
          </div>
        </SectionCard>

        {/* Flags */}
        <SectionCard title="Marker flags" count={flags.pink + flags.blue + flags.white} icon={<FlagIcon />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border-1)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            <FlagRow color="#E85A9E" name="Pink flags" sub="Probe location" count={flags.pink} />
            <FlagRow color="#3F7BCC" name="Blue flags" sub="Antenna placement" count={flags.blue} />
            <FlagRow color="#FFFFFF" name="White flags" sub="Row-end markers" count={flags.white} border />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  title, count, countLabel = 'TOTAL', icon, children, collapsible = false, defaultExpanded = true,
}: {
  title: string; count: number | string; countLabel?: string;
  icon: React.ReactNode; children: React.ReactNode;
  collapsible?: boolean; defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const canCollapse = collapsible;
  return (
    <div style={{ padding: '18px 14px 4px' }}>
      <div
        role={canCollapse ? 'button' : undefined}
        tabIndex={canCollapse ? 0 : undefined}
        onClick={canCollapse ? () => setExpanded(e => !e) : undefined}
        onKeyDown={canCollapse ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x); } } : undefined}
        style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: expanded ? 10 : 0, padding: '0 2px',
          cursor: canCollapse ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--field-green)', display: 'inline-flex' }}>{icon}</span>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
            {title}
          </h3>
          {canCollapse && (
            <span style={{ color: 'var(--stone-500)', transition: 'transform 180ms var(--ease-out)', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-flex', alignItems: 'center', marginLeft: 2 }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--stone-500)', letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>
          {count} {countLabel}
        </div>
      </div>
      {(!canCollapse || expanded) && children}
    </div>
  );
}

function BigCount({ n }: { n: number }) {
  return (
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, lineHeight: 1, color: 'var(--field-green)', fontVariantNumeric: 'tabular-nums' }}>
      {n}
    </div>
  );
}

function FlagRow({ color, name, sub, count, border }: { color: string; name: string; sub: string; count: number; border?: boolean }) {
  return (
    <div style={{ background: 'var(--bone-raised)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg width="28" height="32" viewBox="0 0 28 32" style={{ flexShrink: 0 }}>
          <line x1="6" y1="2" x2="6" y2="30" stroke="var(--stone-700)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M 6 4 L 24 4 L 20 10 L 24 16 L 6 16 Z" fill={color} stroke={border ? 'var(--stone-500)' : 'none'} strokeWidth={border ? 0.8 : 0} />
        </svg>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>{sub}</div>
        </div>
      </div>
      <BigCount n={count} />
    </div>
  );
}

// Small inline icons for the Loadout screen
function RackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="4" rx="1" /><rect x="4" y="10" width="16" height="4" rx="1" /><rect x="4" y="16" width="16" height="4" rx="1" />
    </svg>
  );
}
function WifiIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M5 13a10 10 0 0114 0" /><path d="M8.5 16.5a5 5 0 017 0" /><line x1="12" y1="20" x2="12.01" y2="20" /><path d="M1.42 9a16 16 0 0121.16 0" />
    </svg>
  );
}
function BoltIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function FlagIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

// ─── Me Screen ────────────────────────────────────────────────────────────────

function MeScreen({
  session, assignments, onLogout, onOpenHistory, onOpenSettings,
}: {
  session: Session;
  assignments: InstallerAssignment[];
  onLogout: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
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
              last
            />
          </MenuGroup>
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

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>{label}</div>
      <div style={{
        background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
        borderRadius: 'var(--r-lg)', overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

function MenuRow({
  icon, label, sub, destructive, onClick, showChevron, last,
}: {
  icon: React.ReactNode; label: string; sub?: string;
  destructive?: boolean; onClick?: () => void; showChevron?: boolean; last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '14px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'transparent', border: 'none',
        borderBottom: last ? 'none' : '1px solid var(--border-1)',
        cursor: onClick || showChevron ? 'pointer' : 'default', textAlign: 'left',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: destructive ? '#f3d6d6' : 'var(--sage-wash)',
        color: destructive ? '#a84a3a' : 'var(--field-green)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: destructive ? '#a84a3a' : 'var(--ink)' }}>
          {label}
        </div>
        {sub && <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>{sub}</div>}
      </div>
      {showChevron && (
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ color: 'var(--stone-300)', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}

// ─── Install History Screen ───────────────────────────────────────────────────

interface HistoryEntry {
  id: number;
  fieldName: string;
  operation: string;
  crop: string;
  probeSerial: string;
  installDate: string;
  label: string;
}

function HistoryScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

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
                <div key={h.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--bone-raised)',
                  border: '1px solid var(--border-1)',
                  borderRadius: 'var(--r-md)',
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
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings Screen ──────────────────────────────────────────────────────────

function SettingsScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const [mapProvider, setMapProvider] = useState<MapProvider>('google');

  useEffect(() => {
    setMapProvider(getMapProvider());
  }, []);

  useEffect(() => {
    localStorage.setItem(MAP_PROVIDER_KEY, mapProvider);
  }, [mapProvider]);

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button
          onClick={onBack}
          style={{ color: 'var(--field-green)', padding: 6, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label="Back"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Settings</div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div className="af-body" style={{ padding: '14px 14px 40px', background: '#FFFFFF' }}>
        {/* Map provider */}
        <div style={{ marginBottom: 22 }}>
          <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>Map provider</div>
          <div style={{
            background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--r-lg)', overflow: 'hidden',
          }}>
            {[
              { id: 'google' as const, label: 'Google Maps', sub: 'maps.google.com' },
              { id: 'apple' as const, label: 'Apple Maps', sub: 'maps.apple.com · iOS default' },
            ].map((opt, i, arr) => (
              <button
                key={opt.id}
                onClick={() => setMapProvider(opt.id)}
                style={{
                  width: '100%', padding: '14px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'transparent', border: 'none',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border-1)' : 'none',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 11,
                  border: mapProvider === opt.id ? '7px solid var(--field-green)' : '2px solid var(--stone-300)',
                  flexShrink: 0, transition: 'border-width 0.1s',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>
                    {opt.sub}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 8, padding: '0 4px', lineHeight: 1.4 }}>
            Used when you tap &ldquo;Get directions&rdquo; from a field.
          </div>
        </div>

        {/* Signed in as */}
        <div style={{ marginBottom: 22 }}>
          <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>Signed in as</div>
          <div style={{
            background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--r-lg)', padding: '14px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--sage-wash)', color: 'var(--field-green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
            }}>
              {session.installer.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>
                {session.installer}
              </div>
              <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>
                {session.season} season
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 8, padding: '0 4px', lineHeight: 1.4 }}>
            Sign out from the Account screen to switch installer.
          </div>
        </div>

        {/* App info */}
        <div style={{
          padding: '14px', borderTop: '1px solid var(--border-1)',
          textAlign: 'center', color: 'var(--stone-500)', fontSize: 11,
          lineHeight: 1.6, marginTop: 8,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>ACRE FIELD · v1.0</div>
          <div>Acre Insights · {session.season} season</div>
        </div>
      </div>
    </div>
  );
}
