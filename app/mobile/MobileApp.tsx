'use client';

import React, { useState, useMemo, useCallback } from 'react';
import type {
  MobileData, MobileOperation, MobileField, MobileProbe,
  MobileRepair, MobileOrder, MobileInvoice, MobileWaterRec,
} from './page';

// ── Types ────────────────────────────────────────────────────────

type ScreenName =
  | 'dashboard' | 'fields' | 'probes' | 'repairs' | 'more'
  | 'field-detail' | 'probe-detail' | 'op-detail'
  | 'crm' | 'orders' | 'order-detail' | 'water' | 'billing'
  | 'invoice-detail' | 'season';

interface StackEntry { screen: ScreenName; params: Record<string, unknown> }

// ── Helpers ──────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (!n) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtMoneyFull(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDate(d: string | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function fmtDateShort(d: string | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
}

function fmtCoord(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'W'}`;
}

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function daysAgo(d: string | undefined): string {
  if (!d) return '—';
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86400000);
  return `${days}d`;
}

// ── Icons ─────────────────────────────────────────────────────────

const I = {
  dashboard: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x={3} y={3} width={7} height={7}/><rect x={14} y={3} width={7} height={7}/><rect x={14} y={14} width={7} height={7}/><rect x={3} y={14} width={7} height={7}/></svg>,
  fields: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
  probes: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x={9} y={3} width={6} height={6}/><path d="M12 9v12M8 18h8"/><circle cx={12} cy={21} r={1} fill="currentColor"/></svg>,
  repairs: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  more: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={5} r={1} fill="currentColor"/><circle cx={12} cy={12} r={1} fill="currentColor"/><circle cx={12} cy={19} r={1} fill="currentColor"/></svg>,
  chevron: () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>,
  chevDown: () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  back: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>,
  plus: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8}/><path d="M21 21l-4.35-4.35"/></svg>,
  edit: () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  radio: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={2}/><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14"/></svg>,
  drop: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>,
  dollar: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1={12} y1={1} x2={12} y2={23}/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  users: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx={9} cy={7} r={4}/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  cal: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x={3} y={4} width={18} height={18} rx={2} ry={2}/><line x1={16} y1={2} x2={16} y2={6}/><line x1={8} y1={2} x2={8} y2={6}/><line x1={3} y1={10} x2={21} y2={10}/></svg>,
  send: () => <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1={22} y1={2} x2={11} y2={13}/><polygon points="22,2 15,22 11,13 2,9"/></svg>,
  check: () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>,
  x: () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/></svg>,
  cog: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  cart: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx={9} cy={21} r={1}/><circle cx={20} cy={21} r={1}/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>,
  map: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21"/><line x1={9} y1={3} x2={9} y2={18}/><line x1={15} y1={6} x2={15} y2={21}/></svg>,
  bell: () => <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
};

// ── Shared UI components ──────────────────────────────────────────

function TabBar({ active, nav }: { active: ScreenName; nav: (s: ScreenName) => void }) {
  const tabs: Array<{ key: ScreenName; label: string; icon: () => React.ReactElement }> = [
    { key: 'dashboard', label: 'Dashboard', icon: I.dashboard },
    { key: 'fields', label: 'Fields', icon: I.fields },
    { key: 'probes', label: 'Probes', icon: I.probes },
    { key: 'repairs', label: 'Repairs', icon: I.repairs },
    { key: 'more', label: 'More', icon: I.more },
  ];
  return (
    <div className="ms-tabbar">
      {tabs.map(t => (
        <button key={t.key} className={`ms-tab ${active === t.key ? 'active' : ''}`} onClick={() => nav(t.key)}>
          <t.icon />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function TopBar({ title, eyebrow, onBack, right }: { title: string; eyebrow?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="ms-topbar">
      <button className="ms-topbar-back" onClick={onBack} style={{ minWidth: 60 }}>
        <I.back /> Back
      </button>
      <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
        {eyebrow && <div className="ms-topbar-eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eyebrow}</div>}
        <div className="ms-topbar-title" style={{ fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      </div>
      <div style={{ width: 60, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>{right || <div style={{ width: 40 }} />}</div>
    </div>
  );
}

function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="page-header">
      <div className="page-header-eyebrow">{eyebrow}</div>
      <div className="page-header-title">{title}</div>
    </div>
  );
}

function Avatar({ initials, tone, size = 36 }: { initials: string; tone: string; size?: number }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    ok: { bg: '#DCEBD5', fg: '#2D5E26' },
    green: { bg: 'var(--field-green)', fg: 'var(--bone)' },
    sage: { bg: 'var(--sage-wash)', fg: 'var(--field-green)' },
    warn: { bg: '#F5E5CC', fg: '#7A4A12' },
    info: { bg: '#D6E3F2', fg: '#1A4575' },
    neutral: { bg: 'var(--stone-100)', fg: 'var(--stone-700)' },
    stone: { bg: 'var(--stone-100)', fg: 'var(--stone-700)' },
  };
  const c = colors[tone] || colors.neutral;
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: c.bg, color: c.fg, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  let cls = 'pill-neutral';
  if (s === 'returning' || s === 'installed' || s === 'active' || s === 'paid' || s === 'fulfilled' || s === 'received') cls = 'pill-brand';
  else if (s === 'still-to-go' || s === 'overdue' || s === 'sent' || s === 'shipped' || s === 'ordered') cls = 'pill-warn';
  else if (s === 'new' || s === 'in stock' || s === 'on order' || s === 'partially paid') cls = 'pill-info';
  else if (s === 'not-returning' || s === 'rma' || s === 'lost' || s === 'retired') cls = 'pill-dry';
  else if (s === 'draft' || s === 'quote') cls = 'pill-neutral';
  return <span className={`pill ${cls}`}>{status}</span>;
}

function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) return null;
  return (
    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: delta > 0 ? 'var(--healthy)' : 'var(--dry)' }}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  );
}

function MetaRow({ label, value, onClick }: { label: string; value: string | undefined; onClick?: () => void }) {
  return (
    <div className="list-row" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ flex: 1 }}>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--stone-500)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        <div style={{ fontWeight: 500, marginTop: 2, fontSize: 14 }}>{value || '—'}</div>
      </div>
      {onClick && <I.chevron />}
    </div>
  );
}

function DirectionsBtn({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  return (
    <a
      href={`https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`}
      target="_blank"
      rel="noopener noreferrer"
      className="directions-btn"
    >
      <I.map />
      {label}
    </a>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────

function DashboardScreen({ data, nav }: { data: MobileData; nav: (s: ScreenName, p?: Record<string, unknown>) => void }) {
  const ops = data.operations;
  const returning = ops.filter(o => o.status === 'returning').length;
  const newOps = ops.filter(o => o.status === 'new').length;
  const stillToGo = ops.filter(o => o.status === 'still-to-go');
  const notReturning = ops.filter(o => o.status === 'unknown').length;
  const total2025 = ops.filter(o => o.status === 'returning' || o.status === 'still-to-go').length;
  const total2026 = returning + newOps;

  const { totalInstalled, totalPlanned, byOp } = data.installStats;
  const pct = totalPlanned > 0 ? Math.round(totalInstalled / totalPlanned * 100) : 0;

  const totalProbes2026 = ops.reduce((s, o) => s + o.probeCount2026, 0);
  const totalProbes2025 = ops.reduce((s, o) => s + o.probeCount2025, 0);
  const projRev = ops.reduce((s, o) => s + o.revenue2026, 0);
  const lastRev = ops.reduce((s, o) => s + o.revenue2025, 0);

  const openInvoices = data.invoices.filter(i => ['Sent', 'Overdue', 'Partially Paid'].includes(i.status)).length;
  const openWater = data.waterRecs.filter(w => !w.date || new Date(w.date) >= new Date(Date.now() - 7 * 86400000)).length;

  return (
    <>
      <div className="ms-topbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--field-green)', color: 'var(--bone)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>AI</div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--stone-500)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Acre Ops</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Dashboard</div>
          </div>
        </div>
        <button className="ms-topbar-action"><I.bell /></button>
      </div>

      <div className="ms-body">
        <PageHeader eyebrow="2026 Season" title="Booking Tracker" />

        {/* Hero */}
        <div className="hero-green" style={{ margin: '8px 16px 16px' }}>
          <div className="label">Operations booked for 2026</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div className="big" style={{ fontSize: 48 }}>{total2026}</div>
            <div style={{ opacity: 0.7, fontFamily: 'var(--font-mono)', fontSize: 11 }}>of {total2025 || ops.length} in 2025</div>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${ops.length ? Math.round(total2026 / ops.length * 100) : 0}%` }} />
          </div>
          <div className="meta">
            <span><b>{returning}</b> returning · <b>{newOps}</b> new</span>
            <span>{stillToGo.length} to confirm</span>
          </div>
        </div>

        {/* Status grid */}
        <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { tone: 'ok', label: 'Returning', count: returning, filter: 'returning' },
            { tone: 'warn', label: 'Still to Go', count: stillToGo.length, sub: 'Need follow-up', filter: 'still-to-go' },
            { tone: 'info', label: 'New', count: newOps, sub: 'Won this season', filter: 'new' },
            { tone: 'neutral', label: 'Unknown', count: notReturning, sub: 'No 2026 data', filter: 'unknown' },
          ].map(t => (
            <button key={t.label} className="card" style={{ textAlign: 'left', padding: 14 }} onClick={() => nav('crm', { filter: t.filter })}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: t.tone === 'ok' ? '#4E8E3E' : t.tone === 'warn' ? '#C97B2D' : t.tone === 'info' ? '#2F6BB0' : 'var(--stone-300)', flexShrink: 0 }} />
                <div className="stat-label" style={{ fontSize: 9.5 }}>{t.label}</div>
              </div>
              <div className="stat-value" style={{ fontSize: 32 }}>{t.count}</div>
              {t.sub && <div className="stat-sub" style={{ fontSize: 11 }}>{t.sub}</div>}
            </button>
          ))}
        </div>

        {/* Install Progress */}
        <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Install Progress</span>
          <button className="linkbtn" onClick={() => nav('probes')}>All probes <I.chevron /></button>
        </div>
        <div style={{ padding: '0 16px 4px' }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, lineHeight: 1 }}>
                  {totalInstalled}<span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--stone-500)', marginLeft: 4 }}>/ {totalPlanned}</span>
                </div>
                <div className="stat-sub" style={{ marginTop: 4 }}>probes installed for 2026</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--field-green)' }}>{pct}%</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--stone-500)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>complete</div>
              </div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--stone-50)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--field-green)', borderRadius: 999 }} />
            </div>
          </div>
        </div>

        {byOp.length > 0 && (
          <div style={{ padding: '8px 16px 4px' }}>
            <div className="card-flat">
              {byOp.slice().sort((a, b) => {
                const pa = a.planned > 0 ? a.installed / a.planned : 0;
                const pb = b.planned > 0 ? b.installed / b.planned : 0;
                return pa - pb;
              }).slice(0, 5).map(r => {
                const p = r.planned > 0 ? Math.round(r.installed / r.planned * 100) : 0;
                return (
                  <button key={r.opId} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('op-detail', { opId: r.opId })}>
                    <Avatar initials={r.initials} tone={p >= 100 ? 'ok' : p > 0 ? 'info' : 'warn'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="list-row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.opName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <div style={{ flex: 1, height: 5, background: 'var(--stone-50)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${p}%`, background: p >= 100 ? 'var(--field-green)' : p > 0 ? '#2F6BB0' : 'var(--stone-300)', borderRadius: 999 }} />
                        </div>
                        <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--stone-700)', minWidth: 34, textAlign: 'right' }}>{r.installed}/{r.planned}</div>
                      </div>
                    </div>
                    <I.chevron />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Still to go */}
        {stillToGo.length > 0 && (
          <>
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Still to Go <span className="count">{stillToGo.length}</span></span>
              <button className="linkbtn" onClick={() => nav('crm', { filter: 'still-to-go' })}>See all <I.chevron /></button>
            </div>
            <div className="card-flat" style={{ margin: '0 16px' }}>
              {stillToGo.slice(0, 4).map(op => (
                <button key={op.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('op-detail', { opId: op.id })}>
                  <Avatar initials={op.initials} tone="warn" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-row-title">{op.name}</div>
                    <div className="list-row-sub">{op.fieldCount} field{op.fieldCount !== 1 ? 's' : ''} · {op.probeCount2025} probes in 2025</div>
                  </div>
                  <I.chevron />
                </button>
              ))}
            </div>
          </>
        )}

        {/* At a glance */}
        <div className="section-label">Season at a Glance</div>
        <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="card" style={{ textAlign: 'left', padding: 14 }} onClick={() => nav('probes')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-label">Probes 2026</div>
              <DeltaChip delta={totalProbes2026 - totalProbes2025} />
            </div>
            <div className="stat-value" style={{ marginTop: 8 }}>{totalProbes2026}</div>
            <div className="stat-sub">vs {totalProbes2025} in 2025</div>
          </button>
          <button className="card" style={{ textAlign: 'left', padding: 14 }} onClick={() => nav('billing')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="stat-label">2026 Revenue</div>
              <DeltaChip delta={projRev > lastRev ? 1 : projRev < lastRev ? -1 : 0} />
            </div>
            <div className="stat-value" style={{ marginTop: 8, fontSize: projRev >= 100000 ? 20 : 28 }}>{fmtMoney(projRev)}</div>
            <div className="stat-sub">vs {fmtMoney(lastRev)} in 2025</div>
          </button>
        </div>

        {/* Quick Jump */}
        <div className="section-label">Jump To</div>
        <div style={{ padding: '0 16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { key: 'water' as ScreenName, icon: I.drop, label: 'Water Recs', sub: `${openWater} recent` },
            { key: 'billing' as ScreenName, icon: I.dollar, label: 'Billing', sub: `${openInvoices} open` },
            { key: 'crm' as ScreenName, icon: I.users, label: 'CRM', sub: `${ops.length} operations` },
            { key: 'season' as ScreenName, icon: I.cal, label: 'Season Prep', sub: 'Readiness' },
          ].map(q => (
            <button key={q.key} className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, textAlign: 'left', padding: 14 }} onClick={() => nav(q.key)}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--sage-wash)', color: 'var(--field-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <q.icon />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', fontSize: 15, letterSpacing: '0.02em' }}>{q.label}</div>
                <div className="stat-sub">{q.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── FIELDS ────────────────────────────────────────────────────────

function FieldsScreen({ data, nav }: { data: MobileData; nav: (s: ScreenName, p?: Record<string, unknown>) => void }) {
  const [query, setQuery] = useState('');
  const fields = data.fields;

  const filtered = useMemo(() => {
    if (!query) return fields;
    const q = query.toLowerCase();
    return fields.filter(f => f.name.toLowerCase().includes(q) || f.operationName.toLowerCase().includes(q));
  }, [fields, query]);

  const byOp = useMemo(() => {
    const m = new Map<string, MobileField[]>();
    filtered.forEach(f => {
      const key = f.operationName || 'Unknown';
      const list = m.get(key) || [];
      list.push(f);
      m.set(key, list);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const totalAcres = Math.round(fields.reduce((s, f) => s + f.acres, 0));

  return (
    <>
      <div className="ms-topbar">
        <div style={{ flex: 1 }} />
        <div className="ms-topbar-title" style={{ fontSize: 17 }}>Fields</div>
        <div style={{ width: 36 }} />
      </div>
      <div className="ms-body">
        <PageHeader eyebrow={`${fields.length} fields · ${totalAcres.toLocaleString()} acres`} title="Fields" />
        <div className="searchbar">
          <I.search /><input placeholder="Search fields or operation" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {byOp.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--stone-500)' }}>No fields match.</div>}
        {byOp.map(([opName, opFields]) => (
          <div key={opName}>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{opName}</span><span className="count">{opFields.length}</span>
            </div>
            <div className="card-flat" style={{ margin: '0 16px 16px' }}>
              {opFields.map(f => (
                <button key={f.id} className="list-row" style={{ width: '100%', textAlign: 'left', gap: 12 }} onClick={() => nav('field-detail', { fieldId: f.id })}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-row-title">{f.name}</div>
                    <div className="list-row-sub">{f.acres.toFixed(0)} ac{f.crop ? ` · ${f.crop}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, lineHeight: 1 }}>{f.probeCount}</div>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--stone-500)', letterSpacing: '0.06em', marginTop: 2 }}>PROBES</div>
                  </div>
                  <I.chevron />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FieldDetailScreen({ data, fieldId, nav, goBack }: { data: MobileData; fieldId: number; nav: (s: ScreenName, p?: Record<string, unknown>) => void; goBack: () => void }) {
  const f = data.fields.find(x => x.id === fieldId);
  if (!f) return <div style={{ padding: 40 }}>Field not found</div>;
  const probes = data.probes.filter(p => p.fieldId === f.id);
  const op = f.operationId ? data.operations.find(o => o.id === f.operationId) : undefined;

  return (
    <>
      <TopBar title={f.name} eyebrow={op?.name} onBack={goBack} />
      <div className="ms-body">
        <div style={{ padding: '12px 16px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Acres', value: f.acres.toFixed(1) },
            { label: 'Crop', value: f.crop || '—' },
            { label: 'Probes', value: String(probes.length) },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 12 }}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ fontSize: s.label === 'Crop' ? 16 : 24, marginTop: 6 }}>{s.value}</div>
            </div>
          ))}
        </div>
        {f.lat && f.lng && (
          <div style={{ padding: '4px 16px 8px' }}>
            <DirectionsBtn lat={f.lat} lng={f.lng} label={`Directions to ${f.name}`} />
          </div>
        )}
        {probes.length > 0 && (
          <>
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Probes <span className="count">{probes.length}</span></span>
              <button className="linkbtn" onClick={() => nav('probes')}>All probes <I.chevron /></button>
            </div>
            <div className="card-flat" style={{ margin: '0 16px 16px' }}>
              {probes.map(p => (
                <button key={p.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('probe-detail', { probeId: p.id })}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sage-wash)', color: 'var(--field-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.radio /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-row-title mono">{p.serialNumber}</div>
                    <div className="list-row-sub">{p.model || '—'}</div>
                  </div>
                  <StatusPill status={p.status} />
                  <I.chevron />
                </button>
              ))}
            </div>
          </>
        )}
        <div className="section-label">Details</div>
        <div className="card-flat" style={{ margin: '0 16px 24px' }}>
          <MetaRow label="Operation" value={op?.name} onClick={op ? () => nav('op-detail', { opId: op.id }) : undefined} />
          <MetaRow label="Soil type" value={f.soilType} />
          <MetaRow label="Planting date" value={fmtDateShort(f.plantingDate)} />
          <MetaRow label="Planned installer" value={f.plannedInstaller} />
          {f.lat && f.lng && <MetaRow label="Coordinates" value={fmtCoord(f.lat, f.lng)} />}
          {f.fieldDirections && <MetaRow label="Directions" value={f.fieldDirections} />}
          <MetaRow label="Notes" value={f.notes} />
        </div>
      </div>
    </>
  );
}

// ── PROBES ────────────────────────────────────────────────────────

const PROBE_TABS = [
  { key: 'deployed', label: 'Deployed', statuses: ['Installed', 'Active', 'Assigned'] },
  { key: 'inventory', label: 'Inventory', statuses: ['In Stock'] },
  { key: 'orders', label: 'Orders', statuses: ['On Order', 'On Order - Trade', 'Trade Ordered', 'Trade Ordered - In Crate', 'In Crate for Shipment', 'No Trade'] },
  { key: 'service', label: 'Service', statuses: ['RMA', 'Retired', 'Lost'] },
];

function ProbesScreen({ data, nav }: { data: MobileData; nav: (s: ScreenName, p?: Record<string, unknown>) => void }) {
  const [tab, setTab] = useState('deployed');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    PROBE_TABS.forEach(t => {
      m[t.key] = data.probes.filter(p => t.statuses.includes(p.status)).length;
    });
    return m;
  }, [data.probes]);

  const visible = useMemo(() => {
    const tabDef = PROBE_TABS.find(t => t.key === tab)!;
    let list = data.probes.filter(p => tabDef.statuses.includes(p.status));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(p => p.serialNumber.toLowerCase().includes(q) || (p.fieldName || '').toLowerCase().includes(q));
    }
    return list;
  }, [data.probes, tab, query]);

  const byStatus = useMemo(() => {
    const m = new Map<string, MobileProbe[]>();
    visible.forEach(p => {
      const list = m.get(p.status) || [];
      list.push(p);
      m.set(p.status, list);
    });
    return Array.from(m.entries());
  }, [visible]);

  const installed = data.probes.filter(p => ['Installed', 'Active'].includes(p.status)).length;

  return (
    <>
      <div className="ms-topbar">
        <div style={{ flex: 1 }} />
        <div className="ms-topbar-title" style={{ fontSize: 17 }}>Probes</div>
        <div style={{ width: 36 }} />
      </div>
      <div className="ms-body">
        <PageHeader eyebrow={`${data.probes.length} units · ${installed} active`} title="Probes" />
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Installed', count: installed, dot: '#4E8E3E' },
                { label: 'In Stock', count: counts.inventory, dot: '#2F6BB0' },
                { label: 'On Order', count: counts.orders, dot: '#E6B34A' },
                { label: 'Service', count: counts.service, dot: '#B23A2A' },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 999, background: s.dot }} />
                    <div className="stat-label" style={{ fontSize: 9 }}>{s.label}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1 }}>{s.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="segment">
          {PROBE_TABS.map(t => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label} <span style={{ opacity: 0.6 }}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="searchbar"><I.search /><input placeholder="Serial or field" value={query} onChange={e => setQuery(e.target.value)} /></div>
        {byStatus.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--stone-500)' }}>No probes here.</div>}
        {byStatus.map(([status, items]) => (
          <div key={status}>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusPill status={status} /><span className="count">{items.length}</span>
            </div>
            {tab === 'inventory' ? (
              <div style={{ padding: '0 16px 16px' }}>
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {items.map(p => (
                      <button key={p.id} onClick={() => nav('probe-detail', { probeId: p.id })} style={{ background: 'var(--sage-wash)', color: 'var(--field-green)', border: '1px solid var(--border-1)', borderRadius: 8, padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }}>
                        <I.radio />
                        <span>{p.serialNumber.replace(/^CX-?/i, '')}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card-flat" style={{ margin: '0 16px 16px' }}>
                {items.map(p => (
                  <button key={p.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('probe-detail', { probeId: p.id })}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sage-wash)', color: 'var(--field-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.radio /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="list-row-title mono">{p.serialNumber}</div>
                      <div className="list-row-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.fieldName || p.model || '—'}{p.operationName ? ` · ${p.operationName}` : ''}
                      </div>
                    </div>
                    {p.battery != null && (
                      <div style={{ textAlign: 'right', marginRight: 6 }}>
                        <div className="mono" style={{ fontSize: 11, fontWeight: 500 }}>{p.battery}%</div>
                        <div style={{ width: 32, height: 4, background: 'var(--stone-50)', borderRadius: 999, marginTop: 3, overflow: 'hidden' }}>
                          <div style={{ width: p.battery + '%', height: '100%', background: p.battery > 30 ? 'var(--healthy)' : 'var(--dry)' }} />
                        </div>
                      </div>
                    )}
                    <I.chevron />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function ProbeDetailScreen({ data, probeId, nav, goBack }: { data: MobileData; probeId: number; nav: (s: ScreenName, p?: Record<string, unknown>) => void; goBack: () => void }) {
  const p = data.probes.find(x => x.id === probeId);
  if (!p) return <div style={{ padding: 40 }}>Probe not found</div>;
  const field = p.fieldId ? data.fields.find(f => f.id === p.fieldId) : undefined;
  const op = p.operationId ? data.operations.find(o => o.id === p.operationId) : undefined;
  const lat = p.lat || field?.lat;
  const lng = p.lng || field?.lng;

  return (
    <>
      <TopBar title={p.serialNumber} eyebrow="Probe" onBack={goBack} right={<button className="ms-topbar-action"><I.edit /></button>} />
      <div className="ms-body">
        <div style={{ padding: '12px 16px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, background: 'var(--field-green)', color: 'var(--bone)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 32, height: 32, display: 'inline-flex' }}><I.radio /></span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, textTransform: 'uppercase' }}>{p.serialNumber}</div>
            <div style={{ color: 'var(--stone-500)', fontSize: 13, marginTop: 2 }}>{p.model || 'CropX Probe'}</div>
            <div style={{ marginTop: 6 }}><StatusPill status={p.status} /></div>
          </div>
        </div>

        {p.battery != null && (
          <div style={{ padding: '0 16px 12px' }}>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="stat-label">Battery</div>
                <div className="mono" style={{ fontWeight: 600 }}>{p.battery}%</div>
              </div>
              <div style={{ height: 8, background: 'var(--stone-50)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: p.battery + '%', height: '100%', background: p.battery > 30 ? 'var(--healthy)' : 'var(--dry)', borderRadius: 999 }} />
              </div>
            </div>
          </div>
        )}

        <div className="section-label">Assignment</div>
        <div className="card-flat" style={{ margin: '0 16px 16px' }}>
          <MetaRow label="Operation" value={op?.name || '—'} onClick={op ? () => nav('op-detail', { opId: op.id }) : undefined} />
          <MetaRow label="Field" value={field?.name || '—'} onClick={field ? () => nav('field-detail', { fieldId: field.id }) : undefined} />
          <MetaRow label="Installed" value={fmtDateShort(p.installedDate)} />
        </div>

        {lat && lng && (
          <>
            <div className="section-label">Location</div>
            <div style={{ padding: '0 16px 16px' }}>
              <div className="card-flat" style={{ marginBottom: 8 }}>
                <MetaRow label="Coordinates" value={fmtCoord(lat, lng)} />
                {!p.lat && field && <MetaRow label="Source" value="Field location" />}
              </div>
              <DirectionsBtn lat={lat} lng={lng} label={`Directions to ${p.serialNumber}`} />
            </div>
          </>
        )}

        {p.notes && (
          <>
            <div className="section-label">Notes</div>
            <div style={{ padding: '0 16px 16px' }}>
              <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.5, color: 'var(--stone-700)' }}>{p.notes}</div>
            </div>
          </>
        )}

        <div style={{ padding: '0 16px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="card" style={{ padding: 14, textAlign: 'center', color: 'var(--field-green)', fontWeight: 700, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13 }}>Move status</button>
          <a href={`https://app.cropx.com/probes/${encodeURIComponent(p.serialNumber)}`} target="_blank" rel="noopener noreferrer" className="card" style={{ padding: 14, textAlign: 'center', color: 'var(--field-green)', fontWeight: 700, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Open in CropX</a>
        </div>
      </div>
    </>
  );
}

// ── REPAIRS ───────────────────────────────────────────────────────

const REPAIR_STATUS_INFO: Record<string, { color: string; bg: string; fg: string; step: number; label: string }> = {
  'open':     { color: '#C97B2D', bg: '#F5E5CC', fg: '#7A4A12', step: 1, label: 'Open' },
  'resolved': { color: '#4E8E3E', bg: '#DCEBD5', fg: '#2D5E26', step: 6, label: 'Resolved' },
};

function RepairsScreen({ data, nav }: { data: MobileData; nav: (s: ScreenName, p?: Record<string, unknown>) => void }) {
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);

  const open = data.repairs.filter(r => r.status === 'open');
  const resolved = data.repairs.filter(r => r.status === 'resolved');
  const list = (tab === 'open' ? open : resolved).filter(r => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.fieldName.toLowerCase().includes(q) || r.operationName.toLowerCase().includes(q) || r.problem.toLowerCase().includes(q);
  });

  return (
    <>
      <div className="ms-topbar">
        <div style={{ flex: 1 }} />
        <div className="ms-topbar-title" style={{ fontSize: 17 }}>Repairs</div>
        <button className="ms-topbar-action" onClick={() => setShowNew(true)}><I.plus /></button>
      </div>
      <div className="ms-body">
        <PageHeader eyebrow={`${open.length} open · ${resolved.length} resolved`} title="Repairs" />

        {/* Stat strip */}
        <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { tone: '#C97B2D', bg: '#F5E5CC', fg: '#7A4A12', label: 'Open', value: open.length },
            { tone: '#2F6BB0', bg: '#D6E3F2', fg: '#1A4575', label: 'Resolving', value: Math.max(0, open.length - 1) },
            { tone: '#B23A2A', bg: '#F5D8D2', fg: '#7A2418', label: 'Resolved', value: resolved.length },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 12, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: 999, background: s.tone }} />
                <div className="stat-label" style={{ fontSize: 9.5, letterSpacing: '0.1em' }}>{s.label}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="segment">
          <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>Open · {open.length}</button>
          <button className={tab === 'resolved' ? 'active' : ''} onClick={() => setTab('resolved')}>Resolved · {resolved.length}</button>
        </div>
        <div className="searchbar"><I.search /><input placeholder="Search repairs" value={query} onChange={e => setQuery(e.target.value)} /></div>
        {list.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--stone-500)' }}>No repairs here.</div>}
        <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <RepairCard key={r.id} repair={r} onClick={() => nav('repairs', { repairId: r.id })} />
          ))}
        </div>
      </div>
      <button className="fab" onClick={() => setShowNew(true)}><I.plus /></button>
      {showNew && (
        <NewRepairSheet
          data={data}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); window.location.reload(); }}
        />
      )}
    </>
  );
}

function RepairCard({ repair, onClick }: { repair: MobileRepair; onClick: () => void }) {
  const info = REPAIR_STATUS_INFO[repair.status] || REPAIR_STATUS_INFO['open'];
  const daysOpen = Math.floor((Date.now() - new Date(repair.reportedAt || Date.now()).getTime()) / 86400000);

  return (
    <button onClick={onClick} className="card" style={{ padding: 0, textAlign: 'left', overflow: 'hidden', display: 'block', width: '100%' }}>
      {/* Status stripe */}
      <div style={{ height: 4, background: info.color }} />
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: 1.1 }}>{repair.fieldName}</div>
            <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repair.operationName}</div>
            <div style={{ fontSize: 13, color: 'var(--stone-700)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repair.problem}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: info.bg, color: info.fg, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: info.color }} />
              {info.label}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--stone-500)', marginTop: 6 }}>{daysOpen}d open</div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div key={n} style={{ flex: 1, height: 4, borderRadius: 999, background: n <= info.step ? info.color : 'var(--stone-50)' }} />
          ))}
        </div>
      </div>
    </button>
  );
}

function RepairDetailScreen({ data, repairId, goBack }: { data: MobileData; repairId: number; goBack: () => void }) {
  const r = data.repairs.find(x => x.id === repairId);
  if (!r) return <div style={{ padding: 40 }}>Repair not found</div>;
  const info = REPAIR_STATUS_INFO[r.status] || REPAIR_STATUS_INFO['open'];

  return (
    <>
      <TopBar title={r.fieldName} eyebrow="Repair" onBack={goBack} />
      <div className="ms-body">
        {/* Header */}
        <div style={{ padding: '4px 16px 16px', borderBottom: '1px solid var(--border-1)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, textTransform: 'uppercase', lineHeight: 1.05 }}>{r.operationName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: info.bg, color: info.fg, borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: info.color }} />
              {info.label}
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--stone-500)' }}>Reported {fmtDateShort(r.reportedAt)}</span>
          </div>
        </div>

        {/* Status timeline */}
        <div style={{ padding: '14px 16px 8px' }}>
          <div className="stat-label" style={{ marginBottom: 10 }}>Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {[{ short: 'Report' }, { short: 'Diag' }, { short: 'RMA' }, { short: 'Wait' }, { short: 'Fixed' }, { short: 'Done' }].map((s, i, arr) => (
              <React.Fragment key={s.short}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <div style={{ width: i + 1 === info.step ? 26 : 18, height: i + 1 === info.step ? 26 : 18, borderRadius: 999, background: i + 1 <= info.step ? info.color : 'var(--stone-50)', border: i + 1 === info.step ? '3px solid var(--bone)' : 'none', boxShadow: i + 1 === info.step ? `0 0 0 2px ${info.color}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bone)' }}>
                    {i + 1 < info.step && <span style={{ fontSize: 10, fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 600, color: i + 1 === info.step ? 'var(--ink)' : i + 1 < info.step ? 'var(--stone-700)' : 'var(--stone-300)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6, whiteSpace: 'nowrap', textAlign: 'center' }}>{s.short}</div>
                </div>
                {i < arr.length - 1 && <div style={{ flex: 0.6, height: 2, marginTop: -16, background: i + 1 < info.step ? info.color : 'var(--stone-50)' }} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="section-label">Details</div>
        <div className="card-flat" style={{ margin: '0 16px 16px' }}>
          <MetaRow label="Field" value={r.fieldName} />
          <MetaRow label="Operation" value={r.operationName} />
          <MetaRow label="Reported" value={fmtDate(r.reportedAt)} />
          {r.repairedAt && <MetaRow label="Resolved" value={fmtDate(r.repairedAt)} />}
          {r.probeSerial && <MetaRow label="Probe" value={r.probeSerial} />}
          {r.probeReplaced && <MetaRow label="Probe replaced" value={r.newProbeSerial || 'Yes'} />}
          <MetaRow label="Customer notified" value={r.notifiedCustomer ? 'Yes' : 'No'} />
        </div>

        <div className="section-label">Problem</div>
        <div style={{ padding: '0 16px 16px' }}>
          <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.5, color: 'var(--stone-700)' }}>{r.problem}</div>
        </div>

        {r.fix && (
          <>
            <div className="section-label">Resolution</div>
            <div style={{ padding: '0 16px 24px' }}>
              <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.5, color: 'var(--stone-700)' }}>{r.fix}</div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── BOTTOM SHEET ─────────────────────────────────────────────────

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ width: '100%', background: 'var(--bone)', borderRadius: '20px 20px 0 0', maxHeight: '82%', overflow: 'auto', paddingBottom: 'env(safe-area-inset-bottom)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--stone-500)' }}><I.x /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--stone-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border-1)', background: 'var(--bone-raised)', fontSize: 14, fontFamily: 'var(--font-body)', color: 'var(--stone-900)', boxSizing: 'border-box', appearance: 'none' };
const submitBtnStyle: React.CSSProperties = { width: '100%', padding: 14, borderRadius: 12, background: 'var(--field-green)', color: 'var(--bone)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.04em', border: 'none', cursor: 'pointer' };

function NewRepairSheet({ data, onClose, onSaved }: { data: MobileData; onClose: () => void; onSaved: () => void }) {
  const [fieldId, setFieldId] = useState('');
  const [problem, setProblem] = useState('');
  const [reportedAt, setReportedAt] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fieldsWithSeason = data.fields.filter(f => f.fieldSeasonId2026).sort((a, b) => a.name.localeCompare(b.name));

  async function handleSubmit() {
    if (!fieldId || !problem.trim()) { setError('Field and problem are required.'); return; }
    const f = data.fields.find(x => x.id === Number(fieldId));
    if (!f?.fieldSeasonId2026) { setError('Selected field has no 2026 season.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_season: f.fieldSeasonId2026, problem: problem.trim(), reported_at: reportedAt }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <BottomSheet title="New Repair" onClose={onClose}>
      <div style={{ padding: '8px 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ background: '#FEE2E2', color: '#7F1D1D', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
        <FormField label="Field *">
          <select value={fieldId} onChange={e => setFieldId(e.target.value)} style={inputStyle}>
            <option value="">Select a field…</option>
            {fieldsWithSeason.map(f => (
              <option key={f.id} value={f.id}>{f.name}{f.operationName ? ` (${f.operationName})` : ''}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Problem *">
          <textarea value={problem} onChange={e => setProblem(e.target.value)} rows={3} placeholder="Describe the issue…" style={{ ...inputStyle, resize: 'none' }} />
        </FormField>
        <FormField label="Reported date">
          <input type="date" value={reportedAt} onChange={e => setReportedAt(e.target.value)} style={inputStyle} />
        </FormField>
        <button onClick={handleSubmit} disabled={saving} style={{ ...submitBtnStyle, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Repair'}
        </button>
      </div>
    </BottomSheet>
  );
}

function NewOrderSheet({ data, onClose, onSaved }: { data: MobileData; onClose: () => void; onSaved: () => void }) {
  const [opId, setOpId] = useState('');
  const [notes, setNotes] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const opsWithBE = data.operations.filter(o => o.billingEntityIds.length > 0).sort((a, b) => a.name.localeCompare(b.name));

  async function handleSubmit() {
    if (!opId) { setError('Please select an operation.'); return; }
    const op = data.operations.find(x => x.id === Number(opId));
    if (!op?.billingEntityIds?.[0]) { setError('Selected operation has no billing entity.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing_entity: [op.billingEntityIds[0]], order_date: orderDate, notes: notes.trim(), status: 'Quote' }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <BottomSheet title="New Order" onClose={onClose}>
      <div style={{ padding: '8px 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div style={{ background: '#FEE2E2', color: '#7F1D1D', padding: '10px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>}
        <FormField label="Operation *">
          <select value={opId} onChange={e => setOpId(e.target.value)} style={inputStyle}>
            <option value="">Select an operation…</option>
            {opsWithBE.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Order date">
          <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={inputStyle} />
        </FormField>
        <FormField label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add notes…" style={{ ...inputStyle, resize: 'none' }} />
        </FormField>
        <button onClick={handleSubmit} disabled={saving} style={{ ...submitBtnStyle, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Create Order'}
        </button>
      </div>
    </BottomSheet>
  );
}

// ── MORE ──────────────────────────────────────────────────────────

function MoreScreen({ data, nav }: { data: MobileData; nav: (s: ScreenName) => void }) {
  const openOrders = data.orders.filter(o => !['Fulfilled'].includes(o.status)).length;
  const openInvoices = data.invoices.filter(i => ['Sent', 'Overdue', 'Partially Paid'].includes(i.status)).length;
  const recentWater = data.waterRecs.filter(w => w.date && new Date(w.date) >= new Date(Date.now() - 14 * 86400000)).length;

  const items = [
    { key: 'crm' as ScreenName, icon: I.users, label: 'CRM · Operations', sub: `${data.operations.length} operations`, tone: 'sage' },
    { key: 'orders' as ScreenName, icon: I.cart, label: 'Orders', sub: `${openOrders} open`, tone: 'warn' },
    { key: 'water' as ScreenName, icon: I.drop, label: 'Water Recommendations', sub: `${recentWater} recent`, tone: 'info' },
    { key: 'billing' as ScreenName, icon: I.dollar, label: 'Billing & Invoices', sub: `${openInvoices} open`, tone: 'sage' },
    { key: 'season' as ScreenName, icon: I.cal, label: 'Season Readiness', sub: '2026 prep', tone: 'sage' },
  ];

  return (
    <>
      <div className="ms-topbar"><div style={{ flex: 1 }} /><div className="ms-topbar-title" style={{ fontSize: 17 }}>More</div><div style={{ width: 40 }} /></div>
      <div className="ms-body">
        <PageHeader eyebrow="Additional tools" title="More" />
        <div className="card-flat" style={{ margin: '0 16px 16px' }}>
          {items.map(it => (
            <button key={it.key} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav(it.key)}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: it.tone === 'info' ? '#D6E3F2' : it.tone === 'warn' ? '#F5E5CC' : 'var(--sage-wash)', color: it.tone === 'info' ? '#1A4575' : it.tone === 'warn' ? '#7A4A12' : 'var(--field-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 22, height: 22, display: 'inline-flex' }}><it.icon /></span>
              </div>
              <div style={{ flex: 1 }}>
                <div className="list-row-title">{it.label}</div>
                <div className="list-row-sub">{it.sub}</div>
              </div>
              <I.chevron />
            </button>
          ))}
        </div>

        <div className="section-label">Account</div>
        <div className="card-flat" style={{ margin: '0 16px 24px' }}>
          <div className="list-row">
            <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--field-green)', color: 'var(--bone)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>JT</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="list-row-title">Jordan Thiessen</div>
              <div className="list-row-sub">Acre Insights · Owner</div>
            </div>
          </div>
          <button className="list-row" style={{ width: '100%', textAlign: 'left' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--stone-50)', color: 'var(--stone-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.cog /></div>
            <div style={{ flex: 1 }}>
              <div className="list-row-title">Settings</div>
            </div>
            <I.chevron />
          </button>
        </div>
      </div>
    </>
  );
}

// ── CRM ───────────────────────────────────────────────────────────

function CRMScreen({ data, filter, nav }: { data: MobileData; filter?: string; nav: (s: ScreenName, p?: Record<string, unknown>) => void }) {
  const [statusFilter, setStatusFilter] = useState(filter || 'all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => ({
    returning: data.operations.filter(o => o.status === 'returning').length,
    new: data.operations.filter(o => o.status === 'new').length,
    'still-to-go': data.operations.filter(o => o.status === 'still-to-go').length,
    unknown: data.operations.filter(o => o.status === 'unknown').length,
  }), [data.operations]);

  const filtered = useMemo(() => data.operations.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (query) return o.name.toLowerCase().includes(query.toLowerCase());
    return true;
  }), [data.operations, statusFilter, query]);

  return (
    <>
      <div className="ms-topbar"><div style={{ flex: 1 }} /><div className="ms-topbar-title" style={{ fontSize: 17 }}>CRM</div><div style={{ width: 36 }} /></div>
      <div className="ms-body">
        <PageHeader eyebrow={`${data.operations.length} operations`} title="Operations" />
        <div className="searchbar"><I.search /><input placeholder="Search operations" value={query} onChange={e => setQuery(e.target.value)} /></div>
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {[
            { key: 'all', label: 'All', count: data.operations.length },
            { key: 'returning', label: 'Returning', count: counts.returning, dot: '#4E8E3E' },
            { key: 'still-to-go', label: 'Still to Go', count: counts['still-to-go'], dot: '#C97B2D' },
            { key: 'new', label: 'New', count: counts.new, dot: '#2F6BB0' },
            { key: 'unknown', label: 'Unknown', count: counts.unknown, dot: 'var(--stone-300)' },
          ].map(chip => (
            <button key={chip.key} onClick={() => setStatusFilter(chip.key)} style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 999, background: statusFilter === chip.key ? 'var(--field-green)' : 'var(--bone-raised)', color: statusFilter === chip.key ? 'var(--bone)' : 'var(--stone-700)', border: `1px solid ${statusFilter === chip.key ? 'var(--field-green)' : 'var(--border-1)'}`, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6, minHeight: 34 }}>
              {'dot' in chip && <span style={{ width: 7, height: 7, borderRadius: 999, background: statusFilter === chip.key ? 'var(--bone)' : chip.dot }} />}
              {chip.label}
              <span style={{ background: statusFilter === chip.key ? 'rgba(255,255,255,0.18)' : 'var(--stone-50)', color: statusFilter === chip.key ? 'var(--bone)' : 'var(--stone-500)', padding: '0 6px', borderRadius: 999, fontSize: 10 }}>{chip.count}</span>
            </button>
          ))}
        </div>
        {filtered.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--stone-500)' }}>No operations match.</div>}
        <div className="card-flat" style={{ margin: '0 16px 24px' }}>
          {filtered.map(op => (
            <button key={op.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('op-detail', { opId: op.id })}>
              <Avatar initials={op.initials} tone={op.status === 'returning' ? 'sage' : op.status === 'still-to-go' ? 'warn' : op.status === 'new' ? 'info' : 'stone'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="list-row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</div>
                <div className="list-row-sub">{op.fieldCount} field{op.fieldCount !== 1 ? 's' : ''} · {op.probeCount2026} probes</div>
              </div>
              <StatusPill status={op.status === 'still-to-go' ? 'Still to Go' : op.status === 'returning' ? 'Returning' : op.status === 'new' ? 'New' : 'Unknown'} />
              <I.chevron />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function OpDetailScreen({ data, opId, nav, goBack }: { data: MobileData; opId: number; nav: (s: ScreenName, p?: Record<string, unknown>) => void; goBack: () => void }) {
  const [tab, setTab] = useState<'overview' | 'fields' | 'contacts' | 'billing'>('overview');
  const op = data.operations.find(o => o.id === opId);
  if (!op) return <div style={{ padding: 40 }}>Operation not found</div>;

  const opFields = data.fields.filter(f => f.operationId === op.id);
  const opInvoices = data.invoices.filter(i => op.billingEntityIds.includes(i.billingEntityId || 0));
  const primaryContact = op.contacts.find(c => c.isPrimary) || op.contacts[0];

  return (
    <>
      <TopBar title={op.name} eyebrow="Operation" onBack={goBack} />
      <div className="ms-body">
        <div style={{ padding: '12px 16px 12px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar initials={op.initials} tone={op.status === 'returning' ? 'green' : op.status === 'still-to-go' ? 'warn' : 'info'} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, textTransform: 'uppercase', lineHeight: 1, marginBottom: 6 }}>{op.name}</div>
            <StatusPill status={op.status === 'still-to-go' ? 'Still to Go' : op.status === 'returning' ? 'Returning' : op.status === 'new' ? 'New' : 'Unknown'} />
          </div>
        </div>

        {primaryContact && (
          <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
            {primaryContact.phone && <a href={`tel:${primaryContact.phone}`} className="card" style={{ flex: 1, padding: '10px 12px', textAlign: 'center', textDecoration: 'none', color: 'var(--field-green)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12 }}>Call</a>}
            {primaryContact.phone && <a href={`sms:${primaryContact.phone}`} className="card" style={{ flex: 1, padding: '10px 12px', textAlign: 'center', textDecoration: 'none', color: 'var(--field-green)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12 }}>Text</a>}
            {primaryContact.email && <a href={`mailto:${primaryContact.email}`} className="card" style={{ flex: 1, padding: '10px 12px', textAlign: 'center', textDecoration: 'none', color: 'var(--field-green)', fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 12 }}>Email</a>}
          </div>
        )}

        <div className="segment">
          {(['overview', 'fields', 'contacts', 'billing'] as const).map(t => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'fields' ? `Fields (${opFields.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <div style={{ padding: '4px 16px 12px' }}>
              <div className="card" style={{ padding: 14 }}>
                <div className="stat-label" style={{ marginBottom: 10 }}>Year over year</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Probes', prev: op.probeCount2025, curr: op.probeCount2026 },
                    { label: 'Fields', prev: opFields.length, curr: opFields.length },
                    { label: 'Revenue', prev: op.revenue2025, curr: op.revenue2026, money: true },
                  ].map(y => (
                    <div key={y.label}>
                      <div className="stat-label" style={{ fontSize: 9 }}>{y.label}</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: y.money ? 16 : 22, lineHeight: 1, marginTop: 4 }}>{y.money ? fmtMoney(y.curr) : y.curr}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--stone-500)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        prev {y.money ? fmtMoney(y.prev) : y.prev}
                        {y.curr !== y.prev && <span style={{ color: y.curr > y.prev ? 'var(--healthy)' : 'var(--dry)', fontWeight: 600 }}>{y.curr > y.prev ? '▲' : '▼'} {y.money ? fmtMoney(Math.abs(y.curr - y.prev)) : Math.abs(y.curr - y.prev)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {op.notes && (
              <div style={{ padding: '0 16px 16px' }}>
                <div className="card" style={{ padding: 14, fontSize: 13, lineHeight: 1.5, color: 'var(--stone-700)' }}>
                  <div className="stat-label" style={{ marginBottom: 6 }}>Notes</div>
                  {op.notes}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'fields' && (
          <div className="card-flat" style={{ margin: '0 16px 24px' }}>
            {opFields.length === 0 && <div style={{ padding: '20px 16px', color: 'var(--stone-500)', fontSize: 13 }}>No fields.</div>}
            {opFields.map(f => (
              <button key={f.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('field-detail', { fieldId: f.id })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-row-title">{f.name}</div>
                  <div className="list-row-sub">{f.acres.toFixed(1)} ac{f.crop ? ` · ${f.crop}` : ''}</div>
                </div>
                <I.chevron />
              </button>
            ))}
          </div>
        )}

        {tab === 'contacts' && (
          <>
            <div className="section-label">Contacts</div>
            <div className="card-flat" style={{ margin: '0 16px 16px' }}>
              {op.contacts.length === 0 && <div style={{ padding: '20px 16px', color: 'var(--stone-500)', fontSize: 13 }}>No contacts.</div>}
              {op.contacts.map(c => (
                <div key={c.id} className="list-row">
                  <Avatar initials={getInitials(c.name)} tone="sage" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-row-title">{c.name}{c.isPrimary && <span className="pill pill-brand" style={{ marginLeft: 6, padding: '1px 6px', fontSize: 9 }}>PRIMARY</span>}</div>
                    {c.role && <div className="list-row-sub">{c.role}</div>}
                    {c.phone && <div className="mono" style={{ fontSize: 11, color: 'var(--field-green)', marginTop: 4 }}>{c.phone}</div>}
                    {c.email && <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 2 }}>{c.email}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'billing' && (
          <div className="card-flat" style={{ margin: '0 16px 24px' }}>
            {opInvoices.length === 0 && <div style={{ padding: '20px 16px', color: 'var(--stone-500)', fontSize: 13 }}>No invoices.</div>}
            {opInvoices.map(inv => (
              <button key={inv.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('invoice-detail', { invoiceId: inv.id })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-row-title mono" style={{ fontSize: 12 }}>{inv.invoiceNumber ? `INV-${inv.invoiceNumber}` : `#${inv.id}`}</div>
                  <div className="list-row-sub">{inv.season || '—'} · {fmtDateShort(inv.sentAt)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{fmtMoney(inv.billedAmount || inv.calcAmount)}</div>
                  <div style={{ marginTop: 2 }}><StatusPill status={inv.status} /></div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── ORDERS ────────────────────────────────────────────────────────

const ORDER_STATUSES = ['Quote', 'Ordered', 'Shipped', 'Received', 'Fulfilled'];

function OrderFlowStrip({ orders }: { orders: MobileOrder[] }) {
  const counts: Record<string, number> = {};
  ORDER_STATUSES.forEach(s => { counts[s] = orders.filter(o => o.status === s).length; });
  return (
    <div style={{ margin: '0 16px 12px', padding: '10px 8px', background: 'var(--bone-raised)', border: '1px solid var(--border-1)', borderRadius: 12, display: 'flex', alignItems: 'center' }}>
      {ORDER_STATUSES.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: counts[s] > 0 ? 'var(--ink)' : 'var(--stone-300)', lineHeight: 1 }}>{counts[s]}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--stone-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{s}</div>
          </div>
          {i < ORDER_STATUSES.length - 1 && <div style={{ flexShrink: 0, color: 'var(--stone-300)', display: 'flex', alignItems: 'center' }}><I.chevron /></div>}
        </React.Fragment>
      ))}
    </div>
  );
}

function OrdersScreen({ data, nav }: { data: MobileData; nav: (s: ScreenName, p?: Record<string, unknown>) => void }) {
  const [tab, setTab] = useState<'open' | 'fulfilled' | 'all'>('open');
  const [showNew, setShowNew] = useState(false);

  const open = data.orders.filter(o => o.status !== 'Fulfilled');
  const fulfilled = data.orders.filter(o => o.status === 'Fulfilled');
  const list = tab === 'open' ? open : tab === 'fulfilled' ? fulfilled : data.orders;

  const totalOpen = open.reduce((s, o) => s + o.total, 0);
  const quotes = data.orders.filter(o => o.status === 'Quote').length;

  return (
    <>
      <TopBar title="Orders" onBack={() => nav('more')} right={<button className="ms-topbar-action" onClick={() => setShowNew(true)}><I.plus /></button>} />
      <div className="ms-body">
        <div style={{ padding: '8px 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="stat-label">Open value</div>
            <div className="stat-value warn" style={{ fontSize: 26, marginTop: 6 }}>{fmtMoney(totalOpen)}</div>
            <div className="stat-sub">{open.length} open orders</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="stat-label">Quotes out</div>
            <div className="stat-value" style={{ fontSize: 26, marginTop: 6 }}>{quotes}</div>
            <div className="stat-sub">Pending approval</div>
          </div>
        </div>

        <OrderFlowStrip orders={data.orders} />

        <div className="segment">
          <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>Open ({open.length})</button>
          <button className={tab === 'fulfilled' ? 'active' : ''} onClick={() => setTab('fulfilled')}>Fulfilled ({fulfilled.length})</button>
          <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All ({data.orders.length})</button>
        </div>

        {list.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--stone-500)' }}>No orders here.</div>}
        <div className="card-flat" style={{ margin: '0 16px 100px' }}>
          {list.map(o => (
            <button key={o.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('order-detail', { orderId: o.id })}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div className="list-row-title mono" style={{ fontSize: 12 }}>{o.id ? `ORD-${o.id}` : '—'}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.billingEntityName || o.operationName || 'Unknown'}</div>
                <div className="list-row-sub">{fmtDateShort(o.orderDate)} · {o.items.length} item{o.items.length !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>{fmtMoney(o.total)}</div>
                <div style={{ marginTop: 4 }}><StatusPill status={o.status} /></div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <button className="fab" onClick={() => setShowNew(true)}><I.plus /></button>
      {showNew && (
        <NewOrderSheet
          data={data}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); window.location.reload(); }}
        />
      )}
    </>
  );
}

function OrderDetailScreen({ data, orderId, goBack }: { data: MobileData; orderId: number; goBack: () => void }) {
  const o = data.orders.find(x => x.id === orderId);
  if (!o) return <div style={{ padding: 40 }}>Order not found</div>;

  const stepIdx = ORDER_STATUSES.indexOf(o.status);

  return (
    <>
      <TopBar title={o.billingEntityName || 'Order'} eyebrow={`Order #${o.id}`} onBack={goBack} />
      <div className="ms-body">
        <div style={{ padding: '12px 16px 8px' }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="stat-label">{o.operationName || o.billingEntityName}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, marginTop: 4 }}>{fmtMoneyFull(o.total)}</div>
              </div>
              <StatusPill status={o.status} />
            </div>
          </div>
        </div>

        {/* Progress dots */}
        <div className="order-strip">
          {ORDER_STATUSES.map((s, i) => (
            <div key={s} className="order-strip-step">
              {i > 0 && <div className={`order-strip-line ${i <= stepIdx ? 'done' : ''}`} />}
              <div className={`order-strip-dot ${i === stepIdx ? 'active' : i < stepIdx ? 'done' : ''}`}>
                {i < stepIdx ? <I.check /> : i + 1}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {ORDER_STATUSES.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: 'center', minWidth: 60, fontFamily: 'var(--font-mono)', fontSize: 9, color: i === stepIdx ? 'var(--field-green)' : 'var(--stone-400)', fontWeight: i === stepIdx ? 700 : 400, whiteSpace: 'nowrap' }}>{s}</div>
          ))}
        </div>

        <div className="section-label">Details</div>
        <div className="card-flat" style={{ margin: '0 16px 16px' }}>
          <MetaRow label="Order date" value={fmtDate(o.orderDate)} />
          <MetaRow label="Customer" value={o.billingEntityName} />
          {o.notes && <MetaRow label="Notes" value={o.notes} />}
        </div>

        <div className="section-label">Line items <span className="count">{o.items.length}</span></div>
        <div className="card-flat" style={{ margin: '0 16px 24px' }}>
          {o.items.map(item => (
            <div key={item.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="list-row-title" style={{ fontSize: 14 }}>{item.productName}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 4 }}>{item.quantity} × {fmtMoneyFull(item.unitPrice)}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{fmtMoneyFull(item.quantity * item.unitPrice)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── WATER RECS ────────────────────────────────────────────────────

function WaterRecsScreen({ data, nav, goBack }: { data: MobileData; nav: (s: ScreenName) => void; goBack: () => void }) {
  const dates = useMemo(() => {
    const s = new Set(data.waterRecs.map(w => w.date).filter(Boolean) as string[]);
    return Array.from(s).sort((a, b) => b.localeCompare(a)).slice(0, 8);
  }, [data.waterRecs]);

  const [selectedDate, setSelectedDate] = useState(dates[0] || '');
  const [showPicker, setShowPicker] = useState(false);

  const recs = data.waterRecs.filter(w => w.date === selectedDate);

  const byOp = useMemo(() => {
    const m = new Map<string, MobileWaterRec[]>();
    recs.forEach(r => {
      const key = r.operationName || 'Unknown';
      const list = m.get(key) || [];
      list.push(r);
      m.set(key, list);
    });
    return Array.from(m.entries());
  }, [recs]);

  return (
    <>
      <TopBar title="Water Recs" onBack={goBack} />
      <div className="ms-body">
        <div style={{ padding: '12px 16px 12px' }}>
          <button className="card" onClick={() => setShowPicker(!showPicker)} style={{ width: '100%', padding: 14, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--field-green)', color: 'var(--bone)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><I.cal /></div>
            <div style={{ flex: 1 }}>
              <div className="stat-label">Report date</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, textTransform: 'uppercase', marginTop: 2 }}>{selectedDate ? fmtDate(selectedDate) : 'Select a date'}</div>
            </div>
            <I.chevDown />
          </button>
          {showPicker && dates.length > 0 && (
            <div className="card" style={{ marginTop: 8, padding: 8 }}>
              {dates.map(d => (
                <button key={d} onClick={() => { setSelectedDate(d); setShowPicker(false); }} style={{ width: '100%', padding: '10px 12px', textAlign: 'left', borderRadius: 8, background: d === selectedDate ? 'var(--sage-wash)' : 'transparent', color: d === selectedDate ? 'var(--field-green)' : 'var(--ink)', fontWeight: d === selectedDate ? 600 : 400 }}>{fmtDate(d)}</button>
              ))}
            </div>
          )}
        </div>

        {recs.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--stone-500)' }}>{selectedDate ? 'No recs for this date.' : 'Select a date above.'}</div>}

        {byOp.map(([opName, opRecs]) => {
          const initials = opName.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
          return (
            <div key={opName}>
              <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar initials={initials} tone="sage" size={24} />
                <span>{opName}</span>
                <span className="count">{opRecs.length}</span>
              </div>
              <div className="card-flat" style={{ margin: '0 16px 16px' }}>
                {opRecs.map(r => (
                  <div key={r.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sage-wash)', color: 'var(--moist)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.drop /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="list-row-title">{r.fieldName}</div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4, fontWeight: 500 }}>{r.recommendation}</div>
                      {r.suggestedWaterDay && <div className="mono" style={{ fontSize: 10, color: 'var(--stone-500)', marginTop: 4 }}>Day: {r.suggestedWaterDay}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── BILLING ───────────────────────────────────────────────────────

function BillingScreen({ data, nav, goBack }: { data: MobileData; nav: (s: ScreenName, p?: Record<string, unknown>) => void; goBack: () => void }) {
  const [tab, setTab] = useState<'open' | 'paid'>('open');

  const open = data.invoices.filter(i => ['Sent', 'Overdue', 'Partially Paid', 'Draft'].includes(i.status));
  const paid = data.invoices.filter(i => i.status === 'Paid');
  const list = tab === 'open' ? open : paid;

  const totalOpen = open.reduce((s, i) => s + (i.billedAmount || i.calcAmount), 0);
  const totalPaid = paid.reduce((s, i) => s + (i.billedAmount || i.calcAmount), 0);
  const unmatched = data.invoices.filter(i => !i.matchedInQb && i.status !== 'Draft').length;

  return (
    <>
      <TopBar title="Billing" onBack={goBack} />
      <div className="ms-body">
        <div style={{ padding: '8px 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="stat-label">Outstanding</div>
            <div className="stat-value warn" style={{ fontSize: 22, marginTop: 6 }}>{fmtMoney(totalOpen)}</div>
            <div className="stat-sub">{open.length} invoices</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="stat-label">Collected</div>
            <div className="stat-value healthy" style={{ fontSize: 22, marginTop: 6 }}>{fmtMoney(totalPaid)}</div>
            <div className="stat-sub">{paid.length} invoices</div>
          </div>
        </div>

        {unmatched > 0 && (
          <div className="banner banner-warn" style={{ margin: '0 16px 12px' }}>
            <I.x />
            <div style={{ flex: 1 }}><b>{unmatched}</b> invoice{unmatched !== 1 ? 's' : ''} not matched to QuickBooks</div>
          </div>
        )}

        <div className="segment">
          <button className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>Open ({open.length})</button>
          <button className={tab === 'paid' ? 'active' : ''} onClick={() => setTab('paid')}>Paid ({paid.length})</button>
        </div>

        <div className="card-flat" style={{ margin: '0 16px 24px' }}>
          {list.length === 0 && <div style={{ padding: '20px 16px', color: 'var(--stone-500)', fontSize: 13 }}>No invoices.</div>}
          {list.map(inv => (
            <button key={inv.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => nav('invoice-detail', { invoiceId: inv.id })}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div className="list-row-title mono" style={{ fontSize: 12 }}>{inv.invoiceNumber ? `INV-${inv.invoiceNumber}` : `#${inv.id}`}</div>
                  {!inv.matchedInQb && inv.status !== 'Draft' && <span className="pill pill-warn" style={{ padding: '1px 6px', fontSize: 9 }}>QB</span>}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{inv.operationName || inv.billingEntityName}</div>
                <div className="list-row-sub">{inv.season ? `${inv.season} · ` : ''}{inv.status === 'Draft' ? 'Draft' : `Sent ${fmtDateShort(inv.sentAt)}`}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>{fmtMoney(inv.billedAmount || inv.calcAmount)}</div>
                <div style={{ marginTop: 4 }}><StatusPill status={inv.status} /></div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function InvoiceDetailScreen({ data, invoiceId, goBack }: { data: MobileData; invoiceId: number; goBack: () => void }) {
  const inv = data.invoices.find(i => i.id === invoiceId);
  if (!inv) return <div style={{ padding: 40 }}>Invoice not found</div>;

  return (
    <>
      <TopBar title={inv.invoiceNumber ? `INV-${inv.invoiceNumber}` : `Invoice #${inv.id}`} eyebrow="Invoice" onBack={goBack} />
      <div className="ms-body">
        <div style={{ padding: '12px 16px 16px' }}>
          <div className="card" style={{ padding: 18 }}>
            <div className="stat-label">{inv.billingEntityName}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, lineHeight: 1 }}>{fmtMoneyFull(inv.billedAmount || inv.calcAmount)}</div>
              <StatusPill status={inv.status} />
            </div>
            {inv.billedAmount && inv.billedAmount !== inv.calcAmount && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 6 }}>
                Calculated {fmtMoneyFull(inv.calcAmount)} · adjusted to {fmtMoneyFull(inv.billedAmount)}
              </div>
            )}
          </div>
        </div>

        <div className="section-label">Timeline</div>
        <div className="card-flat" style={{ margin: '0 16px 16px' }}>
          <MetaRow label="Sent" value={fmtDate(inv.sentAt)} />
          <MetaRow label="Paid" value={fmtDate(inv.paidAt)} />
          <MetaRow label="Deposited" value={fmtDate(inv.depositAt)} />
          {inv.checkNumber && <MetaRow label="Check #" value={String(inv.checkNumber)} />}
        </div>

        <div className="section-label">QuickBooks</div>
        <div className="card-flat" style={{ margin: '0 16px 16px' }}>
          <div className="list-row">
            <div style={{ width: 36, height: 36, borderRadius: 8, background: inv.matchedInQb ? 'var(--sage-wash)' : '#F5E5CC', color: inv.matchedInQb ? 'var(--healthy)' : 'var(--dry)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {inv.matchedInQb ? <I.check /> : <I.x />}
            </div>
            <div style={{ flex: 1 }}>
              <div className="list-row-title">{inv.matchedInQb ? 'Matched to QuickBooks' : 'Not matched'}</div>
              <div className="list-row-sub">{inv.matchedInQb ? 'Reconciled' : 'Needs reconciliation'}</div>
            </div>
          </div>
        </div>

        {inv.lineItems.length > 0 && (
          <>
            <div className="section-label">Line items <span className="count">{inv.lineItems.length}</span></div>
            <div className="card-flat" style={{ margin: '0 16px 24px' }}>
              {inv.lineItems.map(li => (
                <div key={li.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-row-title" style={{ fontSize: 14 }}>{li.fieldName}</div>
                    <div className="list-row-sub">{li.service}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 4 }}>{li.qty} × {fmtMoneyFull(li.rate)}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{fmtMoneyFull(li.total)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── SEASON READINESS ──────────────────────────────────────────────

function SeasonReadinessScreen({ data, goBack }: { data: MobileData; goBack: () => void }) {
  const totalOps = data.operations.length;
  const active = data.operations.filter(o => o.status === 'returning' || o.status === 'new').length;
  const probesInstalled = data.installStats.totalInstalled;
  const probesPlanned = data.installStats.totalPlanned;

  const tasks = [
    { label: 'Renewal calls completed', sub: `${data.operations.filter(o => o.status === 'returning').length} returning`, done: data.operations.filter(o => o.status === 'returning').length > 0 },
    { label: 'Operations booked for 2026', sub: `${active} of ${totalOps}`, done: active > 0 },
    { label: 'Probes installed', sub: probesPlanned > 0 ? `${probesInstalled} of ${probesPlanned}` : 'No probe assignments yet', done: probesInstalled > 0 && probesInstalled === probesPlanned },
    { label: 'Open repairs resolved', sub: `${data.repairs.filter(r => r.status === 'open').length} open`, done: data.repairs.filter(r => r.status === 'open').length === 0 },
    { label: 'Invoices matched to QuickBooks', sub: `${data.invoices.filter(i => !i.matchedInQb && i.status !== 'Draft').length} unmatched`, done: data.invoices.filter(i => !i.matchedInQb && i.status !== 'Draft').length === 0 },
    { label: 'Outstanding payments', sub: `${data.invoices.filter(i => ['Sent', 'Overdue'].includes(i.status)).length} open invoices`, done: data.invoices.filter(i => ['Sent', 'Overdue'].includes(i.status)).length === 0 },
  ];

  const done = tasks.filter(t => t.done).length;

  return (
    <>
      <TopBar title="Season Readiness" eyebrow="2026" onBack={goBack} />
      <div className="ms-body">
        <div className="hero-green" style={{ margin: '8px 16px 16px' }}>
          <div className="label">Operations confirmed</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div className="big" style={{ fontSize: 48 }}>{active}</div>
            <div style={{ opacity: 0.7, fontFamily: 'var(--font-mono)', fontSize: 12 }}>/ {totalOps}</div>
          </div>
          <div className="progress"><div className="progress-fill" style={{ width: `${totalOps ? Math.round(active / totalOps * 100) : 0}%` }} /></div>
          <div className="meta">
            <span>{tasks.filter(t => t.done).length} of {tasks.length} tasks done</span>
            <span>Target: May 15</span>
          </div>
        </div>

        <div className="section-label">Readiness checklist</div>
        <div className="card-flat" style={{ margin: '0 16px 24px' }}>
          {tasks.map((t, i) => (
            <div key={i} className={`check-tile ${t.done ? 'done' : ''}`}>
              <div className={`check-box ${t.done ? 'checked' : ''}`}>{t.done && <I.check />}</div>
              <div style={{ flex: 1 }}>
                <div className="check-tile-title">{t.label}</div>
                {t.sub && <div className="check-tile-sub">{t.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── APP SHELL ─────────────────────────────────────────────────────

export default function MobileApp({ data }: { data: MobileData }) {
  const [stack, setStack] = useState<StackEntry[]>([{ screen: 'dashboard', params: {} }]);
  const top = stack[stack.length - 1];

  const nav = useCallback((screen: ScreenName, params: Record<string, unknown> = {}) => {
    const tabRoots: ScreenName[] = ['dashboard', 'fields', 'probes', 'repairs', 'more'];
    if (tabRoots.includes(screen)) {
      setStack([{ screen, params }]);
    } else {
      setStack(s => [...s, { screen, params }]);
    }
  }, []);

  const goBack = useCallback(() => {
    setStack(s => s.length > 1 ? s.slice(0, -1) : s);
  }, []);

  const rootMap: Record<string, ScreenName> = {
    'field-detail': 'fields',
    'probe-detail': 'probes',
    'op-detail': 'more',
    'crm': 'more',
    'water': 'more',
    'billing': 'more',
    'orders': 'more',
    'order-detail': 'more',
    'invoice-detail': 'more',
    'season': 'fields',
  };
  const activeTab: ScreenName = rootMap[top.screen] || ((['dashboard', 'fields', 'probes', 'repairs', 'more'] as ScreenName[]).includes(top.screen) ? top.screen : 'dashboard');

  function renderScreen() {
    const { screen, params } = top;
    switch (screen) {
      case 'dashboard': return <DashboardScreen data={data} nav={nav} />;
      case 'fields': return <FieldsScreen data={data} nav={nav} />;
      case 'field-detail': return <FieldDetailScreen data={data} fieldId={params.fieldId as number} nav={nav} goBack={goBack} />;
      case 'probes': return <ProbesScreen data={data} nav={nav} />;
      case 'probe-detail': return <ProbeDetailScreen data={data} probeId={params.probeId as number} nav={nav} goBack={goBack} />;
      case 'repairs': return params.repairId
        ? <RepairDetailScreen data={data} repairId={params.repairId as number} goBack={goBack} />
        : <RepairsScreen data={data} nav={nav} />;
      case 'more': return <MoreScreen data={data} nav={nav} />;
      case 'crm': return <CRMScreen data={data} filter={params.filter as string} nav={nav} />;
      case 'op-detail': return <OpDetailScreen data={data} opId={params.opId as number} nav={nav} goBack={goBack} />;
      case 'orders': return <OrdersScreen data={data} nav={nav} />;
      case 'order-detail': return <OrderDetailScreen data={data} orderId={params.orderId as number} goBack={goBack} />;
      case 'water': return <WaterRecsScreen data={data} nav={nav} goBack={goBack} />;
      case 'billing': return <BillingScreen data={data} nav={nav} goBack={goBack} />;
      case 'invoice-detail': return <InvoiceDetailScreen data={data} invoiceId={params.invoiceId as number} goBack={goBack} />;
      case 'season': return <SeasonReadinessScreen data={data} goBack={goBack} />;
      default: return <DashboardScreen data={data} nav={nav} />;
    }
  }

  return (
    <div className="ms">
      {renderScreen()}
      <TabBar active={activeTab} nav={nav} />
    </div>
  );
}
