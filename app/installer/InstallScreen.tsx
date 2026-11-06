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

export default function InstallScreen({ assignment: a, installer, onBack, onSuccess }: {
  assignment: InstallerAssignment; installer: string;
  onBack: () => void; onSuccess: (data: SuccessData, assignmentId: number) => void;
}) {
  const [probeSerial, setProbeSerial] = useState(a.probeSerial);
  const [serialConfirmed, setSerialConfirmed] = useState<null | 'confirmed' | 'override'>(null);
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
  const [antennaConfirmed, setAntennaConfirmed] = useState<null | true | false>(null);
  const [antennaChanged, setAntennaChanged] = useState('');
  const [rowDir, setRowDir] = useState<string | null>(null);
  const [pickupAccess, setPickupAccess] = useState<boolean | null>(null);
  const [cropxId, setCropxId] = useState('');
  const [photoEnd, setPhotoEnd] = useState<File | null>(null);
  const [photoExtra, setPhotoExtra] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [error, setError] = useState('');
  const submitProgressRef = useRef(0);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [repairProblem, setRepairProblem] = useState('');
  const [submittingRepair, setSubmittingRepair] = useState(false);
  const photoEndRef = useRef<HTMLInputElement>(null);
  const photoExtraRef = useRef<HTMLInputElement>(null);

  const serialDone = serialConfirmed === 'confirmed' || (serialConfirmed === 'override' && !!probeSerial);
  const doneMap = {
    serial: serialDone,
    gps: !!gps,
    crop: a.crop ? cropConfirmed !== null : !!cropChanged,
    antenna: a.antennaType ? (antennaConfirmed === true || (antennaConfirmed === false && !!antennaChanged)) : !!antennaChanged,
    photoEnd: !!photoEnd,
    rowDir: !!rowDir,
  };
  const requiredKeys = ['serial', 'gps', 'crop', 'antenna', 'rowDir'] as const;
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
    const compressed = await compressImage(file);
    if (field === 'end') setPhotoEnd(compressed);
    else setPhotoExtra(compressed);
  };

  const handleSubmit = async () => {
    if (!gps) { setError('GPS location is required'); return; }
    setError(''); setSubmitting(true); setSubmitProgress(0); submitProgressRef.current = 0;

    // Trickle progress as fallback; real upload progress (XHR) jumps it forward.
    // Caps at 92 while waiting on the server response.
    const interval = setInterval(() => {
      const cur = submitProgressRef.current;
      const next = Math.min(cur + (cur < 85 ? 0.4 : 0.15), 92);
      submitProgressRef.current = next;
      setSubmitProgress(next);
    }, 120);

    try {
      const fd = new FormData();
      fd.append('probeAssignmentId', String(a.id));
      fd.append('fieldSeasonId', String(a.fieldSeasonId));
      fd.append('installer', installer);
      fd.append('lat', String(gps.lat));
      fd.append('lng', String(gps.lng));
      fd.append('crop', !a.crop ? cropChanged : cropConfirmed === false && cropChanged ? cropChanged : a.crop);
      fd.append('antennaType', !a.antennaType ? antennaChanged : antennaConfirmed === false && antennaChanged ? antennaChanged : a.antennaType);
      if (rowDir) fd.append('rowDirection', rowDir);
      if (pickupAccess !== null) fd.append('pickupAccess', String(pickupAccess));
      if (cropxId) fd.append('cropxTelemetryId', cropxId);
      if (notes) fd.append('installNotes', notes);
      if (photoEnd) fd.append('photoFieldEnd', photoEnd);
      if (photoExtra) fd.append('photoExtra', photoExtra);

      // XHR instead of fetch: real upload progress + a timeout so a stalled
      // connection can't hang the submit forever. Safe to retry — the API
      // is idempotent (already-installed assignments return success).
      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/install');
        xhr.timeout = 75000;
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          // Upload drives 0→85; the trickle interval covers server processing 85→92
          const pct = Math.min(85, (e.loaded / e.total) * 85);
          if (pct > submitProgressRef.current) {
            submitProgressRef.current = pct;
            setSubmitProgress(pct);
          }
        };
        xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
        xhr.onerror = () => reject(new Error('Connection failed — check signal and try again'));
        xhr.ontimeout = () => reject(new Error('Timed out on weak signal — it is safe to hit Log install again'));
        xhr.onabort = () => reject(new Error('Upload cancelled — try again'));
        xhr.send(fd);
      });
      clearInterval(interval);
      if (res.status < 200 || res.status >= 300) {
        let msg = `Submit failed (${res.status}) — try again`;
        try { const d = JSON.parse(res.body); msg = d.error || msg; } catch { /* non-JSON error body */ }
        setError(msg); setSubmitting(false); return;
      }
      submitProgressRef.current = 100; setSubmitProgress(100);
      await new Promise(r => setTimeout(r, 500));
      const flags = calcFlags(a.antennaType, a.sideDress);
      onSuccess({ fieldName: a.fieldName, probeSerial, flags }, a.id);
    } catch (err) {
      clearInterval(interval);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Network error — ${msg}`);
      setSubmitting(false);
    }
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

      <div className="af-body" style={{ background: '#FFFFFF' }}>
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
        <InstallSection num={1} title="Probe serial" done={serialDone}>
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
          {serialConfirmed === null && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setSerialConfirmed('confirmed')}
                style={{
                  flex: 1, padding: '11px 0',
                  background: 'transparent', color: 'var(--field-green)',
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
                  border: '1.5px solid var(--field-green)', borderRadius: 'var(--r-md)', cursor: 'pointer',
                }}
              >
                ✓ Confirm
              </button>
              <button
                type="button"
                onClick={() => setSerialConfirmed('override')}
                style={{
                  flex: 1, padding: '11px 0',
                  background: 'transparent', color: 'var(--field-green)',
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
                  border: '1.5px solid var(--field-green)', borderRadius: 'var(--r-md)', cursor: 'pointer',
                }}
              >
                Change
              </button>
            </div>
          )}
          {serialConfirmed === 'confirmed' && (
            <button
              type="button"
              onClick={() => setSerialConfirmed(null)}
              style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--stone-500)', fontSize: 12, cursor: 'pointer', padding: 0 }}
            >
              Undo
            </button>
          )}
          {serialConfirmed === 'override' && (
            <div className="af-field" style={{ marginTop: 10 }}>
              <label>Enter correct serial number</label>
              <input
                className="af-input af-mono"
                type="text"
                inputMode="numeric"
                value={probeSerial}
                onChange={e => setProbeSerial(e.target.value.replace(/\D/g, ''))}
                placeholder="Serial number"
                autoFocus
              />
            </div>
          )}
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
                  ±{(livePos.acc * 3.28084).toFixed(0)} ft
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
        <InstallSection num={3} title="Crop confirmation" done={doneMap.crop} hint={a.crop ? `Planned: ${a.crop}` : 'No planned crop'}>
          {a.crop ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  aria-pressed={cropConfirmed === true ? 'true' : 'false'}
                  onClick={() => { setCropConfirmed(true); setCropChanged(''); }}
                  className="af-btn af-btn--lg"
                  style={{
                    background: cropConfirmed === true ? 'var(--field-green)' : 'var(--bone-raised)',
                    color: cropConfirmed === true ? 'var(--bone)' : 'var(--ink)',
                    border: `1.5px solid ${cropConfirmed === true ? 'var(--field-green)' : 'var(--stone-300)'}`,
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
                    border: `1.5px solid ${cropConfirmed === false ? 'var(--dry)' : 'var(--stone-300)'}`,
                  }}
                >
                  Changed
                </button>
              </div>
              {cropConfirmed === false && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {['Corn', 'Soybeans', 'Seed Corn', 'Popcorn', 'Wheat', 'Sorghum', 'Other'].map(opt => (
                    <button
                      key={opt}
                      className="af-btn af-btn--lg"
                      aria-pressed={cropChanged === opt ? 'true' : 'false'}
                      onClick={() => setCropChanged(opt)}
                      style={{
                        background: cropChanged === opt ? 'var(--field-green)' : 'var(--bone-raised)',
                        color: cropChanged === opt ? 'var(--bone)' : 'var(--ink)',
                        border: `1.5px solid ${cropChanged === opt ? 'var(--field-green)' : 'var(--stone-300)'}`,
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['Corn', 'Soybeans', 'Seed Corn', 'Popcorn', 'Wheat', 'Sorghum', 'Other'].map(opt => (
                <button
                  key={opt}
                  className="af-btn af-btn--lg"
                  aria-pressed={cropChanged === opt ? 'true' : 'false'}
                  onClick={() => setCropChanged(opt)}
                  style={{
                    background: cropChanged === opt ? 'var(--field-green)' : 'var(--bone-raised)',
                    color: cropChanged === opt ? 'var(--bone)' : 'var(--ink)',
                    border: `1.5px solid ${cropChanged === opt ? 'var(--field-green)' : 'var(--stone-300)'}`,
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </InstallSection>

        {/* Section 4: Antenna confirmation */}
        <InstallSection num={4} title="Antenna confirmation" done={doneMap.antenna} hint={a.antennaType ? `Planned: ${a.antennaType}` : 'No planned antenna'}>
          {a.antennaType ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  aria-pressed={antennaConfirmed === true ? 'true' : 'false'}
                  onClick={() => { setAntennaConfirmed(true); setAntennaChanged(''); }}
                  className="af-btn af-btn--lg"
                  style={{
                    background: antennaConfirmed === true ? 'var(--field-green)' : 'var(--bone-raised)',
                    color: antennaConfirmed === true ? 'var(--bone)' : 'var(--ink)',
                    border: `1.5px solid ${antennaConfirmed === true ? 'var(--field-green)' : 'var(--stone-300)'}`,
                  }}
                >
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {a.antennaType}
                </button>
                <button
                  aria-pressed={antennaConfirmed === false ? 'true' : 'false'}
                  onClick={() => setAntennaConfirmed(false)}
                  className="af-btn af-btn--lg"
                  style={{
                    background: antennaConfirmed === false ? 'var(--dry)' : 'var(--bone-raised)',
                    color: antennaConfirmed === false ? 'white' : 'var(--ink)',
                    border: `1.5px solid ${antennaConfirmed === false ? 'var(--dry)' : 'var(--stone-300)'}`,
                  }}
                >
                  Changed
                </button>
              </div>
              {antennaConfirmed === false && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {ANTENNA_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      className="af-btn af-btn--lg"
                      aria-pressed={antennaChanged === opt ? 'true' : 'false'}
                      onClick={() => setAntennaChanged(opt)}
                      style={{
                        background: antennaChanged === opt ? 'var(--field-green)' : 'var(--bone-raised)',
                        color: antennaChanged === opt ? 'var(--bone)' : 'var(--ink)',
                        border: `1.5px solid ${antennaChanged === opt ? 'var(--field-green)' : 'var(--stone-300)'}`,
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ANTENNA_OPTIONS.map(opt => (
                <button
                  key={opt}
                  className="af-btn af-btn--lg"
                  aria-pressed={antennaChanged === opt ? 'true' : 'false'}
                  onClick={() => setAntennaChanged(opt)}
                  style={{
                    background: antennaChanged === opt ? 'var(--field-green)' : 'var(--bone-raised)',
                    color: antennaChanged === opt ? 'var(--bone)' : 'var(--ink)',
                    border: `1.5px solid ${antennaChanged === opt ? 'var(--field-green)' : 'var(--stone-300)'}`,
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </InstallSection>

        {/* Section 5: Row direction */}
        <InstallSection num={5} title="Row direction" done={doneMap.rowDir} hint="Planting rows run…">
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
                  border: `1.5px solid ${rowDir === dir ? 'var(--field-green)' : 'var(--stone-300)'}`,
                }}
              >
                {dir}
              </button>
            ))}
          </div>
        </InstallSection>

        {/* Section 6: Access */}
        <InstallSection num={6} title="Pickup Access" done={pickupAccess !== null} hint="Is this probe's border flag easily accessed with a pickup?">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([true, false] as const).map(val => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setPickupAccess(val)}
                className="af-btn af-btn--lg"
                style={{
                  background: pickupAccess === val ? 'var(--field-green)' : 'var(--bone-raised)',
                  color: pickupAccess === val ? 'var(--bone)' : 'var(--ink)',
                  border: `1.5px solid ${pickupAccess === val ? 'var(--field-green)' : 'var(--stone-300)'}`,
                }}
              >
                {val ? 'Yes' : 'Needs ATV'}
              </button>
            ))}
          </div>
        </InstallSection>

        {/* Section 7: Photos */}
        <InstallSection num={7} title="Photos" done={doneMap.photoEnd} hint="Field end shot + optional extra.">
          <div>
            <input ref={photoEndRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handlePhoto('end', e.target.files?.[0] ?? null)} />
            <input ref={photoExtraRef} type="file" accept="image/*" style={{ display: 'none' }}
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
                    Field end
                    <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 9, color: '#B23A2A', fontWeight: 700 }}>*</span>
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
        <InstallSection num={8} title="CropX telemetry ID" done={!!cropxId} hint="Only needed for CropX White Gateways.">
          <input
            className="af-input af-mono"
            placeholder="000000"
            inputMode="numeric"
            value={cropxId}
            onChange={e => setCropxId(e.target.value.replace(/\D/g, ''))}
          />
        </InstallSection>

        {/* Section 7: Install notes */}
        <InstallSection num={9} title="Install notes" done={!!notes} hint="Optional — anything unusual?">
          <textarea
            className="af-textarea"
            placeholder="Residue heavy, soil dry on top, grower mentioned replant in west end…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </InstallSection>

        {error && (
          <div style={{ padding: '0 14px 8px' }}>
            <div className="af-error-msg">{error}</div>
            {error.includes('Network error') && (
              <button
                onClick={() => { setError(''); handleSubmit(); }}
                style={{
                  marginTop: 8, width: '100%', padding: '10px',
                  background: 'var(--field-green)', color: 'var(--bone)',
                  border: 'none', borderRadius: 'var(--r-sm)',
                  fontFamily: 'var(--font-display)', fontWeight: 700,
                  fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* Submit button — bottom of scroll */}
        <div style={{ padding: '16px 14px calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => setShowRepairModal(true)}
            disabled={!canSubmit || submitting}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: '1.5px solid var(--dry)',
              background: 'transparent', color: 'var(--dry)', fontSize: 15, fontWeight: 700,
              cursor: canSubmit ? 'pointer' : 'default', opacity: canSubmit ? 1 : 0.45,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Mark as installed, but needs repaired
          </button>
          <button
            className="af-btn af-btn--primary af-btn--xl af-btn--block"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            style={{ opacity: canSubmit ? 1 : 0.72, minHeight: 88, fontSize: 22 }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Submit install
          </button>
        </div>

        {/* Needs Repair Modal */}
        {showRepairModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-end',
          }} onClick={() => setShowRepairModal(false)}>
            <div style={{
              width: '100%', background: 'var(--bone)', borderRadius: '20px 20px 0 0',
              padding: '24px 20px calc(32px + env(safe-area-inset-bottom, 0px))',
            }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" fill="none" stroke="#92400E" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Needs Repair</div>
                  <div style={{ fontSize: 12, color: 'var(--stone-500)' }}>{a.fieldName}</div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: 'var(--stone-500)', margin: '12px 0 6px' }}>
                What's wrong with this probe? Describe the issue so the office can follow up.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {['Antenna damaged', 'Probe not reading', 'Wet connector', 'Physical damage', 'Wrong location', 'Signal issues'].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setRepairProblem(p => p ? `${p}, ${tag}` : tag)}
                    style={{
                      padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: '1px solid var(--stone-300)', background: 'var(--bone-raised)',
                      color: 'var(--ink)', cursor: 'pointer',
                    }}
                  >{tag}</button>
                ))}
              </div>
              <textarea
                value={repairProblem}
                onChange={e => setRepairProblem(e.target.value)}
                placeholder="Describe the problem…"
                rows={3}
                style={{
                  width: '100%', borderRadius: 10, border: '1.5px solid var(--stone-300)',
                  padding: '10px 12px', fontSize: 14, background: 'var(--bone-raised)',
                  color: 'var(--ink)', resize: 'none', boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                disabled={!repairProblem.trim() || submittingRepair}
                onClick={async () => {
                  if (!repairProblem.trim()) return;
                  setSubmittingRepair(true);
                  try {
                    // Submit the normal install first
                    await handleSubmit();
                    // Then log the repair
                    await fetch('/api/repairs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        field_season: a.fieldSeasonId,
                        probe_assignment: a.id,
                        problem: repairProblem.trim(),
                        reported_at: new Date().toISOString().slice(0, 10),
                      }),
                    });
                  } finally {
                    setSubmittingRepair(false);
                    setShowRepairModal(false);
                  }
                }}
                style={{
                  marginTop: 14, width: '100%', padding: 14, borderRadius: 12,
                  background: repairProblem.trim() ? '#92400E' : 'var(--stone-300)',
                  color: '#fff', fontSize: 15, fontWeight: 700, border: 'none',
                  cursor: repairProblem.trim() ? 'pointer' : 'default',
                  opacity: submittingRepair ? 0.6 : 1,
                }}
              >
                {submittingRepair ? 'Submitting…' : 'Submit install + log repair'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Submitting overlay */}
      {submitting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'var(--field-green)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 36px', gap: 32,
        }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(246,242,234,0.5)' }}>
            {submitProgress < 100 ? 'Logging install' : 'Complete'}
          </div>
          {/* Text fill paragraph */}
          <div style={{ position: 'relative', lineHeight: 1.55, fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', userSelect: 'none' }}>
            {/* Background (dim) layer */}
            <span style={{ color: 'rgba(246,242,234,0.18)' }}>
              Saving GPS coordinates, probe assignment, crop confirmation, photos, and install notes to Acre Insights.
            </span>
            {/* Foreground (fill) layer — clips to progress width */}
            <span style={{
              position: 'absolute', inset: 0,
              color: 'var(--bone)',
              clipPath: `inset(0 ${100 - submitProgress}% 0 0)`,
              transition: 'clip-path 0.15s linear',
              whiteSpace: 'pre-wrap',
            }}>
              Saving GPS coordinates, probe assignment, crop confirmation, photos, and install notes to Acre Insights.
            </span>
          </div>
          {/* Numeric % */}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(246,242,234,0.45)', letterSpacing: '0.12em' }}>
            {Math.round(submitProgress)}%
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fireworks ────────────────────────────────────────────────────────────────

export function Fireworks({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    type Particle = { x: number; y: number; vx: number; vy: number; alpha: number; color: string; r: number };
    const particles: Particle[] = [];
    const COLORS = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98FB98', '#F0E68C', '#FF69B4'];

    function burst(x: number, y: number) {
      const count = 120 + Math.floor(Math.random() * 80);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const speed = 4 + Math.random() * 12;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          r: 4 + Math.random() * 6,
        });
      }
    }

    // Fire 8 bursts staggered across the screen
    const launches = [
      [0.2, 0.25], [0.5, 0.15], [0.8, 0.25],
      [0.35, 0.45], [0.65, 0.4], [0.15, 0.5],
      [0.5, 0.35], [0.85, 0.5], [0.1, 0.3],
      [0.9, 0.35], [0.3, 0.2], [0.7, 0.2],
      [0.45, 0.55], [0.6, 0.3], [0.25, 0.6],
      [0.75, 0.6],
    ];
    launches.forEach(([rx, ry], i) => {
      setTimeout(() => burst(canvas.width * rx, canvas.height * ry), i * 120);
    });

    function tick() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.alpha -= 0.009;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        ctx!.globalAlpha = p.alpha;
        ctx!.fillStyle = p.color;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      if (particles.length > 0) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: 'none', width: '100%', height: '100%',
      }}
    />
  );
}

export function InstallSection({ num, title, done, hint, children }: {
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

export function SuccessScreen({ data, onBack }: { data: SuccessData; onBack: () => void }) {
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
