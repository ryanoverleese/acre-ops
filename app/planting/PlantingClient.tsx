'use client';

import { useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { PlantingRow } from './page';
import type { ColorMode } from './PlantingMapView';
import { useResizableColumns } from '@/hooks/useResizableColumns';

const DEFAULT_COLUMN_WIDTHS = {
  fieldName: 160, operation: 140, crop: 100, plantingDate: 110,
  daysSince: 70, gdu: 70, stage: 90, group: 60, routeOrder: 80, plannedInstaller: 130,
} as const;
const COL_STORAGE_KEY = 'planting-column-widths';

const PlantingMapView = dynamic(() => import('./PlantingMapView'), { ssr: false });

interface Props {
  rows: PlantingRow[];
  installerOptions: string[];
}

type SortCol = 'fieldName' | 'operation' | 'crop' | 'plantingDate' | 'daysSince' | 'gdu' | 'installGroup' | 'routeOrder' | 'plannedInstaller';
type SortDir = 'asc' | 'desc';

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return `${month}/${day}/${year}`;
}

const CORN_STAGES: [number, string][] = [
  [0,    'Pre-VE'],
  [100,  'VE'],
  [200,  'V1'],
  [285,  'V2'],
  [370,  'V3'],
  [455,  'V4'],
  [540,  'V5'],
  [625,  'V6'],
  [710,  'V7'],
  [795,  'V8'],
  [880,  'V9'],
  [965,  'V10'],
  [1050, 'V11'],
  [1135, 'VT'],
  [1400, 'R1'],
  [1560, 'R2'],
  [1750, 'R3'],
  [2020, 'R4'],
  [2300, 'R5'],
  [2700, 'R6'],
];

const SOY_STAGES: [number, string][] = [
  [0,    'Pre-VE'],
  [130,  'VE'],
  [160,  'VC'],
  [240,  'V1'],
  [320,  'V2'],
  [400,  'V3'],
  [480,  'V4'],
  [560,  'V5'],
  [660,  'R1'],
  [750,  'R2'],
  [860,  'R3'],
  [990,  'R4'],
  [1130, 'R5'],
  [1310, 'R6'],
  [1500, 'R7'],
  [1620, 'R8'],
];

function growthStage(gdu: number | null, crop: string): string | null {
  if (gdu == null) return null;
  const c = crop.toLowerCase();
  const stages = c.includes('corn') ? CORN_STAGES : c.includes('soy') ? SOY_STAGES : null;
  if (!stages) return null;
  let stage = stages[0][1];
  for (const [threshold, label] of stages) {
    if (gdu >= threshold) stage = label;
    else break;
  }
  return stage;
}

function daysSince(dateStr: string): number {
  const planted = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - planted.getTime()) / 86400000));
}

function SortTh({
  label, col, sortCol, sortDir, onSort, style,
  resizeKey, onResizeStart, onResetWidth, resizing,
}: {
  label: string; col: SortCol; sortCol: SortCol; sortDir: SortDir;
  onSort: (col: SortCol) => void; style?: React.CSSProperties;
  resizeKey?: string;
  onResizeStart?: (key: string, e: React.MouseEvent) => void;
  onResetWidth?: (key: string) => void;
  resizing?: boolean;
}) {
  const active = sortCol === col;
  return (
    <th className={resizeKey ? 'th-resizable' : ''} style={{ whiteSpace: 'nowrap', ...style }}>
      <span onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}
        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
        </span>
      </span>
      {resizeKey && onResizeStart && onResetWidth && (
        <div
          className={`resize-handle${resizing ? ' active' : ''}`}
          onMouseDown={(e) => onResizeStart(resizeKey, e)}
          onDoubleClick={() => onResetWidth(resizeKey)}
          title="Drag to resize, double-click to reset"
        />
      )}
    </th>
  );
}

