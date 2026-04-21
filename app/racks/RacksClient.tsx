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

interface LastMove {
  sourceRowId: number | null;
  destRowId: number;
  probeId: number;
  serialNumber: string;
}

interface SlotModal {
  rows: ProbeRackSlot[];
  slotNum: number;
  side: 'A' | 'B';
}

interface DestPicker {
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

function parseRackStr(rackStr: string): { num: number; side: 'A' | 'B' } {
  const match = rackStr.match(/^(\d+)([AB])$/);
  if (!match) return { num: 0, side: 'A' };
  return { num: parseInt(match[1], 10), side: match[2] as 'A' | 'B' };
}

export default function RacksClient({ slots, probes, probeLabels }: RacksClientProps) {
  const router = useRouter();
  const [selectedRack, setSelectedRack] = useState(1);
  const [slotModal, setSlotModal] = useState<SlotModal | null>(null);
  const [destPicker, setDestPicker] = useState<DestPicker | null>(null);
  const [destSearch, setDestSearch] = useState('');
  const [probeSearch, setProbeSearch] = useState('');
  const [assigningRowId, setAssigningRowId] = useState<number | null>(null);
  const [holdingSearch, setHoldingSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('serial');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [statusPickerProbeId, setStatusPickerProbeId] = useState<number | null>(null);

  const STATUS_OPTIONS = [
    'In Stock', 'Assigned', 'Installed', 'In Crate for Shipment',
    'Trade Ordered', 'Trade Ordered - In Crate', 'On Order', 'On Order - Trade',
    'No Trade', 'RMA', 'Retired', 'Lost',
  ];

  useEffect(() => {
    const saved = localStorage.getItem('rack-display-mode') as DisplayMode | null;
    if (saved === 'operation' || saved === 'field' || saved === 'status') setDisplayMode(saved);
  }, []);

  useEffect(() => {
    if (!lastMove) return;
    const timer = setTimeout(() => setLastMove(null), 30_000);
    return () => clearTimeout(timer);
  }, [lastMove]);

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
      stats[n] = { filled: rackSlots.filter(slotIsFilled).length, total: rackSlots.length };
    }
    return stats;
  }, [slots]);

  const { sideAGroups, sideBGroups, rackFilled, rackTotal } = useMemo(() => {
    const rackSlots = slots.filter((s) => parseRackStr(s.rack).num === selectedRack);
    function groupSide(side: 'A' | 'B'): [number, ProbeRackSlot[]][] {
      const map = new Map<number, ProbeRackSlot[]>();
      for (const slot of rackSlots.filter(s => s.rack.endsWith(side))) {
        const existing = map.get(slot.rack_slot) ?? [];
        existing.push(slot);
        map.set(slot.rack_slot, existing);
      }
      return Array.from(map.entries()).sort(([a], [b]) => a - b);
    }
    return {
      sideAGroups: groupSide('A'),
      sideBGroups: groupSide('B'),
      rackFilled: rackSlots.filter(slotIsFilled).length,
      rackTotal: rackSlots.length,
    };
  }, [slots, selectedRack]);

  const assignedProbeIds = useMemo(
    () => new Set(slots.flatMap((s) => s.probe?.map((p) => p.id) ?? [])),
    [slots]
  );

  // Empty slot positions available as move destinations
  const emptySlots = useMemo(() => {
    return slots
      .filter(s => !slotIsFilled(s))
      .map(s => {
        const { num, side } = parseRackStr(s.rack);
        return { rowId: s.id, rackNum: num, side, rackSlot: s.rack_slot, label: `Rack ${s.rack} · Slot ${s.rack_slot}` };
      })
      .sort((a, b) => a.rackNum - b.rackNum || a.side.localeCompare(b.side) || a.rackSlot - b.rackSlot);
  }, [slots]);

  const filteredDestSlots = useMemo(() => {
    if (!destSearch) return emptySlots;
    const q = destSearch.toLowerCase();
    return emptySlots.filter(s => s.label.toLowerCase().includes(q));
  }, [emptySlots, destSearch]);

  // Unplaced probes (have SN, not in any slot)
  const unplacedProbes = useMemo(() => {
    const all = probes.filter(p => p.serialNumber && !assignedProbeIds.has(p.id));
    if (!holdingSearch) return all;
    const q = holdingSearch.toLowerCase();
    return all.filter(p =>
      p.serialNumber.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q)
    );
  }, [probes, assignedProbeIds, holdingSearch]);

  const totalUnplaced = useMemo(
    () => probes.filter(p => p.serialNumber && !assignedProbeIds.has(p.id)).length,
    [probes, assignedProbeIds]
  );

  // Available probes for assignment
  const filteredProbes = useMemo(() => {
    const available = probes.filter(p => !assignedProbeIds.has(p.id));
    if (!probeSearch) return available;
    const q = probeSearch.toLowerCase();
    return available.filter(p =>
      p.serialNumber.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
    );
  }, [probes, assignedProbeIds, probeSearch]);

  function closeModal() {
    setSlotModal(null);
    setDestPicker(null);
    setDestSearch('');
    setAssigningRowId(null);
    setProbeSearch('');
    setStatusPickerProbeId(null);
  }

  async function changeProbeStatus(probeId: number, status: string) {
    setSaving(true);
    try {
      await fetch(`/api/probes/${probeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      closeModal();
      router.refresh();
    } finally { setSaving(false); }
  }

  async function assignProbe(slotId: number, probeId: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/probe-rack/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: probeId }),
      });
      if (res.ok) { closeModal(); router.refresh(); }
    } finally { setSaving(false); }
  }

  async function unassignProbe(rowId: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/probe-rack/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: null }),
      });
      if (res.ok) { closeModal(); router.refresh(); }
    } finally { setSaving(false); }
  }

  async function handleMove(destRowId: number) {
    if (!destPicker) return;
    setSaving(true);
    try {
      if (destPicker.rowId !== -1) {
        // Moving from a slot — unassign source first
        await fetch(`/api/probe-rack/${destPicker.rowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ probe: null }),
        });
      }
      await fetch(`/api/probe-rack/${destRowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: destPicker.probeId }),
      });
      setLastMove({
        sourceRowId: destPicker.rowId === -1 ? null : destPicker.rowId,
        destRowId,
        probeId: destPicker.probeId,
        serialNumber: destPicker.serialNumber,
      });
    } finally {
      setSaving(false);
      closeModal();
      router.refresh();
    }
  }

  async function handleUndo() {
    if (!lastMove) return;
    setSaving(true);
    try {
      await fetch(`/api/probe-rack/${lastMove.destRowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: null }),
      });
      if (lastMove.sourceRowId !== null) {
        await fetch(`/api/probe-rack/${lastMove.sourceRowId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ probe: lastMove.probeId }),
        });
      }
    } finally {
      setSaving(false);
      setLastMove(null);
      router.refresh();
    }
  }

  function SlotGroup({ slotNum, rows, side }: { slotNum: number; rows: ProbeRackSlot[]; side: 'A' | 'B' }) {
    const isFilled = rows.some(slotIsFilled);
    const isLost = isFilled && rows.some(row => {
      const probeId = row.probe?.[0]?.id;
      return probeId && probeLabels[probeId]?.status?.toLowerCase() === 'lost';
    });
    const borderColor = isLost ? 'rgba(220,38,38,0.35)' : isFilled ? 'rgba(74,122,91,0.25)' : 'var(--border)';
    const bgColor = isLost ? 'rgba(220,38,38,0.06)' : isFilled ? 'rgba(74,122,91,0.06)' : 'var(--bg-card)';
    return (
      <div
        onClick={() => setSlotModal({ rows, slotNum, side })}
        style={{
          padding: '5px 8px',
          borderRadius: 6,
          border: `1px solid ${borderColor}`,
          background: bgColor,
          cursor: 'pointer',
          transition: 'all 0.12s ease',
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{slotNum}</div>
        {rows.map((row) => {
          const linked = row.probe?.[0];
          const sn = linked?.value;
          const probeId = linked?.id;
          const isRowLost = probeId && probeLabels[probeId]?.status?.toLowerCase() === 'lost';
          const secondLine = sn && probeId && displayMode !== 'serial'
            ? probeLabels[probeId]?.[displayMode as 'operation' | 'field' | 'status'] || null
            : null;
          return (
            <div key={row.id}>
              <div style={{ fontSize: 11, fontWeight: sn ? 500 : 400, color: isRowLost ? 'var(--accent-red)' : sn ? 'var(--accent-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', paddingBottom: 6, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
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
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Racks</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {slots.length} slots · {totalFilled} filled · {slots.length - totalFilled} empty
          </div>
        </div>
        <button
          onClick={() => setRightPanelOpen(v => !v)}
          style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border)', background: rightPanelOpen ? 'var(--bg-secondary)' : 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Holding{totalUnplaced > 0 ? ` (${totalUnplaced})` : ''}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Rack selector */}
        <div style={{ width: 52, borderRight: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', padding: '8px 6px', gap: 2, overflowY: 'auto', flexShrink: 0 }}>
          {Array.from({ length: 13 }, (_, i) => i + 1).map((n) => {
            const stat = rackStats[n];
            const pct = stat?.total ? Math.round((stat.filled / stat.total) * 100) : 0;
            const isActive = selectedRack === n;
            return (
              <button key={n} onClick={() => setSelectedRack(n)} style={{ width: '100%', padding: '6px 4px', borderRadius: 6, border: 'none', background: isActive ? 'var(--accent-primary)' : 'transparent', color: isActive ? '#fff' : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400, fontSize: 12, cursor: 'pointer', transition: 'all 0.12s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span>{n}</span>
                <div style={{ width: '80%', height: 3, borderRadius: 2, background: isActive ? 'rgba(255,255,255,0.3)' : 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: isActive ? '#fff' : 'var(--accent-primary)', borderRadius: 2 }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Slot grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* Undo bar */}
          {lastMove && (
            <div style={{ padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {lastMove.sourceRowId === null ? 'Placed' : 'Moved'} <strong style={{ color: 'var(--text-primary)' }}>{lastMove.serialNumber}</strong>
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleUndo} disabled={saving} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Undoing…' : 'Undo'}
                </button>
                <button onClick={() => setLastMove(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
              </div>
            </div>
          )}

          {/* Rack summary */}
          <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Rack {selectedRack}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rackTotal} probe positions</span>
              </div>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-secondary)', borderRadius: 6, padding: 2 }}>
                {(['serial', 'operation', 'field', 'status'] as DisplayMode[]).map((mode) => (
                  <button key={mode} onClick={() => setAndSaveDisplayMode(mode)} style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: displayMode === mode ? 'var(--bg-card)' : 'transparent', color: displayMode === mode ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 11, fontWeight: displayMode === mode ? 600 : 400, cursor: 'pointer', boxShadow: displayMode === mode ? 'var(--shadow-sm)' : 'none', whiteSpace: 'nowrap' }}>
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
              <div style={{ width: `${rackTotal ? Math.round((rackFilled / rackTotal) * 100) : 0}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: 3, transition: 'width 0.3s ease' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            <Side side="A" groups={sideAGroups} />
            <Side side="B" groups={sideBGroups} />
          </div>
        </div>

        {/* Holding area overlay */}
        {rightPanelOpen && (
          <div onClick={() => setRightPanelOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 9 }} />
        )}
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', zIndex: 10, transform: rightPanelOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.22s ease', boxShadow: rightPanelOpen ? '-4px 0 16px rgba(0,0,0,0.12)' : 'none' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Holding Area</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalUnplaced} probes</span>
              </div>
              <button onClick={() => setRightPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
            <input type="text" placeholder="Search…" value={holdingSearch} onChange={(e) => setHoldingSearch(e.target.value)} style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {unplacedProbes.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>
                {holdingSearch ? 'No matches' : 'All probes are placed'}
              </div>
            ) : (
              unplacedProbes.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    // Open slot modal pre-set to "move from holding area"
                    setDestPicker({ rowId: -1, probeId: p.id, serialNumber: p.serialNumber });
                    setDestSearch('');
                    setRightPanelOpen(false);
                  }}
                  style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', transition: 'all 0.1s ease' }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--accent-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.serialNumber}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{p.brand} · {p.status}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Slot modal */}
      {slotModal && !destPicker && (
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 14, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                Rack {selectedRack}{slotModal.side} · Slot {slotModal.slotNum}
              </span>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>

            {/* One card per position */}
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {slotModal.rows.map((row, i) => {
                const probe = row.probe?.[0];
                const showPositionLabel = slotModal.rows.length > 1;

                if (probe?.value) {
                  const probeData = probes.find(p => p.id === probe.id);
                  return (
                    <div key={row.id} style={{ padding: 12, borderRadius: 10, background: 'rgba(74,122,91,0.07)', border: '1px solid rgba(74,122,91,0.2)' }}>
                      {showPositionLabel && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Position {i + 1}</div>}
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent-primary)', marginBottom: 2 }}>{probe.value}</div>
                      {probeData && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{probeData.brand} · {probeData.status}</div>}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button
                          onClick={() => {
                            setDestPicker({ rowId: row.id, probeId: probe.id, serialNumber: probe.value });
                            setDestSearch('');
                          }}
                          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Move Location
                        </button>
                        <button
                          onClick={() => unassignProbe(row.id)}
                          disabled={saving}
                          style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid rgba(220,38,38,0.25)', background: 'var(--accent-red-dim)', color: 'var(--accent-red)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
                        >
                          {saving ? 'Saving…' : 'Unassign'}
                        </button>
                      </div>
                      <button
                        onClick={() => setStatusPickerProbeId(statusPickerProbeId === probe.id ? null : probe.id)}
                        style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Change Status {probeData?.status ? `· ${probeData.status}` : ''}
                      </button>
                      {statusPickerProbeId === probe.id && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {STATUS_OPTIONS.map(s => (
                            <button
                              key={s}
                              onClick={() => changeProbeStatus(probe.id, s)}
                              disabled={saving || s === probeData?.status}
                              style={{
                                padding: '8px 12px', borderRadius: 7, textAlign: 'left', fontSize: 13,
                                border: `1px solid ${s === probeData?.status ? 'var(--accent-primary)' : 'var(--border)'}`,
                                background: s === probeData?.status ? 'rgba(74,122,91,0.1)' : 'var(--bg-primary)',
                                color: s === probeData?.status ? 'var(--accent-primary)' : 'var(--text-primary)',
                                fontWeight: s === probeData?.status ? 600 : 400,
                                cursor: s === probeData?.status ? 'default' : 'pointer',
                              }}
                            >
                              {s}{s === probeData?.status ? ' ✓' : ''}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                // Empty position — show assign
                if (assigningRowId === row.id) {
                  return (
                    <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {showPositionLabel && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Position {i + 1}</div>}
                      <input type="text" placeholder="Search probes…" value={probeSearch} onChange={e => setProbeSearch(e.target.value)} autoFocus style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 220, overflowY: 'auto' }}>
                        {filteredProbes.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>No available probes</div>
                        ) : filteredProbes.map(p => (
                          <button key={p.id} onClick={() => assignProbe(row.id, p.id)} disabled={saving} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: saving ? 'not-allowed' : 'pointer', textAlign: 'left' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{p.serialNumber}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.brand} · {p.status}</div>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setAssigningRowId(null)} style={{ padding: '7px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                    </div>
                  );
                }

                return (
                  <div key={row.id} style={{ padding: 12, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    {showPositionLabel && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Position {i + 1}</div>}
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Empty</div>
                    <button onClick={() => { setAssigningRowId(row.id); setProbeSearch(''); }} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none', background: 'var(--accent-primary)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Assign Probe
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Destination picker modal */}
      {destPicker && (
        <div onClick={() => { setDestPicker(null); setDestSearch(''); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 14, width: '100%', maxWidth: 360, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Move Location</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{destPicker.serialNumber}</div>
              </div>
              <button onClick={() => { setDestPicker(null); setDestSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <input type="text" placeholder="Search slots…" value={destSearch} onChange={e => setDestSearch(e.target.value)} autoFocus style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredDestSlots.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 4px' }}>No empty slots found</div>
              ) : filteredDestSlots.map(s => (
                <button
                  key={s.rowId}
                  onClick={() => handleMove(s.rowId)}
                  disabled={saving}
                  style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: saving ? 'not-allowed' : 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
