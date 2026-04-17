'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProbeRackSlot } from '@/lib/baserow';

export interface SimpleProbe {
  id: number;
  serialNumber: string;
  status: string;
  brand: string;
}

interface MoveSource {
  rowId: number;
  probeId: number;
  serialNumber: string;
}

type DisplayMode = 'serial' | 'operation' | 'field' | 'status';

interface RacksClientProps {
  slots: ProbeRackSlot[];
  probes: SimpleProbe[];
  probeLabels: Record<number, { operation: string; field: string; status: string }>;
}

const RACK_SLOT_COUNTS: Record<number, number> = {
  1: 10, 2: 10, 3: 10, 4: 10, 5: 10,
  6: 34,
  7: 13, 8: 13, 9: 13, 10: 13, 11: 13, 12: 13, 13: 13,
};

function parseRackStr(rackStr: string): { num: number; side: 'A' | 'B' } {
  const match = rackStr.match(/^(\d+)([AB])$/);
  if (!match) return { num: 0, side: 'A' };
  return { num: parseInt(match[1], 10), side: match[2] as 'A' | 'B' };
}

export default function RacksClient({ slots, probes, probeLabels }: RacksClientProps) {
  const router = useRouter();
  const [selectedRack, setSelectedRack] = useState(1);
  const [panelSlot, setPanelSlot] = useState<{ rows: ProbeRackSlot[]; slotNum: number; side: 'A' | 'B' } | null>(null);
  const [assigningRowId, setAssigningRowId] = useState<number | null>(null);
  const [probeSearch, setProbeSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [moveSource, setMoveSource] = useState<MoveSource | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('serial');

  useEffect(() => {
    const saved = localStorage.getItem('rack-display-mode') as DisplayMode | null;
    if (saved === 'operation' || saved === 'field') setDisplayMode(saved);
  }, []);

  function setAndSaveDisplayMode(mode: DisplayMode) {
    setDisplayMode(mode);
    localStorage.setItem('rack-display-mode', mode);
  }

  const slotIsFilled = (s: ProbeRackSlot) => Array.isArray(s.probe) && s.probe.some(p => !!p.value);

  const totalFilled = useMemo(() => slots.filter(slotIsFilled).length, [slots]);

  const rackStats = useMemo(() => {
    const stats: Record<number, { filled: number; total: number }> = {};
    for (let n = 1; n <= 13; n++) {
      const rackSlots = slots.filter((s) => parseRackStr(s.rack).num === n);
      stats[n] = {
        filled: rackSlots.filter(slotIsFilled).length,
        total: rackSlots.length,
      };
    }
    return stats;
  }, [slots]);

  const { sideAGroups, sideBGroups, rackFilled, rackTotal } = useMemo(() => {
    const rackSlots = slots.filter((s) => parseRackStr(s.rack).num === selectedRack);

    function groupSide(side: 'A' | 'B'): [number, ProbeRackSlot[]][] {
      const sideSlots = rackSlots.filter((s) => s.rack.endsWith(side));
      const map = new Map<number, ProbeRackSlot[]>();
      for (const slot of sideSlots) {
        const existing = map.get(slot.rack_slot) ?? [];
        existing.push(slot);
        map.set(slot.rack_slot, existing);
      }
      return Array.from(map.entries()).sort(([a], [b]) => a - b);
    }

    const rackFilled = rackSlots.filter(slotIsFilled).length;
    return { sideAGroups: groupSide('A'), sideBGroups: groupSide('B'), rackFilled, rackTotal: rackSlots.length };
  }, [slots, selectedRack]);

  const assignedProbeIds = useMemo(
    () => new Set(slots.flatMap((s) => s.probe?.map((p) => p.id) ?? [])),
    [slots]
  );

  const filteredProbes = useMemo(() => {
    const available = probes.filter((p) => !assignedProbeIds.has(p.id));
    if (!probeSearch) return available;
    const q = probeSearch.toLowerCase();
    return available.filter(
      (p) => p.serialNumber.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
    );
  }, [probes, assignedProbeIds, probeSearch]);

  function openSlot(rows: ProbeRackSlot[], slotNum: number, side: 'A' | 'B') {
    setPanelSlot({ rows, slotNum, side });
    setAssigningRowId(null);
    setProbeSearch('');
  }

  function closePanel() {
    setPanelSlot(null);
    setAssigningRowId(null);
  }

  async function assignProbe(slotId: number, probeId: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/probe-rack/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: probeId }),
      });
      if (res.ok) {
        closePanel();
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function unassignProbe(slotId: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/probe-rack/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: null }),
      });
      if (res.ok) {
        closePanel();
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(destRow: ProbeRackSlot) {
    if (!moveSource) return;
    setSaving(true);
    try {
      await fetch(`/api/probe-rack/${moveSource.rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: null }),
      });
      await fetch(`/api/probe-rack/${destRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: moveSource.probeId }),
      });
    } finally {
      setSaving(false);
      setMoveSource(null);
      router.refresh();
    }
  }

  function SlotGroup({ slotNum, rows, side }: { slotNum: number; rows: ProbeRackSlot[]; side: 'A' | 'B' }) {
    const isFilled = rows.some(slotIsFilled);
    const isSelected = panelSlot?.slotNum === slotNum && panelSlot?.side === side;
    const isSource = !!moveSource && rows.some(r => r.id === moveSource.rowId);
    const hasEmpty = rows.some(r => !slotIsFilled(r));
    const isValidTarget = !!moveSource && !isSource && hasEmpty;
    const isInvalidTarget = !!moveSource && !isSource && !hasEmpty && isFilled;

    let borderColor = isSelected
      ? 'var(--accent-primary)'
      : isFilled
      ? 'rgba(74,122,91,0.25)'
      : 'var(--border)';
    let background = isSelected
      ? 'var(--accent-primary-dim)'
      : isFilled
      ? 'rgba(74,122,91,0.06)'
      : 'var(--bg-card)';
    let borderWidth = '1px';
    const opacity = isInvalidTarget ? 0.35 : 1;

    if (moveSource) {
      if (isSource) {
        borderColor = 'var(--accent-primary)';
        borderWidth = '2px';
        background = 'rgba(74,122,91,0.15)';
      } else if (isValidTarget) {
        borderColor = 'rgba(74,122,91,0.5)';
        background = 'rgba(74,122,91,0.04)';
      }
    }

    return (
      <div
        onClick={() => {
          if (moveSource) {
            if (isSource) {
              setMoveSource(null);
              return;
            }
            const destRow = rows.find(r => !slotIsFilled(r));
            if (!destRow) return;
            handleMove(destRow);
          } else {
            const filledRow = rows.find(r => slotIsFilled(r));
            if (filledRow) {
              closePanel();
              setMoveSource({
                rowId: filledRow.id,
                probeId: filledRow.probe![0].id,
                serialNumber: filledRow.probe![0].value,
              });
            } else {
              openSlot(rows, slotNum, side);
            }
          }
        }}
        style={{
          padding: '5px 8px',
          borderRadius: 6,
          border: `${borderWidth} solid ${borderColor}`,
          background,
          cursor: isInvalidTarget ? 'default' : 'pointer',
          transition: 'all 0.12s ease',
          minWidth: 0,
          opacity,
        }}
      >
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
          {slotNum}
        </div>
        {rows.map((row) => {
          const linked = row.probe?.[0];
          const sn = linked?.value;
          const probeId = linked?.id;
          const secondLine = probeId && displayMode !== 'serial'
            ? probeLabels[probeId]?.[displayMode as 'operation' | 'field' | 'status'] || null
            : null;
          return (
            <div key={row.id}>
              <div style={{ fontSize: 11, fontWeight: sn ? 500 : 400, color: sn ? 'var(--accent-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sn || '–'}
              </div>
              {secondLine && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {secondLine}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function Side({ side, groups }: { side: 'A' | 'B'; groups: [number, ProbeRackSlot[]][] }) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            paddingBottom: 6,
            marginBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}
        >
          Side {side}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {groups.map(([slotNum, rows]) => (
            <SlotGroup key={slotNum} slotNum={slotNum} rows={rows} side={side} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Racks</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {slots.length} slots · {totalFilled} filled · {slots.length - totalFilled} empty
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Rack number selector */}
        <div
          style={{
            width: 52,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-card)',
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 6px',
            gap: 2,
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {Array.from({ length: 13 }, (_, i) => i + 1).map((n) => {
            const stat = rackStats[n];
            const pct = stat?.total ? Math.round((stat.filled / stat.total) * 100) : 0;
            const isActive = selectedRack === n;
            return (
              <button
                key={n}
                onClick={() => { setSelectedRack(n); closePanel(); }}
                style={{
                  width: '100%',
                  padding: '6px 4px',
                  borderRadius: 6,
                  border: 'none',
                  background: isActive ? 'var(--accent-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <span>{n}</span>
                <div style={{
                  width: '80%',
                  height: 3,
                  borderRadius: 2,
                  background: isActive ? 'rgba(255,255,255,0.3)' : 'var(--border)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: isActive ? '#fff' : 'var(--accent-primary)',
                    borderRadius: 2,
                  }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Slot grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Move mode banner */}
          {moveSource && (
            <div style={{
              padding: '10px 16px',
              background: 'var(--accent-primary)',
              color: '#fff',
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>
                {saving
                  ? 'Moving…'
                  : <>Moving <strong>{moveSource.serialNumber}</strong> — tap a slot to place it, or tap the highlighted slot to cancel</>}
              </span>
              {!saving && (
                <button
                  onClick={() => setMoveSource(null)}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1, marginLeft: 12, padding: '0 2px' }}
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Rack summary */}
          <div style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Rack {selectedRack}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rackTotal} probe positions</span>
              </div>
              {/* Display mode toggle */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-secondary)', borderRadius: 6, padding: 2 }}>
                {(['serial', 'operation', 'field', 'status'] as DisplayMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAndSaveDisplayMode(mode)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      border: 'none',
                      background: displayMode === mode ? 'var(--bg-card)' : 'transparent',
                      color: displayMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: displayMode === mode ? 600 : 400,
                      cursor: 'pointer',
                      boxShadow: displayMode === mode ? 'var(--shadow-sm)' : 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {mode === 'serial' ? 'SN' : mode === 'operation' ? '+ Op' : mode === 'field' ? '+ Field' : '+ Status'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{rackFilled}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>filled</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border-strong)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{rackTotal - rackFilled}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>empty</span>
              </div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
              <div style={{
                width: `${rackTotal ? Math.round((rackFilled / rackTotal) * 100) : 0}%`,
                height: '100%',
                background: 'var(--accent-primary)',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <Side side="A" groups={sideAGroups} />
            <Side side="B" groups={sideBGroups} />
          </div>
        </div>

        {/* Assignment panel */}
        {panelSlot && !moveSource && (
          <div
            style={{
              width: 272,
              borderLeft: '1px solid var(--border)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                Rack {selectedRack}{panelSlot.side} · Slot {panelSlot.slotNum}
              </span>
              <button
                onClick={closePanel}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: '0 2px',
                }}
              >
                ×
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {panelSlot.rows.map((row, i) => {
                const probe = row.probe?.[0];

                if (probe) {
                  const probeData = probes.find((p) => p.id === probe.id);
                  return (
                    <div
                      key={row.id}
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: 'rgba(74,122,91,0.08)',
                        border: '1px solid rgba(74,122,91,0.2)',
                      }}
                    >
                      {panelSlot.rows.length > 1 && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Position {i + 1}
                        </div>
                      )}
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent-primary)' }}>
                        {probe.value}
                      </div>
                      {probeData && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {probeData.brand} · {probeData.status}
                        </div>
                      )}
                      <button
                        onClick={() => unassignProbe(row.id)}
                        disabled={saving}
                        style={{
                          marginTop: 8,
                          width: '100%',
                          padding: '5px 0',
                          background: 'var(--accent-red-dim)',
                          color: 'var(--accent-red)',
                          border: '1px solid rgba(220,38,38,0.2)',
                          borderRadius: 6,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        {saving ? 'Saving…' : 'Unassign'}
                      </button>
                    </div>
                  );
                }

                if (assigningRowId === row.id) {
                  return (
                    <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {panelSlot.rows.length > 1 && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Position {i + 1}</div>
                      )}
                      <input
                        type="text"
                        placeholder="Search probes…"
                        value={probeSearch}
                        onChange={(e) => setProbeSearch(e.target.value)}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          fontSize: 12,
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 3,
                          maxHeight: 240,
                          overflowY: 'auto',
                        }}
                      >
                        {filteredProbes.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>
                            No available probes
                          </div>
                        ) : (
                          filteredProbes.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => assignProbe(row.id, p.id)}
                              disabled={saving}
                              style={{
                                padding: '7px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-primary)',
                                cursor: saving ? 'not-allowed' : 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--text-primary)' }}>
                                {p.serialNumber}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {p.brand} · {p.status}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                      <button
                        onClick={() => setAssigningRowId(null)}
                        style={{
                          padding: '5px 0',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={row.id}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {panelSlot.rows.length > 1 && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
                        Position {i + 1}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Empty</div>
                    <button
                      onClick={() => {
                        setAssigningRowId(row.id);
                        setProbeSearch('');
                      }}
                      style={{
                        width: '100%',
                        padding: '5px 0',
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      Assign probe
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
