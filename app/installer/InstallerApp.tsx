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
  const hasCoulter =
    antenna.includes('coulter') ||
    sd.includes('cultivat') ||
    sd.includes('coulter');
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
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        0.82
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
    if (!s.installer) return null;
    return s;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
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

  // Restore session on mount
  useEffect(() => {
    const s = loadSession();
    if (s) {
      setSession(s);
      fetchAssignments(s);
      setScreen('route');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAssignments = useCallback(async (s: Session) => {
    setLoadingAssignments(true);
    try {
      const res = await fetch(`/api/installer/assignments?installer=${encodeURIComponent(s.installer)}&season=${s.season}`);
      const data = await res.json();
      setAssignments(data.assignments ?? []);
    } catch {
      setAssignments([]);
    } finally {
      setLoadingAssignments(false);
    }
  }, []);

  const handleLogin = (s: Session) => {
    setSession(s);
    saveSession(s);
    fetchAssignments(s);
    setScreen('route');
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setAssignments([]);
    setScreen('login');
  };

  const handleSelectAssignment = (a: InstallerAssignment) => {
    setSelected(a);
    setScreen('field');
  };

  const handleStartInstall = () => {
    setScreen('install');
  };

  const handleInstallSuccess = (data: SuccessData, assignmentId: number) => {
    // Mark as installed locally
    setAssignments(prev =>
      prev.map(a => a.id === assignmentId ? { ...a, status: 'Installed' } : a)
    );
    setSuccessData(data);
    setScreen('success');
  };

  const handleBackToRoute = () => {
    setSelected(null);
    setSuccessData(null);
    setScreen('route');
  };

  if (screen === 'login') {
    return <LoginScreen installerNames={installerNames} onLogin={handleLogin} />;
  }
  if (screen === 'route' && session) {
    return (
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
    );
  }
  if (screen === 'field' && selected) {
    return (
      <FieldScreen
        assignment={selected}
        onBack={() => setScreen('route')}
        onStartInstall={handleStartInstall}
      />
    );
  }
  if (screen === 'install' && selected && session) {
    return (
      <InstallScreen
        assignment={selected}
        installer={session.installer}
        onBack={() => setScreen('field')}
        onSuccess={handleInstallSuccess}
      />
    );
  }
  if (screen === 'success' && successData) {
    return <SuccessScreen data={successData} onBack={handleBackToRoute} />;
  }
  return null;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({
  installerNames,
  onLogin,
}: {
  installerNames: string[];
  onLogin: (s: Session) => void;
}) {
  const [installer, setInstaller] = useState(installerNames[0] ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  const handleDigit = (d: string) => {
    if (pin.length < 6) setPin(p => p + d);
  };
  const handleDelete = () => setPin(p => p.slice(0, -1));

  const handleSubmit = async () => {
    if (!installer) { setError('Select your name'); return; }
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    setLoading(true);
    setError('');
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
    } catch {
      setError('Connection error — try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="installer-screen installer-login">
      <div className="installer-login-logo">
        <div className="installer-logo-icon">🌾</div>
        <h1>Acre Field</h1>
        <p>Field Installer App</p>
      </div>

      <div className="installer-login-card">
        <div className="installer-form-group">
          <label>Your name</label>
          <select
            className="installer-select"
            value={installer}
            onChange={e => { setInstaller(e.target.value); setPin(''); setError(''); }}
          >
            {installerNames.length === 0 && <option value="">No installers configured</option>}
            {installerNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="installer-form-group">
          <label>PIN</label>
          <div className="installer-pin-dots">
            {[0,1,2,3,4,5].map(i => (
              <div
                key={i}
                className={`installer-pin-dot${i < pin.length ? ' filled' : ''}`}
              />
            ))}
          </div>
        </div>

        <div className="installer-numpad">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button key={d} className="installer-numpad-btn" onClick={() => handleDigit(d)}>{d}</button>
          ))}
          <button className="installer-numpad-btn installer-numpad-empty" disabled />
          <button className="installer-numpad-btn" onClick={() => handleDigit('0')}>0</button>
          <button className="installer-numpad-btn installer-numpad-delete" onClick={handleDelete}>⌫</button>
        </div>

        {error && <div className="installer-error">{error}</div>}

        <button
          className="installer-btn-primary"
          onClick={handleSubmit}
          disabled={loading || pin.length < 4 || !installer}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}

// ─── Route Screen ─────────────────────────────────────────────────────────────

function RouteScreen({
  session,
  assignments,
  loading,
  filter,
  onFilterChange,
  onSelect,
  onLogout,
  onRefresh,
}: {
  session: Session;
  assignments: InstallerAssignment[];
  loading: boolean;
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  onSelect: (a: InstallerAssignment) => void;
  onLogout: () => void;
  onRefresh: () => void;
}) {
  const todo = assignments.filter(a => a.status.toLowerCase() !== 'installed');
  const done = assignments.filter(a => a.status.toLowerCase() === 'installed');
  const visible = filter === 'todo' ? todo : filter === 'done' ? done : assignments;

  return (
    <div className="installer-screen">
      <div className="installer-header">
        <div className="installer-header-left">
          <span className="installer-header-logo">🌾</span>
          <span className="installer-header-name">{session.installer}</span>
        </div>
        <div className="installer-header-right">
          <button className="installer-icon-btn" onClick={onRefresh} title="Refresh" disabled={loading}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button className="installer-icon-btn" onClick={onLogout} title="Sign out">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="installer-filter-tabs">
        {(['todo', 'done', 'all'] as Filter[]).map(f => (
          <button
            key={f}
            className={`installer-filter-tab${filter === f ? ' active' : ''}`}
            onClick={() => onFilterChange(f)}
          >
            {f === 'todo' ? `Todo (${todo.length})` : f === 'done' ? `Done (${done.length})` : `All (${assignments.length})`}
          </button>
        ))}
      </div>

      <div className="installer-list">
        {loading && (
          <div className="installer-loading">Loading route…</div>
        )}
        {!loading && visible.length === 0 && (
          <div className="installer-empty">
            {filter === 'todo' ? 'All done for today!' : 'No assignments in this view.'}
          </div>
        )}
        {!loading && visible.map(a => (
          <button key={a.id} className="installer-card" onClick={() => onSelect(a)}>
            <div className="installer-card-top">
              <span className="installer-route-num">#{a.routeOrder !== 999 ? a.routeOrder : '—'}</span>
              <span className={`installer-status-dot${a.status.toLowerCase() === 'installed' ? ' done' : ''}`} />
            </div>
            <div className="installer-card-name">{a.fieldName}</div>
            <div className="installer-card-sub">{a.operation}</div>
            {(a.probeSerial || a.label) && (
              <div className="installer-card-probe">
                {a.probeSerial ? `SN: ${a.probeSerial}` : ''}
                {a.probeSerial && a.label ? ' · ' : ''}
                {a.label ? a.label : ''}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Field Detail Screen ──────────────────────────────────────────────────────

function FieldScreen({
  assignment: a,
  onBack,
  onStartInstall,
}: {
  assignment: InstallerAssignment;
  onBack: () => void;
  onStartInstall: () => void;
}) {
  const mapsUrl = a.lat && a.lng
    ? `https://maps.google.com/?q=${a.lat},${a.lng}`
    : null;

  const isDone = a.status.toLowerCase() === 'installed';

  return (
    <div className="installer-screen">
      <div className="installer-header">
        <button className="installer-back-btn" onClick={onBack}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Route
        </button>
      </div>

      <div className="installer-detail-content">
        <div className="installer-detail-header">
          <h2 className="installer-detail-title">{a.fieldName}</h2>
          <p className="installer-detail-op">{a.operation}</p>
          {isDone && <span className="installer-done-badge">✓ Installed</span>}
        </div>

        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="installer-directions-btn"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Get Directions
          </a>
        )}

        <div className="installer-detail-section">
          <div className="installer-detail-row">
            <span className="installer-detail-label">Probe</span>
            <span>{a.probeSerial ? `#${a.probeSerial}` : 'Not assigned'}{a.label ? ` · ${a.label}` : ''}</span>
          </div>
          <div className="installer-detail-row">
            <span className="installer-detail-label">Brand</span>
            <span>{a.probeBrand || '—'}</span>
          </div>
          <div className="installer-detail-row">
            <span className="installer-detail-label">Crop</span>
            <span>{a.crop || '—'}</span>
          </div>
          {a.rowDirection && (
            <div className="installer-detail-row">
              <span className="installer-detail-label">Row Direction</span>
              <span>{a.rowDirection}</span>
            </div>
          )}
          {a.antennaType && (
            <div className="installer-detail-row">
              <span className="installer-detail-label">Antenna</span>
              <span>{a.antennaType}</span>
            </div>
          )}
          {a.routeOrder !== 999 && (
            <div className="installer-detail-row">
              <span className="installer-detail-label">Route Order</span>
              <span>#{a.routeOrder}</span>
            </div>
          )}
        </div>

        {a.fieldNotes && (
          <div className="installer-detail-section">
            <div className="installer-detail-section-title">Access Notes</div>
            <p className="installer-access-notes">{a.fieldNotes}</p>
          </div>
        )}

        {!isDone && (
          <button className="installer-btn-primary installer-start-btn" onClick={onStartInstall}>
            Start Install
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Install Screen ───────────────────────────────────────────────────────────

function InstallScreen({
  assignment: a,
  installer,
  onBack,
  onSuccess,
}: {
  assignment: InstallerAssignment;
  installer: string;
  onBack: () => void;
  onSuccess: (data: SuccessData, assignmentId: number) => void;
}) {
  const [probeSerial, setProbeSerial] = useState(a.probeSerial);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [cropConfirmed, setCropConfirmed] = useState(false);
  const [rowDirConfirmed, setRowDirConfirmed] = useState(false);
  const [cropxId, setCropxId] = useState('');
  const [photoEnd, setPhotoEnd] = useState<File | null>(null);
  const [photoExtra, setPhotoExtra] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const photoEndRef = useRef<HTMLInputElement>(null);
  const photoExtraRef = useRef<HTMLInputElement>(null);

  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsError('GPS not available on this device');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setGpsError('Could not get location — check permissions');
        setGpsLoading(false);
      },
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
    setError('');
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('probeAssignmentId', String(a.id));
      fd.append('fieldSeasonId', String(a.fieldSeasonId));
      fd.append('installer', installer);
      fd.append('lat', String(gps.lat));
      fd.append('lng', String(gps.lng));
      fd.append('crop', a.crop);
      if (cropxId) fd.append('cropxTelemetryId', cropxId);
      if (notes) fd.append('installNotes', notes);
      fd.append('photoFieldEnd', photoEnd);
      if (photoExtra) fd.append('photoExtra', photoExtra);

      const res = await fetch('/api/install', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Submit failed — try again');
        return;
      }
      const flags = calcFlags(a.antennaType, a.sideDress);
      onSuccess({ fieldName: a.fieldName, probeSerial, flags }, a.id);
    } catch {
      setError('Network error — check connection and try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="installer-screen installer-install-screen">
      <div className="installer-header">
        <button className="installer-back-btn" onClick={onBack}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Field
        </button>
        <span className="installer-header-title">{a.fieldName}</span>
      </div>

      <div className="installer-form">

        {/* Probe Serial */}
        <div className="installer-form-section">
          <label className="installer-form-label">Probe Serial</label>
          <input
            className="installer-form-input"
            type="text"
            inputMode="numeric"
            value={probeSerial}
            onChange={e => setProbeSerial(e.target.value.replace(/\D/g, ''))}
            placeholder="Serial number"
          />
        </div>

        {/* GPS */}
        <div className="installer-form-section">
          <label className="installer-form-label">GPS Location <span className="installer-required">*</span></label>
          <button
            className={`installer-gps-btn${gps ? ' captured' : ''}`}
            onClick={captureGps}
            disabled={gpsLoading}
            type="button"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {gpsLoading ? 'Getting location…' : gps ? '✓ Location captured' : 'Capture Location'}
          </button>
          {gps && (
            <p className="installer-gps-coords">{gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}</p>
          )}
          {gpsError && <p className="installer-field-error">{gpsError}</p>}
        </div>

        {/* Crop */}
        <div className="installer-form-section">
          <label className="installer-form-label">Crop</label>
          <div className="installer-confirm-row">
            <span className="installer-confirm-value">{a.crop || '—'}</span>
            <button
              className={`installer-confirm-btn${cropConfirmed ? ' confirmed' : ''}`}
              onClick={() => setCropConfirmed(v => !v)}
              type="button"
            >
              {cropConfirmed ? '✓ Confirmed' : 'Confirm'}
            </button>
          </div>
        </div>

        {/* Row Direction */}
        {a.rowDirection && (
          <div className="installer-form-section">
            <label className="installer-form-label">Row Direction</label>
            <div className="installer-confirm-row">
              <span className="installer-confirm-value">{a.rowDirection}</span>
              <button
                className={`installer-confirm-btn${rowDirConfirmed ? ' confirmed' : ''}`}
                onClick={() => setRowDirConfirmed(v => !v)}
                type="button"
              >
                {rowDirConfirmed ? '✓ Confirmed' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* CropX Telemetry ID */}
        <div className="installer-form-section">
          <label className="installer-form-label">CropX Telemetry ID</label>
          <input
            className="installer-form-input"
            type="text"
            value={cropxId}
            onChange={e => setCropxId(e.target.value)}
            placeholder="Optional"
          />
        </div>

        {/* Photo — Field End */}
        <div className="installer-form-section">
          <label className="installer-form-label">Photo — Field End <span className="installer-required">*</span></label>
          <input
            ref={photoEndRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => handlePhoto('end', e.target.files?.[0] ?? null)}
          />
          <button
            className={`installer-photo-btn${photoEnd ? ' captured' : ''}`}
            onClick={() => photoEndRef.current?.click()}
            type="button"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {photoEnd ? `✓ ${photoEnd.name}` : 'Take Photo'}
          </button>
        </div>

        {/* Photo — Extra */}
        <div className="installer-form-section">
          <label className="installer-form-label">Photo — Extra (optional)</label>
          <input
            ref={photoExtraRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => handlePhoto('extra', e.target.files?.[0] ?? null)}
          />
          <button
            className={`installer-photo-btn${photoExtra ? ' captured' : ''}`}
            onClick={() => photoExtraRef.current?.click()}
            type="button"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {photoExtra ? `✓ ${photoExtra.name}` : 'Add Photo'}
          </button>
        </div>

        {/* Install Notes */}
        <div className="installer-form-section">
          <label className="installer-form-label">Install Notes</label>
          <textarea
            className="installer-form-textarea"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes about this install…"
            rows={3}
          />
        </div>

        {error && <div className="installer-error">{error}</div>}

        <button
          className="installer-btn-primary installer-submit-btn"
          onClick={handleSubmit}
          disabled={submitting || !gps || !photoEnd}
        >
          {submitting ? 'Submitting…' : 'Submit Install'}
        </button>
      </div>
    </div>
  );
}

// ─── Success Screen ───────────────────────────────────────────────────────────

function SuccessScreen({
  data,
  onBack,
}: {
  data: SuccessData;
  onBack: () => void;
}) {
  return (
    <div className="installer-screen installer-success-screen">
      <div className="installer-success-icon">✅</div>
      <h2 className="installer-success-title">Install Recorded!</h2>
      <p className="installer-success-field">{data.fieldName}</p>
      {data.probeSerial && (
        <p className="installer-success-probe">Probe #{data.probeSerial}</p>
      )}

      <div className="installer-flags-card">
        <div className="installer-flags-title">Flag Stakes Needed</div>
        <div className="installer-flags-row">
          <span className="installer-flag installer-flag-pink" />
          <span>{data.flags.pink} pink</span>
        </div>
        <div className="installer-flags-row">
          <span className="installer-flag installer-flag-blue" />
          <span>{data.flags.blue} blue</span>
        </div>
        <div className="installer-flags-row">
          <span className="installer-flag installer-flag-white" />
          <span>{data.flags.white} white</span>
        </div>
      </div>

      <button className="installer-btn-primary installer-back-route-btn" onClick={onBack}>
        ← Back to Route
      </button>
    </div>
  );
}
