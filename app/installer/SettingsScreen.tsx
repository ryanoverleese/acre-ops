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

export default function SettingsScreen({ session, onBack, onAdHocInstall, hiddenTabs, onHiddenTabsChange, workflowMode, onWorkflowModeChange }: {
  session: Session;
  onBack: () => void;
  onAdHocInstall: (a: InstallerAssignment) => void;
  hiddenTabs: Set<HideableTab>;
  onHiddenTabsChange: (tabs: Set<HideableTab>) => void;
  workflowMode: WorkflowMode;
  onWorkflowModeChange: (mode: WorkflowMode) => void;
}) {
  const [mapProvider, setMapProvider] = useState<MapProvider>('google');

  const toggleTab = (tab: HideableTab) => {
    const next = new Set(hiddenTabs);
    if (next.has(tab)) next.delete(tab); else next.add(tab);
    onHiddenTabsChange(next);
  };
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [adHocLoading, setAdHocLoading] = useState(false);
  const [adHocAll, setAdHocAll] = useState<InstallerAssignment[]>([]);
  const [adHocQuery, setAdHocQuery] = useState('');

  useEffect(() => {
    setMapProvider(getMapProvider());
  }, []);

  useEffect(() => {
    localStorage.setItem(MAP_PROVIDER_KEY, mapProvider);
  }, [mapProvider]);

  const openAdHocPicker = async () => {
    setShowAdHoc(true);
    setAdHocLoading(true);
    try {
      const res = await fetch(`/api/installer/assignments?installer=${encodeURIComponent(session.installer)}&season=${session.season}&all=1&fresh=1`);
      const data = await res.json();
      setAdHocAll(data.assignments ?? []);
    } catch { setAdHocAll([]); }
    finally { setAdHocLoading(false); }
  };

  const adHocFiltered = adHocAll.filter(a => {
    const q = adHocQuery.toLowerCase();
    return !q || a.fieldName.toLowerCase().includes(q) || a.operation.toLowerCase().includes(q);
  });

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
        {/* Workflow */}
        <div style={{ marginBottom: 22 }}>
          <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>Workflow</div>
          <div style={{
            background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--r-lg)', overflow: 'hidden',
          }}>
            {[
              { id: 'install' as const, label: 'Install', sub: 'Put probes in the ground' },
              { id: 'remove' as const, label: 'Remove', sub: 'Pull assigned probes' },
            ].map((opt, i, arr) => (
              <button
                key={opt.id}
                onClick={() => onWorkflowModeChange(opt.id)}
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
                  border: workflowMode === opt.id ? '7px solid var(--field-green)' : '2px solid var(--stone-300)',
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
            Remove mode shows your pull stops on the map.
          </div>
        </div>

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

        {/* Bottom bar tabs */}
        <div style={{ marginBottom: 22 }}>
          <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>Bottom bar</div>
          <div style={{
            background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
            borderRadius: 'var(--r-lg)', overflow: 'hidden',
          }}>
            {([
              { id: 'loadout' as const, label: 'Loadout', sub: 'Flag & supply counts for the day' },
              ...(session.installer.toLowerCase() === 'ryan'
                ? [{ id: 'repairs' as const, label: 'Repairs', sub: 'Repair tickets & close-outs' }]
                : []),
            ]).map((tab, i, arr) => {
              const shown = !hiddenTabs.has(tab.id);
              return (
                <div
                  key={tab.id}
                  style={{
                    padding: '14px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: i < arr.length - 1 ? '1px solid var(--border-1)' : 'none',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>
                      {tab.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>
                      {tab.sub}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleTab(tab.id)}
                    aria-pressed={shown}
                    aria-label={`${shown ? 'Hide' : 'Show'} ${tab.label} tab`}
                    style={{
                      width: 52, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
                      background: shown ? 'var(--field-green)' : '#d1d5db',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 4, left: shown ? 26 : 4,
                      width: 22, height: 22, borderRadius: 11,
                      background: '#fff', transition: 'left 0.2s',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 8, padding: '0 4px', lineHeight: 1.4 }}>
            Turn a tab off to hide it from the bottom bar on this device.
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

        {/* Ad-hoc install */}
        <div style={{ marginBottom: 22 }}>
          <div className="af-eyebrow" style={{ padding: '0 4px 8px' }}>Unscheduled install</div>
          <button
            onClick={openAdHocPicker}
            style={{
              width: '100%', padding: '14px',
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--bone-raised)', border: '1px solid var(--border-1)',
              borderRadius: 'var(--r-lg)', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'var(--sage-wash)', color: 'var(--field-green)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>
                Install a different field
              </div>
              <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>
                Search all ready-to-install assignments
              </div>
            </div>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* App info */}
        <div style={{
          padding: '14px', borderTop: '1px solid var(--border-1)',
          textAlign: 'center', color: 'var(--stone-500)', fontSize: 11,
          lineHeight: 1.6, marginTop: 8,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>ACRE FIELD · v1.0 · {process.env.NEXT_PUBLIC_GIT_SHA}</div>
          <div>Acre Insights · {session.season} season</div>
        </div>
      </div>

      {/* Ad-hoc field picker sheet */}
      {showAdHoc && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(10,10,10,0.5)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }} onClick={() => setShowAdHoc(false)}>
          <div
            style={{
              background: 'var(--bone)', borderRadius: '16px 16px 0 0',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Sheet header */}
            <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border-1)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>
                  Install a Different Field
                </div>
                <button
                  onClick={() => setShowAdHoc(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--stone-500)', padding: 4 }}
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <input
                className="af-input"
                placeholder="Search field or operation…"
                value={adHocQuery}
                onChange={e => setAdHocQuery(e.target.value)}
              />
            </div>

            {/* Sheet list */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0 32px' }}>
              {adHocLoading && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--stone-500)', fontSize: 13 }}>
                  Loading fields…
                </div>
              )}
              {!adHocLoading && adHocFiltered.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--stone-500)', fontSize: 13 }}>
                  No fields found.
                </div>
              )}
              {!adHocLoading && adHocFiltered.map((a, i, arr) => (
                <button
                  key={a.id}
                  onClick={() => { setShowAdHoc(false); onAdHocInstall(a); }}
                  style={{
                    width: '100%', padding: '13px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'none', border: 'none',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--border-1)' : 'none',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                      {a.fieldName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>
                      {a.operation}{a.crop ? ` · ${a.crop}` : ''}{a.plannedInstaller ? ` · ${a.plannedInstaller}` : ''}
                    </div>
                    {(a.probeSerial || a.probeRack) && (
                      <div style={{ fontSize: 11, color: 'var(--field-green)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                        {a.probeSerial ? `#${a.probeSerial}` : ''}
                        {a.probeSerial && a.probeRack ? ' · ' : ''}
                        {a.probeRack ? `Rack ${a.probeRack}${a.probeRackSlot ? ` · Slot ${a.probeRackSlot}` : ''}` : ''}
                      </div>
                    )}
                  </div>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
