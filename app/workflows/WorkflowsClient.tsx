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

type Step = 'select' | 'confirm' | 'done';

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
  const [regOnOrderMatch, setRegOnOrderMatch] = useState<OnOrderProbe | null>(null);

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
      if (regOnOrderMatch) {
        // Swap serial number onto existing on-order probe row
        const res = await fetch(`/api/probes/${regOnOrderMatch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial_number: regSerial.trim(), status: 'In Stock' }),
        });
        if (!res.ok) throw new Error('Failed to update probe');
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
      }
      setRegCreatedSerial(regSerial.trim());
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const resetRegister = () => {
    setRegSerial('');
    setRegType(brandOptions.find(b => b.toLowerCase().includes('cropx v4')) || brandOptions.find(b => b.toLowerCase().includes('cropx')) || brandOptions[0] || '');
    setRegYearNew(String(new Date().getFullYear()));
    setRegCreatedSerial('');
    setRegOnOrderMatch(null);
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
    return (
      <>
        <header className="header">
          <div className="header-left">
            <h2>Workflows</h2>
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>/ Register New Probe</span>
          </div>
          <div className="header-right">
            <button className="btn btn-secondary" onClick={() => { setActiveWorkflow(null); resetRegister(); }}>
              Cancel
            </button>
          </div>
        </header>
        <div className="content">
          <div style={{ maxWidth: 480 }}>

            {step === 'select' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Enter probe details</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Serial Number *</label>
                    <input
                      type="text"
                      value={regSerial}
                      onChange={(e) => setRegSerial(e.target.value)}
                      placeholder="e.g. 12345"
                      inputMode="numeric"
                      autoFocus
                      style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Probe Type</label>
                    <select
                      value={regType}
                      onChange={(e) => setRegType(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, width: '100%' }}
                    >
                      {brandOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Year New</label>
                    <input
                      type="number"
                      value={regYearNew}
                      onChange={(e) => setRegYearNew(e.target.value)}
                      min="2000"
                      max="2099"
                      style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, width: 120 }}
                    />
                  </div>
                </div>

                {/* On-order match suggestion */}
                {matchingOnOrder.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
                      Assign to On Order slot?
                      <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
                        — {matchingOnOrder.length} {regType} on order
                      </span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {matchingOnOrder.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setRegOnOrderMatch(regOnOrderMatch?.id === p.id ? null : p)}
                          style={{
                            padding: '10px 14px',
                            border: `2px solid ${regOnOrderMatch?.id === p.id ? 'var(--accent-primary)' : 'var(--border)'}`,
                            borderRadius: 8,
                            background: regOnOrderMatch?.id === p.id ? 'rgba(34,197,94,0.08)' : 'var(--bg-secondary)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                            border: regOnOrderMatch?.id === p.id ? '6px solid var(--accent-primary)' : '2px solid var(--border)',
                          }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              {p.status} — Probe #{p.id}
                            </div>
                            {p.notes && (
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{p.notes}</div>
                            )}
                          </div>
                        </button>
                      ))}
                      {regOnOrderMatch && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          Serial #{regSerial || '…'} will replace the on-order slot. No new row created.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <div style={{ color: '#ef4444', fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>{error}</div>
                )}

                <button
                  className="btn btn-primary"
                  onClick={handleRegisterSubmit}
                  disabled={saving || !regSerial.trim()}
                >
                  {saving ? 'Saving...' : regOnOrderMatch ? 'Assign Serial to On Order Slot' : 'Register as New Probe'}
                </button>
              </div>
            )}

            {step === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg fill="none" stroke="#22c55e" viewBox="0 0 24 24" width="24" height="24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Probe registered</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {regOnOrderMatch
                      ? <><strong>#{regCreatedSerial}</strong> assigned to on-order slot (Probe #{regOnOrderMatch.id}). Status set to In Stock.</>
                      : <><strong>{regType} #{regCreatedSerial}</strong> added to inventory with status In Stock.</>
                    }
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-primary" onClick={resetRegister}>Register Another</button>
                  <button className="btn btn-secondary" onClick={() => setActiveWorkflow(null)}>Back to Workflows</button>
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
