'use client';

import type { ReactNode } from 'react';
import type { NoteStage } from '@/lib/notes-thread';

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
  routeOrder: string;
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
  installNotes: string;
  accessNotes?: string;
  notesThread?: NoteStage[];
  status: string;
  plannedInstaller: string;
  installGroup: number | null;
}

export type Screen =
  | 'login' | 'route' | 'field' | 'install' | 'success' | 'map' | 'loadout'
  | 'me' | 'history' | 'mileage' | 'settings' | 'summary' | 'repairs'
  | 'locations' | 'probes' | 'removals';

export type MapProvider = 'google' | 'apple';
export type WorkflowMode = 'install' | 'remove';
export type HideableTab = 'loadout' | 'repairs';
export type Filter = 'todo' | 'done' | 'all';

export interface Session {
  installer: string;
  installerId: number;
  season: number;
  expiresAt?: number;
}

export interface SuccessData {
  fieldName: string;
  probeSerial: string;
  flags: { pink: number; blue: number; white: number };
}

export const MAP_PROVIDER_KEY = 'af-map-provider';
export const WORKFLOW_MODE_KEY = 'af-workflow-mode';
export const REMOVALS_SHOW_ALL_KEY = 'af-removals-show-all';
export const HIDDEN_TABS_KEY = 'af-hidden-tabs';
export const SESSION_KEY = 'installer-session-supabase-v1';

export function getMapProvider(): MapProvider {
  if (typeof window === 'undefined') return 'google';
  const v = localStorage.getItem(MAP_PROVIDER_KEY);
  return v === 'apple' ? 'apple' : 'google';
}

export function mapsUrlFor(lat: number, lng: number, provider: MapProvider): string {
  if (provider === 'apple') return `https://maps.apple.com/?q=${lat},${lng}&ll=${lat},${lng}`;
  return `https://maps.google.com/?q=${lat},${lng}`;
}

export function getWorkflowMode(): WorkflowMode {
  if (typeof window === 'undefined') return 'install';
  return localStorage.getItem(WORKFLOW_MODE_KEY) === 'remove' ? 'remove' : 'install';
}

export function saveWorkflowMode(mode: WorkflowMode) {
  try { localStorage.setItem(WORKFLOW_MODE_KEY, mode); } catch { /* private mode / quota */ }
}

export function getRemovalsShowAll(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(REMOVALS_SHOW_ALL_KEY) === '1';
}

export function loadHiddenTabs(): Set<HideableTab> {
  if (typeof window === 'undefined') return new Set();
  try {
    const arr = JSON.parse(localStorage.getItem(HIDDEN_TABS_KEY) || '[]');
    return new Set(Array.isArray(arr) ? arr.filter((t): t is HideableTab => t === 'loadout' || t === 'repairs') : []);
  } catch { return new Set(); }
}

export function saveHiddenTabs(tabs: Set<HideableTab>) {
  try { localStorage.setItem(HIDDEN_TABS_KEY, JSON.stringify([...tabs])); } catch { /* private mode / quota */ }
}

export function playSuccessSound() {
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
    note(523, 0, 0.18);
    note(659, 0.12, 0.18);
    note(784, 0.24, 0.40);
  } catch { /* silently ignore if audio unavailable */ }
}

export function probeBadgeColors(brand: string, antenna = ''): { bg: string; fg: string } {
  const combined = `${brand} ${antenna}`.toLowerCase();
  if (/gateway[^a-z]*small|small[^a-z]*diameter/.test(combined)) return { bg: '#EDE9FE', fg: '#6D28D9' };
  if (/gateway[^a-z]*large|large[^a-z]*diameter/.test(combined)) return { bg: '#FEF3C7', fg: '#92400E' };
  if (/sentek/.test(combined)) return { bg: '#DCFCE7', fg: '#166534' };
  if (/cropx\s*v\d|cropx\s*v(?!\w)|v4/.test(combined)) return { bg: '#DBEAFE', fg: '#1E40AF' };
  return { bg: 'var(--sage-wash)', fg: 'var(--field-green)' };
}

export const ANTENNA_OPTIONS = [
  'Sentek Stub',
  'CropX Stub',
  'CropX Stub + White Flag',
  'CropX Stub + No Flag',
  "Sentek 10'",
  "CropX 10'",
];

export function calcFlags(antennaType: string, sideDress: string) {
  const antenna = antennaType.toLowerCase();
  const sd = sideDress.toLowerCase();
  const hasCoulter = antenna.includes('coulter') || sd.includes('cultivat') || sd.includes('coulter');
  const hasStub = antenna.includes('stub');
  const white = hasStub && !hasCoulter ? 2 : 1;
  return { pink: 1, blue: 5, white };
}

export async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) { resolve(file); return; }
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        let { width, height } = img;
        const MAX_DIM = 1280;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), { type: 'image/jpeg' }) : file),
          'image/jpeg', 0.6
        );
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s.installer && s.installerId && s.expiresAt > Date.now() ? s : null;
  } catch { return null; }
}

export function saveSession(s: Session) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
export function clearSession() { localStorage.removeItem(SESSION_KEY); void fetch('/api/installer-auth', { method: 'DELETE' }); }

export function TopoDeco() {
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

export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
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

export function MenuRow({
  icon, label, sub, destructive, onClick, showChevron, last,
}: {
  icon: ReactNode; label: string; sub?: string;
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