function InstallerCell({
  fieldSeasonId, value, options, onSaved,
}: {
  fieldSeasonId: number; value: string; options: string[]; onSaved: (v: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function pick(name: string) {
    if (name === value) return;
    setSaving(true);
    try {
      await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planned_installer: name }),
      });
      onSaved(name);
    } finally {
      setSaving(false);
    }
  }

  const initial = (name: string) => name.charAt(0).toUpperCase();

  return (
    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {options.map((o) => (
          <button
            key={o}
            onClick={() => pick(o)}
            disabled={saving}
            title={o}
            style={{
              width: 28, height: 28, borderRadius: '50%', border: 'none',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: value === o ? '#0071e3' : '#e5e5ea',
              color: value === o ? '#fff' : '#1d1d1f',
            }}
          >
            {initial(o)}
          </button>
        ))}
        {value && (
          <button
            onClick={() => pick('')}
            disabled={saving}
            title="Clear"
            style={{
              width: 28, height: 28, borderRadius: '50%', border: '1px solid #e5e5ea',
              fontSize: 11, cursor: 'pointer', background: '#fff', color: '#86868b',
            }}
          >
            ✕
          </button>
        )}
      </div>
    </td>
  );
}

function RouteCell({
  fieldSeasonId, value, onSaved,
}: {
  fieldSeasonId: number; value: string | null; onSaved: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value ?? '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    const trimmed = draft.trim() || null;
    if (trimmed === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route_order: trimmed }),
      });
      onSaved(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <td style={{ textAlign: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          disabled={saving}
          style={{
            width: 70, fontSize: 13, padding: '2px 4px', textAlign: 'center',
            border: '1px solid #0071e3', borderRadius: 4, outline: 'none',
          }}
          autoFocus
        />
      </td>
    );
  }

  return (
    <td
      onClick={startEdit}
      title="Click to edit"
      style={{ fontSize: 13, cursor: 'text', textAlign: 'center', color: !value ? '#c7c7cc' : undefined }}
    >
      {value || '—'}
    </td>
  );
}

