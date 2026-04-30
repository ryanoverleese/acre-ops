'use client';

import { useState, useMemo, useRef } from 'react';
import type { PlantingRow } from './page';

interface Props {
  rows: PlantingRow[];
  installerOptions: string[];
}

type SortCol = 'fieldName' | 'operation' | 'crop' | 'plantingDate' | 'daysSince' | 'gdu' | 'routeOrder' | 'plannedInstaller';
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
}: {
  label: string; col: SortCol; sortCol: SortCol; sortDir: SortDir;
  onSort: (col: SortCol) => void; style?: React.CSSProperties;
}) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}>
      {label}
      <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  );
}

function InstallerCell({
  fieldSeasonId, value, options, onSaved,
}: {
  fieldSeasonId: number; value: string; options: string[]; onSaved: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planned_installer: draft }),
      });
      onSaved(draft);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    const listId = `installer-opts-${fieldSeasonId}`;
    return (
      <td style={{ padding: '2px 8px', minWidth: 140 }}>
        <datalist id={listId}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
        <input
          ref={inputRef}
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          disabled={saving}
          style={{
            width: 160, fontSize: 13, padding: '2px 6px',
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
      style={{
        fontSize: 13, cursor: 'text', minWidth: 120,
        color: value ? undefined : '#c7c7cc',
      }}
    >
      {value || <span style={{ fontStyle: 'italic' }}>click to set</span>}
    </td>
  );
}

function RouteCell({
  fieldSeasonId, value, onSaved,
}: {
  fieldSeasonId: number; value: number | null; onSaved: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(String(value ?? ''));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    const parsed = draft.trim() === '' ? null : parseInt(draft, 10);
    if (parsed === value || (draft.trim() !== '' && isNaN(parsed as number))) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route_order: parsed }),
      });
      onSaved(parsed);
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
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          disabled={saving}
          style={{
            width: 50, fontSize: 13, padding: '2px 4px', textAlign: 'center',
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
      style={{ fontSize: 13, cursor: 'text', textAlign: 'center', color: value == null ? '#c7c7cc' : undefined }}
    >
      {value ?? '—'}
    </td>
  );
}

export default function PlantingClient({ rows: initialRows, installerOptions }: Props) {
  const [rows, setRows] = useState<PlantingRow[]>(initialRows);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('plantingDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

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
        r.plannedInstaller.toLowerCase().includes(q)
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
        case 'routeOrder':       av = a.routeOrder ?? 9999; bv = b.routeOrder ?? 9999; break;
        case 'plannedInstaller': av = a.plannedInstaller; bv = b.plannedInstaller; break;
      }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });

    return result;
  }, [rows, search, sortCol, sortDir]);

  const sortProps = { sortCol, sortDir, onSort: handleSort };

  const totalFields = rows.length;
  const withPlantDate = rows.filter((r) => r.plantingDate).length;
  const withInstaller = rows.filter((r) => r.plannedInstaller).length;
  const withRoute = rows.filter((r) => r.routeOrder != null).length;

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

      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Planting ({filtered.length})</h3>
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
          </div>
        </div>

        <table className="desktop-table">
          <thead>
            <tr>
              <SortTh label="Field"      col="fieldName"        {...sortProps} />
              <SortTh label="Operation"  col="operation"        {...sortProps} />
              <SortTh label="Crop"       col="crop"             {...sortProps} />
              <SortTh label="Plant Date" col="plantingDate"     {...sortProps} />
              <SortTh label="Days"       col="daysSince"        {...sortProps} style={{ textAlign: 'center' }} />
              <SortTh label="GDU"        col="gdu"              {...sortProps} style={{ textAlign: 'center' }} />
              <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Stage</th>
              <SortTh label="Route #"    col="routeOrder"       {...sortProps} style={{ textAlign: 'center' }} />
              <SortTh label="Installer"  col="plannedInstaller" {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#86868b' }}>
                  No fields found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.fieldSeasonId}>
                  <td className="operation-name">{row.fieldName}</td>
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
