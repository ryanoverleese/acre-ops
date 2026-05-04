'use client';

import { useState, useMemo } from 'react';

export interface UninstallProbeData {
  assignmentId: number;
  probeId: number;
  fieldName: string;
  operation: string;
  probeSerial: string;
  probeBrand: string;
  probeLabel: string;
  installDate: string;
  season: number;
}

export interface OnOrderProbe {
  id: number;
  brand: string;
  status: string;
  notes: string;
  yearNew: number | null;
}

interface WorkflowsClientProps {
  installedProbes: UninstallProbeData[];
  brandOptions: string[];
  onOrderProbes: OnOrderProbe[];
}

type Step = 'select' | 'confirm' | 'rack-prompt' | 'rack-pick' | 'done';

export default function WorkflowsClient({ installedProbes, brandOptions, onOrderProbes }: WorkflowsClientProps) {
  const [activeWorkflow, setActiveWorkflow] = useState<'uninstall' | 'register' | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UninstallProbeData | null>(null);
  const [removalDate, setRemovalDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [removalNotes, setRemovalNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Register probe state
  const [regSerial, setRegSerial] = useState('');
  const [regType, setRegType] = useState(() => brandOptions.find(b => b.toLowerCase().includes('cropx v4')) || brandOptions.find(b => b.toLowerCase().includes('cropx')) || brandOptions[0] || '');
  const [regYearNew, setRegYearNew] = useState(() => String(new Date().getFullYear()));
  const [regCreatedSerial, setRegCreatedSerial] = useState('');
  const [regCreatedProbeId, setRegCreatedProbeId] = useState<number | null>(null);
  const [regOnOrderMatch, setRegOnOrderMatch] = useState<OnOrderProbe | null>(null);

  // Duplicate serial check
  const [serialExists, setSerialExists] = useState(false);
  const [serialCheckId, setSerialCheckId] = useState<ReturnType<typeof setTimeout> | null>(null);

  function onSerialChange(val: string) {
    setRegSerial(val);
    setSerialExists(false);
    if (serialCheckId) clearTimeout(serialCheckId);
    if (!val.trim()) return;
    const tid = setTimeout(async () => {
      try {
        const res = await fetch(`/api/probes?search=${encodeURIComponent(val.trim())}`);
        const data = await res.json();
        const probes: { serial_number?: string }[] = data.results ?? data;
        setSerialExists(probes.some(p => p.serial_number?.trim() === val.trim()));
      } catch { /* ignore */ }
    }, 400);
    setSerialCheckId(tid);
  }

  // Rack-pick state
  type RackSlot = { id: number; rack: string; rack_slot: number; probeId?: number; probeSerial?: string };
  const [rackSlots, setRackSlots] = useState<RackSlot[]>([]);
  const [rackLoading, setRackLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<RackSlot | null>(null);
  const [rackSaving, setRackSaving] = useState(false);
  const [pickerRack, setPickerRack] = useState<string>('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return installedProbes;
    return installedProbes.filter(
      (p) =>
        p.fieldName.toLowerCase().includes(q) ||
        p.probeSerial.toLowerCase().includes(q) ||
        p.probeBrand.toLowerCase().includes(q) ||
        p.operation.toLowerCase().includes(q)
    );
  }, [installedProbes, search]);

  // On-order probes of the currently selected brand
  const matchingOnOrder = useMemo(() =>
    onOrderProbes.filter(p => p.brand.toLowerCase() === regType.toLowerCase()),
    [onOrderProbes, regType]
  );

  const resetWorkflow = () => {
    setStep('select');
    setSearch('');
    setSelected(null);
    setRemovalDate(new Date().toISOString().split('T')[0]);
    setRemovalNotes('');
    setError('');
  };

  const handleSelect = (probe: UninstallProbeData) => {
    setSelected(probe);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      // 1. Update probe assignment: set removal_date, removal_notes, clear probe_status
      const paRes = await fetch(`/api/probe-assignments/${selected.assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          removal_date: removalDate,
          removal_notes: removalNotes || null,
          probe_status: '',
        }),
      });
      if (!paRes.ok) throw new Error('Failed to update probe assignment');

      // 2. Update probe status to "In Stock"
      if (selected.probeId) {
        const probeRes = await fetch(`/api/probes/${selected.probeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'In Stock' }),
        });
        if (!probeRes.ok) throw new Error('Failed to update probe status');
      }

      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterSubmit = async () => {
    if (!regSerial.trim()) return;
    setSaving(true);
    setError('');
    try {
      let probeId: number | null = null;
      if (regOnOrderMatch) {
        const res = await fetch(`/api/probes/${regOnOrderMatch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial_number: regSerial.trim(), status: 'In Stock' }),
        });
        if (!res.ok) throw new Error('Failed to update probe');
        probeId = regOnOrderMatch.id;
      } else {
        const res = await fetch('/api/probes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serial_number: regSerial.trim(),
            brand: regType,
            year_new: parseInt(regYearNew, 10),
            status: 'In Stock',
          }),
        });
        if (!res.ok) throw new Error('Failed to create probe');
        const data = await res.json();
        probeId = data.id ?? null;
      }
      setRegCreatedSerial(regSerial.trim());
      setRegCreatedProbeId(probeId);
      setStep('rack-prompt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRackPicker = async () => {
    setRackLoading(true);
    setSelectedSlot(null);
    try {
      const res = await fetch('/api/probe-rack');
      const data = await res.json();
      const slots: RackSlot[] = (data.results ?? data).map((s: { id: number; rack: string | { value: string }; rack_slot: number; probe?: { id: number; value: string }[] }) => {
        const probeEntry = s.probe?.find(p => !!p.value);
        return {
          id: s.id,
          rack: typeof s.rack === 'object' ? s.rack.value : s.rack,
          rack_slot: s.rack_slot,
          probeId: probeEntry?.id,
          probeSerial: probeEntry?.value,
        };
      });
      slots.sort((a, b) => {
        const rackNum = (r: string) => parseInt(r.replace(/[^0-9]/g, ''), 10) || 0;
        const side = (r: string) => r.replace(/[0-9]/g, '');
        if (rackNum(a.rack) !== rackNum(b.rack)) return rackNum(a.rack) - rackNum(b.rack);
        if (side(a.rack) !== side(b.rack)) return side(a.rack) < side(b.rack) ? -1 : 1;
        return a.rack_slot - b.rack_slot;
      });
      setRackSlots(slots);
      // Default to first rack with an available slot
      const firstAvailRack = slots.find(s => !s.probeId)?.rack ?? slots[0]?.rack ?? '';
      setPickerRack(firstAvailRack);
      setStep('rack-pick');
    } catch {
      setError('Failed to load rack data');
    } finally {
      setRackLoading(false);
    }
  };

  const handleAssignRack = async () => {
    if (!selectedSlot || !regCreatedProbeId) return;
    setRackSaving(true);
    try {
      const res = await fetch(`/api/probe-rack/${selectedSlot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probe: regCreatedProbeId }),
      });
      if (!res.ok) throw new Error('Failed to assign rack slot');
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign rack slot');
    } finally {
      setRackSaving(false);
    }
  };

  const resetRegister = () => {
    setRegSerial('');
    setRegType(brandOptions.find(b => b.toLowerCase().includes('cropx v4')) || brandOptions.find(b => b.toLowerCase().includes('cropx')) || brandOptions[0] || '');
    setRegYearNew(String(new Date().getFullYear()));
    setRegCreatedSerial('');
    setRegCreatedProbeId(null);
    setRegOnOrderMatch(null);
    setRackSlots([]);
    setSelectedSlot(null);
    setSerialExists(false);
    setError('');
    setStep('select');
  };

  if (!activeWorkflow) {
    return (
      <>
        <header className="header">
          <div className="header-left">
            <h2>Workflows</h2>
          </div>
        </header>
        <div className="content">
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
              Step-by-step guides for common field operations.
            </p>
            <div
              onClick={() => { setActiveWorkflow('register'); resetRegister(); }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '20px 24px',
                cursor: 'pointer',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
              className="workflow-card"
            >
              <div style={{
                width: 44, height: 44, borderRadius: 8,
                background: 'rgba(34, 197, 94, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg fill="none" stroke="#22c55e" viewBox="0 0 24 24" width="22" height="22">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Register New Probe</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                  Add a new probe to inventory with serial number and type.
                </div>
              </div>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div
              onClick={() => { setActiveWorkflow('uninstall'); resetWorkflow(); }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '20px 24px',
                cursor: 'pointer',
                background: 'var(--bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
              className="workflow-card"
            >
              <div style={{
                width: 44, height: 44, borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg fill="none" stroke="#ef4444" viewBox="0 0 24 24" width="22" height="22">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Uninstall Probe</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
                  Record which probe was removed, from which field, and on what date.
                </div>
              </div>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18" style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Register probe workflow
  if (activeWorkflow === 'register') {
    const inputStyle: React.CSSProperties = {
      padding: '14px 16px',
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontSize: 17,
      width: '100%',
      boxSizing: 'border-box',
    };
    const labelStyle: React.CSSProperties = {
      display: 'block',
      fontWeight: 600,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--text-secondary)',
      marginBottom: 8,
    };

    return (
      <>
        <header className="header">
          <div className="header-left">
            <button
              className="btn btn-secondary"
              onClick={() => { setActiveWorkflow(null); resetRegister(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 18l-6-6 6-6" />
              </svg>
              Workflows
            </button>
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Register Probe</div>
          <div style={{ width: 90 }} />
        </header>
        <div className="content">
          <div style={{ maxWidth: 520 }}>

            {step === 'select' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Serial number */}
                <div>
                  <label style={labelStyle}>Serial Number</label>
                  <input
                    type="text"
                    value={regSerial}
                    onChange={(e) => onSerialChange(e.target.value)}
                    placeholder="e.g. 412719"
                    inputMode="numeric"
                    autoFocus
                    style={{ ...inputStyle, fontSize: 22, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em', borderColor: serialExists ? '#dc2626' : undefined }}
                  />
                  {serialExists && (
                    <div style={{ color: '#dc2626', fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                      Serial #{regSerial} is already in the system — check for duplicates before saving.
                    </div>
                  )}
                </div>

                {/* Probe type */}
                <div>
                  <label style={labelStyle}>Probe Type</label>
                  <select
                    value={regType}
                    onChange={(e) => setRegType(e.target.value)}
                    style={inputStyle}
                  >
                    {brandOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Year */}
                <div>
                  <label style={labelStyle}>Year New</label>
                  <input
                    type="number"
                    value={regYearNew}
                    onChange={(e) => setRegYearNew(e.target.value)}
                    min="2000"
                    max="2099"
                    style={{ ...inputStyle, width: 140 }}
                  />
                </div>

                {error && (
                  <div style={{ color: '#ef4444', fontSize: 14, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>{error}</div>
                )}

                {/* Warning: on-order slots exist but none selected */}
                {matchingOnOrder.length > 0 && !regOnOrderMatch && regSerial.trim() && (
                  <div style={{ color: '#92400e', fontSize: 13, padding: '10px 14px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8 }}>
                    ⚠️ There {matchingOnOrder.length === 1 ? 'is' : 'are'} <strong>{matchingOnOrder.length} on-order {regType}</strong> slot{matchingOnOrder.length !== 1 ? 's' : ''} below — select one to avoid creating a duplicate.
                  </div>
                )}

                {/* Submit button — above on-order list */}
                <button
                  className="btn btn-primary"
                  onClick={handleRegisterSubmit}
                  disabled={saving || !regSerial.trim()}
                  style={{ padding: '16px', fontSize: 16, borderRadius: 10, width: '100%' }}
                >
                  {saving ? 'Saving…' : regOnOrderMatch ? `Assign #${regSerial || '…'} to On Order Slot` : 'Register as New Probe'}
                </button>

                {/* On-order match */}
                {matchingOnOrder.length > 0 && (
                  <div>
                    <label style={labelStyle}>
                      Assign to On Order slot?
                      <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: 'var(--text-muted)' }}>
                        {matchingOnOrder.length} {regType} on order
                      </span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {matchingOnOrder.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setRegOnOrderMatch(regOnOrderMatch?.id === p.id ? null : p)}
                          style={{
                            padding: '14px 16px',
                            border: `2px solid ${regOnOrderMatch?.id === p.id ? 'var(--accent-primary)' : 'var(--border)'}`,
                            borderRadius: 10,
                            background: regOnOrderMatch?.id === p.id ? 'rgba(34,197,94,0.08)' : 'var(--bg-secondary)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                          }}
                        >
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            border: regOnOrderMatch?.id === p.id ? '7px solid var(--accent-primary)' : '2px solid var(--border)',
                            transition: 'border-width 0.1s',
                          }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>
                              Probe #{p.id}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                              {p.status}{p.notes ? ` · ${p.notes}` : ''}
                            </div>
                          </div>
                        </button>
                      ))}
                      {regOnOrderMatch && (
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '0 4px' }}>
                          #{regSerial || '…'} will be written to Probe #{regOnOrderMatch.id}. No new row created.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rack prompt */}
            {step === 'rack-prompt' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg fill="none" stroke="#22c55e" viewBox="0 0 24 24" width="32" height="32">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6 }}>Probe registered!</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5 }}>
                    {regOnOrderMatch
                      ? <><strong>#{regCreatedSerial}</strong> assigned to Probe #{regOnOrderMatch.id}.</>
                      : <><strong>{regType} #{regCreatedSerial}</strong> added to inventory.</>
                    }
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>Assign to a rack slot?</div>
                {error && (
                  <div style={{ color: '#ef4444', fontSize: 14, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, width: '100%' }}>{error}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleOpenRackPicker}
                    disabled={rackLoading}
                    style={{ padding: '16px', fontSize: 16, borderRadius: 10, width: '100%' }}
                  >
                    {rackLoading ? 'Loading racks…' : 'Assign to Rack'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setStep('done')}
                    style={{ padding: '16px', fontSize: 16, borderRadius: 10, width: '100%' }}
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}

            {/* Rack picker */}
            {step === 'rack-pick' && (() => {
              const rackIds = Array.from(new Set(rackSlots.map(s => s.rack))).sort((a, b) => {
                const n = (r: string) => parseInt(r.replace(/\D/g, ''), 10) || 0;
                const s = (r: string) => r.replace(/\d/g, '');
                return n(a) !== n(b) ? n(a) - n(b) : s(a) < s(b) ? -1 : 1;
              });
              const slotsByRack = rackSlots.filter(s => s.rack === pickerRack).sort((a, b) => a.rack_slot - b.rack_slot);
              const availCount = rackSlots.filter(s => s.rack === pickerRack && !s.probeId).length;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Pick a rack slot</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      Assigning <strong>#{regCreatedSerial}</strong> — tap an available (green) slot
                    </div>
                  </div>

                  {/* Rack tabs */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {rackIds.map(r => {
                      const avail = rackSlots.filter(s => s.rack === r && !s.probeId).length;
                      const total = rackSlots.filter(s => s.rack === r).length;
                      const active = pickerRack === r;
                      return (
                        <button
                          key={r}
                          onClick={() => { setPickerRack(r); setSelectedSlot(null); }}
                          style={{
                            padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: active ? '2px solid var(--accent-primary)' : '1px solid var(--border)',
                            background: active ? 'rgba(34,197,94,0.1)' : 'var(--bg-secondary)',
                            color: active ? 'var(--accent-primary)' : avail === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                          }}
                        >
                          Rack {r}
                          <span style={{ marginLeft: 5, fontWeight: 400, fontSize: 11, color: avail === 0 ? '#ef4444' : '#22c55e' }}>
                            {avail}/{total}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Slot grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 8 }}>
                    {slotsByRack.map(slot => {
                      const isFull = !!slot.probeId;
                      const isSelected = selectedSlot?.id === slot.id;
                      return (
                        <button
                          key={slot.id}
                          disabled={isFull}
                          onClick={() => setSelectedSlot(isSelected ? null : slot)}
                          title={isFull ? `Probe #${slot.probeSerial || slot.probeId} — full` : `Slot ${slot.rack_slot} — available`}
                          style={{
                            padding: '10px 4px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: isFull ? 'not-allowed' : 'pointer',
                            border: isSelected ? '2px solid var(--accent-primary)' : '1.5px solid transparent',
                            background: isSelected ? 'rgba(34,197,94,0.18)' : isFull ? '#fee2e2' : '#dcfce7',
                            color: isFull ? '#b91c1c' : '#15803d',
                            textAlign: 'center',
                            lineHeight: 1.2,
                          }}
                        >
                          <div>{slot.rack_slot}</div>
                          <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isFull ? (slot.probeSerial || '●') : 'open'}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ display: 'inline-block', width: 12, height: 12, background: '#dcfce7', borderRadius: 3, marginRight: 4, verticalAlign: 'middle' }} />open
                    <span style={{ display: 'inline-block', width: 12, height: 12, background: '#fee2e2', borderRadius: 3, margin: '0 4px 0 12px', verticalAlign: 'middle' }} />full
                    {availCount === 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}>This rack is full</span>}
                  </div>

                  {error && (
                    <div style={{ color: '#ef4444', fontSize: 14, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>{error}</div>
                  )}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleAssignRack}
                      disabled={!selectedSlot || rackSaving}
                      style={{ padding: '14px', fontSize: 15, borderRadius: 10, flex: 1 }}
                    >
                      {rackSaving ? 'Saving…' : selectedSlot ? `Assign to Rack ${selectedSlot.rack} / Slot ${selectedSlot.rack_slot}` : 'Select a slot'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setStep('done')}
                      style={{ padding: '14px', fontSize: 15, borderRadius: 10 }}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              );
            })()}

            {step === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg fill="none" stroke="#22c55e" viewBox="0 0 24 24" width="32" height="32">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6 }}>All done!</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.5 }}>
                    {regOnOrderMatch
                      ? <><strong>#{regCreatedSerial}</strong> assigned to Probe #{regOnOrderMatch.id}.</>
                      : <><strong>{regType} #{regCreatedSerial}</strong> added to inventory.</>
                    }
                    {selectedSlot && <><br />Assigned to Rack {selectedSlot.rack}, Slot {selectedSlot.rack_slot}.</>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                  <button className="btn btn-primary" onClick={resetRegister} style={{ padding: '16px', fontSize: 16, borderRadius: 10, width: '100%' }}>
                    Register Another
                  </button>
                  <button className="btn btn-secondary" onClick={() => setActiveWorkflow(null)} style={{ padding: '16px', fontSize: 16, borderRadius: 10, width: '100%' }}>
                    Back to Workflows
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </>
    );
  }

  // Uninstall workflow
  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Workflows</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>/ Uninstall Probe</span>
        </div>
        <div className="header-right">
          <button className="btn btn-secondary" onClick={() => { setActiveWorkflow(null); resetWorkflow(); }}>
            Cancel
          </button>
        </div>
      </header>
      <div className="content">
        <div style={{ maxWidth: 560 }}>

          {/* Step 1: Select probe */}
          {step === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Step 1 of 2 — Which probe was removed?</div>
              <div className="search-box" style={{ maxWidth: '100%' }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by field, probe serial, brand, or operation..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {installedProbes.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No installed probes found for the current season.</p>
              ) : filtered.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No probes match your search.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtered.map((probe) => (
                    <div
                      key={probe.assignmentId}
                      onClick={() => handleSelect(probe)}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: '12px 16px',
                        cursor: 'pointer',
                        background: 'var(--bg-secondary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                      className="workflow-card"
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {probe.fieldName}{probe.probeLabel ? ` — ${probe.probeLabel}` : ''}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>
                          {probe.probeBrand} #{probe.probeSerial}
                          {probe.operation ? ` · ${probe.operation}` : ''}
                          {probe.installDate ? ` · Installed ${probe.installDate}` : ''}
                        </div>
                      </div>
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Confirm details */}
          {step === 'confirm' && selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Step 2 of 2 — Confirm removal details</div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Probe being removed
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Field</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {selected.fieldName}{selected.probeLabel ? ` — ${selected.probeLabel}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Probe</span>
                    <span style={{ fontSize: 13 }}>{selected.probeBrand} #{selected.probeSerial}</span>
                  </div>
                  {selected.operation && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Operation</span>
                      <span style={{ fontSize: 13 }}>{selected.operation}</span>
                    </div>
                  )}
                  {selected.installDate && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Originally installed</span>
                      <span style={{ fontSize: 13 }}>{selected.installDate}</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                    Removal date
                  </label>
                  <input
                    type="date"
                    value={removalDate}
                    onChange={(e) => setRemovalDate(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      width: '100%',
                      maxWidth: 200,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                    Removal notes <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
                  </label>
                  <textarea
                    value={removalNotes}
                    onChange={(e) => setRemovalNotes(e.target.value)}
                    placeholder="e.g. End of season, damaged, customer request..."
                    rows={3}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      width: '100%',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </div>

              {error && (
                <div style={{ color: '#ef4444', fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setStep('select')}>
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={saving || !removalDate}
                >
                  {saving ? 'Saving...' : 'Confirm Removal'}
                </button>
              </div>
            </div>
          )}

          {/* Done */}
          {step === 'done' && selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg fill="none" stroke="#22c55e" viewBox="0 0 24 24" width="24" height="24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Probe removed</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  <strong>{selected.probeBrand} #{selected.probeSerial}</strong> removed from{' '}
                  <strong>{selected.fieldName}</strong> on {removalDate}.
                  Probe status set to In Stock.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={() => { resetWorkflow(); }}>
                  Remove Another Probe
                </button>
                <button className="btn btn-secondary" onClick={() => setActiveWorkflow(null)}>
                  Back to Workflows
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
