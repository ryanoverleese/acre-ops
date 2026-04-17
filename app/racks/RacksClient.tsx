'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ProbeRackSlot } from '@/lib/baserow';

export interface SimpleProbe {
  id: number;
  serialNumber: string;
  status: string;
  brand: string;
  rack: string;
  rackSlot: number;
}

interface RacksClientProps {
  slots: ProbeRackSlot[];
  probes: SimpleProbe[];
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

export default function RacksClient({ slots, probes }: RacksClientProps) {
  const router = useRouter();
  const [selectedRack, setSelectedRack] = useState(1);
  const [panelSlot, setPanelSlot] = useState<{ rows: ProbeRackSlot[]; slotNum: number; side: 'A' | 'B' } | null>(null);
  const [assigningRowId, setAssigningRowId] = useState<number | null>(null);
  const [probeSearch, setProbeSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Build a set of "rack|slot" keys that have a real probe assigned, based on probe records
  const filledKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of probes) {
      if (p.rack && p.rackSlot && p.serialNumber) {
        set.add(`${p.rack}|${p.rackSlot}`);
      }
    }
    return set;
  }, [probes]);

  const slotIsFilled = (rack: string, slot: number) => filledKeys.has(`${rack}|${slot}`);

  // Probes indexed by rack|slot for display
  const probesByPosition = useMemo(() => {
    const map = new Map<string, SimpleProbe[]>();
    for (const p of probes) {
      if (p.rack && p.rackSlot) {
        const key = `${p.rack}|${p.rackSlot}`;
        const existing = map.get(key) ?? [];
        existing.push(p);
        map.set(key, existing);
      }
    }
    return map;
  }, [probes]);

  const totalFilled = useMemo(() => slots.filter((s) => slotIsFilled(s.rack, s.rack_slot)).length, [slots, filledKeys]);

  // Per-rack fill stats for the selector
  const rackStats = useMemo(() => {
    const stats: Record<number, { filled: number; total: number }> = {};
    for (let n = 1; n <= 13; n++) {
      const rackSlots = slots.filter((s) => parseRackStr(s.rack).num === n);
      stats[n] = {
        filled: rackSlots.filter((s) => slotIsFilled(s.rack, s.rack_slot)).length,
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

    const rackFilled = rackSlots.filter((s) => slotIsFilled(s.rack, s.rack_slot)).length;
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

  function SlotGroup({ slotNum, rows, side }: { slotNum: number; rows: ProbeRackSlot[]; side: 'A' | 'B' }) {
    const rack = `${selectedRack}${side}`;
    const assignedProbes = probesByPosition.get(`${rack}|${slotNum}`) ?? [];
    const isFilled = assignedProbes.length > 0;
    const isSelected = panelSlot?.slotNum === slotNum && panelSlot?.side === side;

    return (
      <div
        onClick={() => openSlot(rows, slotNum, side)}
        style={{
          padding: '5px 8px',
          borderRadius: 6,
          border: `1px solid ${isSelected ? 'var(--accent-primary)' : isFilled ? 'rgba(74,122,91,0.25)' : 'var(--border)'}`,
          background: isSelected
            ? 'var(--accent-primary-dim)'
            : isFilled
            ? 'rgba(74,122,91,0.06)'
            : 'var(--bg-card)',
          cursor: 'pointer',
          transition: 'all 0.12s ease',
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
          {slotNum}
        </div>
        {isFilled ? assignedProbes.map((p) => (
          <div
            key={p.id}
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--accent-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {p.serialNumber || 'No SN'}
          </div>
        )) : (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>EMPTY</div>
        )}
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
            textTransform: 'uppercase',
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
          {/* Rack summary */}
          <div style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Rack {selectedRack}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rackTotal} probe positions</span>
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
        {panelSlot && (
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
                  // Filled: show probe + unassign
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

                // Empty: show assign button or probe picker
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
