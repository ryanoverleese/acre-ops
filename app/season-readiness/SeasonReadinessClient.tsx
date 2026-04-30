'use client';

import { useState, useMemo } from 'react';
import type { ReadinessRow } from './page';

interface Props {
  rows: ReadinessRow[];
  year: number;
}

type Filter = 'all' | 'incomplete' | 'ready' | 'installed';
type SortCol = 'fieldName' | 'operation' | 'crop' | 'plantingDate' | 'hybridVariety' | 'installer' | 'approvalStatus' | 'status';
type SortDir = 'asc' | 'desc';

function formatPlantDate(dateStr: string): string {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return `${month}/${day}/${year}`;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: 6, fontSize: 12, fontWeight: 700,
        background: ok ? '#dcfce7' : '#fee2e2',
        color: ok ? '#15803d' : '#dc2626',
        marginRight: 3,
      }}
    >
      {ok ? '✓' : '✗'}
    </span>
  );
}

function ProbeLocationBadge({ loc }: { loc: ReadinessRow['probe1Location'] }) {
  if (loc === 'none') return <span style={{ color: '#c7c7cc' }}>—</span>;
  const map = {
    'on-rack':  { label: 'On Rack',  bg: '#dcfce7', color: '#15803d' },
    'on-order': { label: 'On Order', bg: '#fef9c3', color: '#92400e' },
    'in-field': { label: 'In Field', bg: '#dbeafe', color: '#1d4ed8' },
  };
  const s = map[loc];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, marginRight: 3,
    }}>
      {s.label}
    </span>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    'Approved':          { bg: '#dcfce7', color: '#15803d' },
    'Pending':           { bg: '#f3f4f6', color: '#6b7280' },
    'Change Requested':  { bg: '#fee2e2', color: '#dc2626' },
    'No Probes':         { bg: '#f3f4f6', color: '#9ca3af' },
  };
  const s = map[status] || { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, background: s.bg, color: s.color,
    }}>
      {status}
    </span>
  );
}

function InlineEditCell({
  fieldSeasonId, value, field, type = 'text', onSaved,
}: {
  fieldSeasonId: number; value: string; field: string; type?: 'text' | 'date'; onSaved: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: trimmed || null }),
      });
      onSaved(trimmed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <td style={{ padding: '2px 8px' }}>
        <input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          disabled={saving}
          autoFocus
          style={{
            fontSize: 13, padding: '2px 6px', width: type === 'date' ? 130 : 140,
            border: '1px solid #0071e3', borderRadius: 4, outline: 'none',
          }}
        />
      </td>
    );
  }

  const display = type === 'date' && value ? formatPlantDate(value) : value;
  return (
    <td
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
      style={{ fontSize: 13, cursor: 'text' }}
    >
      {display || <span style={{ color: '#c7c7cc', fontStyle: 'italic' }}>—</span>}
    </td>
  );
}

function SortTh({
  label, col, sortCol, sortDir, onSort, style,
}: {
  label: string;
  col: SortCol;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  style?: React.CSSProperties;
}) {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
      <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 10 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  );
}

