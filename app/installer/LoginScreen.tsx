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

export default function LoginScreen({ installerNames, onLogin }: { installerNames: string[]; onLogin: (s: Session) => void }) {
  const [installer, setInstaller] = useState(installerNames[0] ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear();
  const pinInputRef = useRef<HTMLInputElement>(null);

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
      const data = await res.json();
      if (res.ok) {
        onLogin({ installer, installerId: data.id, season: currentYear });
      } else {
        setError(data.error || 'Incorrect PIN');
        setPin('');
      }
    } catch { setError('Connection error — try again'); }
    finally { setLoading(false); }
  };

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
                  onClick={() => { setInstaller(n); setPin(''); setError(''); setTimeout(() => pinInputRef.current?.focus(), 50); }}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <select
              className="af-select"
              value={installer}
              onChange={e => { setInstaller(e.target.value); setPin(''); setError(''); setTimeout(() => pinInputRef.current?.focus(), 50); }}
            >
              {installerNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </div>

        {/* PIN dots — tap to focus hidden input */}
        <div style={{ textAlign: 'center' }} onClick={() => pinInputRef.current?.focus()}>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', fontFamily: 'var(--font-display)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--stone-500)', marginBottom: 14 }}>
            PIN
          </div>
          <div className="af-pin-dots">
            {[0,1,2,3].map(i => (
              <div key={i} className={`af-pin-dot${i < pin.length ? ' filled' : ''}`} />
            ))}
          </div>
          <input
            ref={pinInputRef}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
          />
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