export default function PlantingClient({ rows: initialRows, installerOptions }: Props) {
  const { columnWidths, resizingColumn, handleResizeStart, handleResetColumnWidth } = useResizableColumns({
    defaultWidths: DEFAULT_COLUMN_WIDTHS,
    storageKey: COL_STORAGE_KEY,
  });
  const [rows, setRows] = useState<PlantingRow[]>(initialRows);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('plantingDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showMap, setShowMap] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>('installer');
  const [installerFilter, setInstallerFilter] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  function updateRow(fieldSeasonId: number, patch: Partial<PlantingRow>) {
    setRows((prev) => prev.map((r) => r.fieldSeasonId === fieldSeasonId ? { ...r, ...patch } : r));
  }

  const filtered = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) =>
        r.fieldName.toLowerCase().includes(q) ||
        r.operation.toLowerCase().includes(q) ||
        r.plannedInstaller.toLowerCase().includes(q) ||
        (r.installGroup != null && r.plannedInstaller
          ? `${r.plannedInstaller.charAt(0).toUpperCase()}${r.installGroup}`.toLowerCase().includes(q)
          : false)
      );
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortCol) {
        case 'fieldName':        av = a.fieldName; bv = b.fieldName; break;
        case 'operation':        av = a.operation; bv = b.operation; break;
        case 'crop':             av = a.crop; bv = b.crop; break;
        case 'plantingDate':     av = a.plantingDate; bv = b.plantingDate; break;
        case 'daysSince':        av = daysSince(a.plantingDate); bv = daysSince(b.plantingDate); break;
        case 'gdu':              av = a.gdu ?? -1; bv = b.gdu ?? -1; break;
        case 'installGroup':     av = a.installGroup ?? 999; bv = b.installGroup ?? 999; break;
        case 'routeOrder':       av = a.routeOrder || 'zzz'; bv = b.routeOrder || 'zzz'; break;
        case 'plannedInstaller': av = a.plannedInstaller; bv = b.plannedInstaller; break;
      }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });

    return result;
  }, [rows, search, sortCol, sortDir]);

  const mapRows = useMemo(() =>
    installerFilter
      ? filtered.filter((r) => r.plannedInstaller.toLowerCase() === installerFilter.toLowerCase())
      : filtered,
  [filtered, installerFilter]);

  const sortProps = {
    sortCol, sortDir, onSort: handleSort,
    onResizeStart: handleResizeStart as (key: string, e: React.MouseEvent) => void,
    onResetWidth: handleResetColumnWidth as (key: string) => void,
  };

  const totalFields = rows.length;
  const withPlantDate = rows.filter((r) => r.plantingDate).length;
  const withInstaller = rows.filter((r) => r.plannedInstaller).length;
  const withRoute = rows.filter((r) => !!r.routeOrder).length;

  // Per-installer field + probe counts, with per-group breakdown
  const installerStats = useMemo(() => {
    const map = new Map<string, { fields: number; probes: number; groups: Map<string, number> }>();
    for (const r of rows) {
      const name = r.plannedInstaller;
      if (!name) continue;
      const entry = map.get(name) ?? { fields: 0, probes: 0, groups: new Map() };
      entry.fields += 1;
      entry.probes += r.probeCount || 1;
      if (r.installGroup != null) {
        const gKey = `${name.charAt(0).toUpperCase()}${r.installGroup}`;
        entry.groups.set(gKey, (entry.groups.get(gKey) ?? 0) + (r.probeCount || 1));
      }
      map.set(name, entry);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Total Fields</div>
          <div className="stat-value blue">{totalFields}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Plant Dates Set</div>
          <div className="stat-value green">{withPlantDate}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Installer Assigned</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{withInstaller}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Route # Set</div>
          <div className="stat-value" style={{ color: '#6366f1' }}>{withRoute}</div>
        </div>
      </div>

      {installerStats.length > 0 && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16,
        }}>
          {installerStats.map(([name, stats]) => {
            const sortedGroups = [...stats.groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            return (
              <div key={name} style={{
                background: '#fff', border: '1px solid #e5e5ea', borderRadius: 10,
                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#0071e3',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f' }}>{name}</div>
                  <div style={{ fontSize: 12, color: '#86868b', marginTop: 1 }}>
                    {stats.fields} field{stats.fields !== 1 ? 's' : ''} · {stats.probes} probe{stats.probes !== 1 ? 's' : ''}
                  </div>
                  {sortedGroups.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {sortedGroups.map(([gKey, count]) => (
                        <span key={gKey} style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                          background: '#f0f4ff', color: '#3b5bdb', letterSpacing: '0.02em',
                        }}>
                          {gKey} <span style={{ fontWeight: 500, opacity: 0.75 }}>{count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Install Planning ({filtered.length})</h3>
          <div className="table-actions">
            <div className="search-box" style={{ minWidth: 180 }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search fields..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowMap((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: showMap ? '#0071e3' : '#e5e5ea',
                color: showMap ? '#fff' : '#1d1d1f',
              }}
            >
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              Map
            </button>
          </div>
        </div>

        {showMap && (
          <div style={{ padding: '0 0 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['installer', 'days', 'crop', 'group'] as ColorMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setColorMode(mode)}
                    style={{
                      padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600,
                      background: colorMode === mode ? '#1d1d1f' : '#e5e5ea',
                      color: colorMode === mode ? '#fff' : '#1d1d1f',
                    }}
                  >
                    {mode === 'installer' ? 'By Installer' : mode === 'days' ? 'By Days' : mode === 'crop' ? 'By Crop' : 'By Group'}
                  </button>
                ))}
              </div>

              <div style={{ borderLeft: '1px solid #e5e5ea', paddingLeft: 16 }}>
                <button
                  onClick={() => setShowLabels((v) => !v)}
                  style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    background: showLabels ? '#1d1d1f' : '#e5e5ea',
                    color: showLabels ? '#fff' : '#1d1d1f',
                  }}
                >
                  Labels
                </button>
              </div>

              {installerOptions.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid #e5e5ea', paddingLeft: 16 }}>
                  <span style={{ fontSize: 11, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Show</span>
                  <button
                    onClick={() => setInstallerFilter(null)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600,
                      background: installerFilter === null ? '#1d1d1f' : '#e5e5ea',
                      color: installerFilter === null ? '#fff' : '#1d1d1f',
                    }}
                  >
                    All
                  </button>
                  {installerOptions.map((name) => (
                    <button
                      key={name}
                      onClick={() => setInstallerFilter(installerFilter === name ? null : name)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600,
                        background: installerFilter === name ? '#0071e3' : '#e5e5ea',
                        color: installerFilter === name ? '#fff' : '#1d1d1f',
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ height: 520, borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
              <PlantingMapView
                rows={mapRows}
                colorMode={colorMode}
                showLabels={showLabels}
                onAssignInstaller={async (fieldSeasonId, installer) => {
                  updateRow(fieldSeasonId, { plannedInstaller: installer });
                  await fetch(`/api/field-seasons/${fieldSeasonId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ planned_installer: installer }),
                  });
                }}
                onAssignGroup={async (fieldSeasonId, group) => {
                  updateRow(fieldSeasonId, { installGroup: group });
                  await fetch(`/api/field-seasons/${fieldSeasonId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      install_group: group,
                      ...(group != null && { ready_to_install: true }),
                    }),
                  });
                }}
              />
            </div>
          </div>
        )}

        <table className="desktop-table" style={{ userSelect: resizingColumn ? 'none' : undefined }}>
          <colgroup>
            {(Object.keys(DEFAULT_COLUMN_WIDTHS) as (keyof typeof DEFAULT_COLUMN_WIDTHS)[]).map(k => (
              <col key={k} style={{ width: columnWidths[k] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <SortTh label="Field"      col="fieldName"        {...sortProps} resizeKey="fieldName"        resizing={resizingColumn === 'fieldName'} />
              <SortTh label="Operation"  col="operation"        {...sortProps} resizeKey="operation"        resizing={resizingColumn === 'operation'} />
              <SortTh label="Crop"       col="crop"             {...sortProps} resizeKey="crop"             resizing={resizingColumn === 'crop'} />
              <SortTh label="Plant Date" col="plantingDate"     {...sortProps} resizeKey="plantingDate"     resizing={resizingColumn === 'plantingDate'} />
              <SortTh label="Days"       col="daysSince"        {...sortProps} resizeKey="daysSince"        resizing={resizingColumn === 'daysSince'}  style={{ textAlign: 'center' }} />
              <SortTh label="GDU"        col="gdu"              {...sortProps} resizeKey="gdu"              resizing={resizingColumn === 'gdu'}         style={{ textAlign: 'center' }} />
              <th className="th-resizable" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                <span>Stage</span>
                <div className={`resize-handle${resizingColumn === 'stage' ? ' active' : ''}`} onMouseDown={(e) => handleResizeStart('stage', e)} onDoubleClick={() => handleResetColumnWidth('stage')} title="Drag to resize, double-click to reset" />
              </th>
              <SortTh label="Group"      col="installGroup"     {...sortProps} resizeKey="group"            resizing={resizingColumn === 'group'}       style={{ textAlign: 'center' }} />
              <SortTh label="Route #"    col="routeOrder"       {...sortProps} resizeKey="routeOrder"       resizing={resizingColumn === 'routeOrder'}  style={{ textAlign: 'center' }} />
              <SortTh label="Installer"  col="plannedInstaller" {...sortProps} resizeKey="plannedInstaller" resizing={resizingColumn === 'plannedInstaller'} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '24px', color: '#86868b' }}>
                  No fields found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.fieldSeasonId}>
                  <td className="operation-name">
                    {row.fieldName}
                    {row.probeCount > 1 && (
                      <span style={{
                        marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 5px',
                        borderRadius: 4, background: '#f59e0b', color: '#fff', verticalAlign: 'middle',
                      }}>
                        {row.probeCount}×
                      </span>
                    )}
                  </td>
                  <td style={{ color: '#86868b', fontSize: 13 }}>{row.operation}</td>
                  <td style={{ fontSize: 13 }}>{row.crop || <span style={{ color: '#c7c7cc' }}>—</span>}</td>
                  <td style={{ fontSize: 13 }}>{row.plantingDate ? formatDate(row.plantingDate) : <span style={{ color: '#c7c7cc' }}>—</span>}</td>
                  <td style={{ textAlign: 'center', fontSize: 13 }}>
                    {row.plantingDate ? daysSince(row.plantingDate) : <span style={{ color: '#c7c7cc' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
                    {row.gdu != null ? row.gdu : <span style={{ color: '#c7c7cc', fontWeight: 400 }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#0071e3' }}>
                    {growthStage(row.gdu, row.crop) ?? <span style={{ color: '#c7c7cc', fontWeight: 400 }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {row.installGroup != null && row.plannedInstaller ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                        background: '#f0f4ff', color: '#3b5bdb',
                      }}>
                        {row.plannedInstaller.charAt(0).toUpperCase()}{row.installGroup}
                      </span>
                    ) : (
                      <span style={{ color: '#c7c7cc' }}>—</span>
                    )}
                  </td>
                  <RouteCell
                    fieldSeasonId={row.fieldSeasonId}
                    value={row.routeOrder}
                    onSaved={(v) => updateRow(row.fieldSeasonId, { routeOrder: v })}
                  />
                  <InstallerCell
                    fieldSeasonId={row.fieldSeasonId}
                    value={row.plannedInstaller}
                    options={installerOptions}
                    onSaved={(v) => updateRow(row.fieldSeasonId, { plannedInstaller: v })}
                  />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