export default function SeasonReadinessClient({ rows: initialRows, year }: Props) {
  const [rows, setRows] = useState<ReadinessRow[]>(initialRows);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('fieldName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function updateRow(fieldSeasonId: number, patch: Partial<ReadinessRow>) {
    setRows((prev) => prev.map((r) => r.fieldSeasonId === fieldSeasonId ? { ...r, ...patch } : r));
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  const total      = rows.length;
  const installed  = rows.filter((r) => r.installed).length;
  const ready      = rows.filter((r) => !r.installed && r.readyScore === r.totalChecks).length;
  const incomplete = rows.filter((r) => !r.installed && r.readyScore < r.totalChecks).length;

  const missingProbe     = rows.filter((r) => !r.installed && (!r.probe1 || (r.hasProbe2 && !r.probe2))).length;
  const missingAntenna   = rows.filter((r) => !r.installed && (!r.antenna1 || (r.hasProbe2 && !r.antenna2))).length;
  const missingBattery   = rows.filter((r) => !r.installed && (!r.battery1 || (r.hasProbe2 && !r.battery2))).length;
  const missingInstaller = rows.filter((r) => !r.installed && !r.plannedInstaller && !r.installer).length;
  const missingApproval  = rows.filter((r) => !r.installed && !r.locationApproved).length;
  const missingCrop      = rows.filter((r) => !r.installed && !r.crop).length;
  const missingPlantDate = rows.filter((r) => !r.installed && !r.plantingDate).length;

  const filtered = useMemo(() => {
    let result = rows;
    if (filter === 'incomplete') result = result.filter((r) => !r.installed && r.readyScore < r.totalChecks);
    if (filter === 'ready')      result = result.filter((r) => !r.installed && r.readyScore === r.totalChecks);
    if (filter === 'installed')  result = result.filter((r) => r.installed);
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
        case 'fieldName':      av = a.fieldName; bv = b.fieldName; break;
        case 'operation':      av = a.operation; bv = b.operation; break;
        case 'crop':           av = a.crop || ''; bv = b.crop || ''; break;
        case 'plantingDate':   av = a.plantingDate || ''; bv = b.plantingDate || ''; break;
        case 'hybridVariety':  av = a.hybridVariety || ''; bv = b.hybridVariety || ''; break;
        case 'installer':      av = a.installer || a.plannedInstaller || ''; bv = b.installer || b.plannedInstaller || ''; break;
        case 'approvalStatus': av = a.approvalStatus; bv = b.approvalStatus; break;
        case 'status':
          // installed > ready > incomplete, then by score
          av = a.installed ? 2 : a.readyScore === a.totalChecks ? 1 : 0;
          bv = b.installed ? 2 : b.readyScore === b.totalChecks ? 1 : 0;
          if (av === bv) return (a.readyScore - b.readyScore) * dir;
          break;
      }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });

    return result;
  }, [rows, filter, search, sortCol, sortDir]);

  const sortProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Total Fields</div>
          <div className="stat-value blue">{total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Installed</div>
          <div className="stat-value green">{installed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ready to Install</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{ready}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Incomplete</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>{incomplete}</div>
        </div>
      </div>

      {(missingProbe > 0 || missingAntenna > 0 || missingBattery > 0 || missingInstaller > 0 || missingApproval > 0 || missingCrop > 0 || missingPlantDate > 0) && (
        <div style={{
          background: '#fff', border: '1px solid #fee2e2', borderRadius: 10,
          padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13,
        }}>
          <span style={{ fontWeight: 600, color: '#86868b', marginRight: 4 }}>Gaps:</span>
          {missingCrop > 0      && <span style={{ color: '#dc2626' }}>No crop: <strong>{missingCrop}</strong></span>}
          {missingPlantDate > 0 && <span style={{ color: '#dc2626' }}>No plant date: <strong>{missingPlantDate}</strong></span>}
          {missingProbe > 0     && <span style={{ color: '#dc2626' }}>No probe: <strong>{missingProbe}</strong></span>}
          {missingAntenna > 0   && <span style={{ color: '#dc2626' }}>No antenna: <strong>{missingAntenna}</strong></span>}
          {missingBattery > 0   && <span style={{ color: '#dc2626' }}>No battery: <strong>{missingBattery}</strong></span>}
          {missingInstaller > 0 && <span style={{ color: '#dc2626' }}>No installer: <strong>{missingInstaller}</strong></span>}
          {missingApproval > 0  && <span style={{ color: '#dc2626' }}>Not approved: <strong>{missingApproval}</strong></span>}
        </div>
      )}

      <div className="table-container">
        <div className="table-header">
          <h3 className="table-title">Fields ({filtered.length})</h3>
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
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'incomplete', 'ready', 'installed'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: 12 }}
                >
                  {f === 'all' ? 'All' : f === 'incomplete' ? 'Incomplete' : f === 'ready' ? 'Ready' : 'Installed'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <table className="desktop-table">
          <thead>
            <tr>
              <SortTh label="Field"      col="fieldName"      {...sortProps} />
              <SortTh label="Operation"  col="operation"      {...sortProps} />
              <SortTh label="Crop"       col="crop"           {...sortProps} />
              <SortTh label="Hybrid"     col="hybridVariety"  {...sortProps} />
              <SortTh label="Plant Date" col="plantingDate"   {...sortProps} />
              <SortTh label="Installer"  col="installer"      {...sortProps} />
              <th style={{ textAlign: 'center' }}>Probe</th>
              <th style={{ textAlign: 'center' }}>Antenna</th>
              <th style={{ textAlign: 'center' }}>Battery</th>
              <SortTh label="Approval"   col="approvalStatus" {...sortProps} style={{ textAlign: 'center' }} />
              <th>Probe Location</th>
              <SortTh label="Status"     col="status"         {...sortProps} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '24px', color: '#86868b' }}>
                  No fields found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const statusColor = row.installed ? '#15803d' : row.readyScore === row.totalChecks ? '#f59e0b' : '#dc2626';
                const statusLabel = row.installed ? 'Installed' : row.readyScore === row.totalChecks ? 'Ready' : `${row.readyScore}/${row.totalChecks}`;
                const statusBg    = row.installed ? '#dcfce7' : row.readyScore === row.totalChecks ? '#fef9c3' : '#fee2e2';
                const installerDisplay = row.installer || row.plannedInstaller;

                return (
                  <tr key={row.fieldSeasonId}>
                    <td className="operation-name">{row.fieldName}</td>
                    <td style={{ color: '#86868b', fontSize: 13 }}>{row.operation}</td>
                    <td style={{ fontSize: 13 }}>{row.crop || <span style={{ color: '#c7c7cc' }}>—</span>}</td>
                    <InlineEditCell fieldSeasonId={row.fieldSeasonId} value={row.hybridVariety} field="hybrid_variety"
                      onSaved={(v) => updateRow(row.fieldSeasonId, { hybridVariety: v })} />
                    <InlineEditCell fieldSeasonId={row.fieldSeasonId} value={row.plantingDate} field="planting_date" type="date"
                      onSaved={(v) => updateRow(row.fieldSeasonId, { plantingDate: v })} />
                    <td style={{ fontSize: 13 }}>{installerDisplay || <span style={{ color: '#c7c7cc' }}>—</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      <Check ok={row.probe1} label="Probe 1 assigned" />
                      {row.hasProbe2 && <Check ok={row.probe2} label="Probe 2 assigned" />}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Check ok={row.antenna1} label="Antenna 1 type" />
                      {row.hasProbe2 && <Check ok={row.antenna2} label="Antenna 2 type" />}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Check ok={row.battery1} label="Battery 1 type" />
                      {row.hasProbe2 && <Check ok={row.battery2} label="Battery 2 type" />}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ApprovalBadge status={row.approvalStatus} />
                    </td>
                    <td>
                      <ProbeLocationBadge loc={row.probe1Location} />
                      {row.hasProbe2 && <ProbeLocationBadge loc={row.probe2Location} />}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                        fontSize: 12, fontWeight: 600, background: statusBg, color: statusColor,
                      }}>
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div className="mobile-cards">
          {filtered.map((row) => {
            const installerDisplay = row.installer || row.plannedInstaller;
            const statusColor = row.installed ? '#15803d' : row.readyScore === row.totalChecks ? '#f59e0b' : '#dc2626';
            const statusLabel = row.installed ? 'Installed' : row.readyScore === row.totalChecks ? 'Ready' : `${row.readyScore}/${row.totalChecks} checks`;
            return (
              <div key={row.fieldSeasonId} className="mobile-card">
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{row.fieldName}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row"><span>Operation:</span><span>{row.operation}</span></div>
                  <div className="mobile-card-row"><span>Installer:</span><span>{installerDisplay || '—'}</span></div>
                  <div className="mobile-card-row"><span>Approval:</span><ApprovalBadge status={row.approvalStatus} /></div>
                  <div className="mobile-card-row">
                    <span>Probe:</span>
                    <span><ProbeLocationBadge loc={row.probe1Location} />{row.hasProbe2 && <ProbeLocationBadge loc={row.probe2Location} />}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span>Checks:</span>
                    <span style={{ display: 'flex', gap: 2 }}>
                      <Check ok={row.probe1} label="Probe" />
                      <Check ok={row.antenna1} label="Antenna" />
                      <Check ok={row.battery1} label="Battery" />
                      <Check ok={row.locationApproved} label="Approved" />
                      {row.hasProbe2 && <Check ok={row.probe2} label="Probe 2" />}
                      {row.hasProbe2 && <Check ok={row.antenna2} label="Antenna 2" />}
                      {row.hasProbe2 && <Check ok={row.battery2} label="Battery 2" />}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
