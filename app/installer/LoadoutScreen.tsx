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

function supplyColor(type: string): { bg: string; fg: string } {
  const t = type.toLowerCase();
  if (t.includes('sentek'))  return { bg: 'rgba(196,130,30,0.11)',  fg: '#9A6810' }; // amber
  if (t.includes('cropx'))   return { bg: 'rgba(59,120,196,0.11)',  fg: '#2E6BAF' }; // blue
  if (t.includes('aquaspy')) return { bg: 'rgba(140,64,180,0.10)',  fg: '#7A3AAF' }; // purple
  return { bg: 'var(--sage-wash)', fg: 'var(--field-green)' };                      // default green
}

type LoadedMap = Record<string, boolean>;
const LOADED_KEY = 'af-loaded-supabase-v1';

export default function LoadoutScreen({ session, assignments }: { session: Session; assignments: InstallerAssignment[] }) {
  const todo = assignments.filter(a => a.status.toLowerCase() !== 'installed');

  // Persisted "loaded" state per probe serial
  const [loaded, setLoaded] = useState<LoadedMap>(() => {
    try { return JSON.parse(localStorage.getItem(LOADED_KEY) || '{}'); } catch { return {}; }
  });
  // Separate sort-order state — trails loaded by 600ms so the card fades before moving
  const [sortLoaded, setSortLoaded] = useState<LoadedMap>(loaded);
  const toggleLoaded = (serial: string) => {
    setLoaded(prev => {
      const next = { ...prev, [serial]: !prev[serial] };
      localStorage.setItem(LOADED_KEY, JSON.stringify(next));
      setTimeout(() => setSortLoaded(next), 1000);
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
        <button
          onClick={() => window.print()}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: 'var(--stone-500)', display: 'flex', alignItems: 'center',
          }}
          title="Print loadout"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
        </button>
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
              const aL = sortLoaded[a.probeSerial] ? 1 : 0;
              const bL = sortLoaded[b.probeSerial] ? 1 : 0;
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
                      <div style={{
                        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 600,
                        color: isLoaded ? 'var(--stone-400)' : 'var(--stone-600)',
                        marginTop: 3, lineHeight: 1.3,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {s.fieldName}{s.operation ? ` · ${s.operation}` : ''}
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
