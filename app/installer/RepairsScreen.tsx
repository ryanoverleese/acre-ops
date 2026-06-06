'use client';

import { useEffect, useState } from 'react';

interface InstallerRepair {
  id: number;
  fieldSeasonId: number;
  fieldName: string;
  operation: string;
  lat: number;
  lng: number;
  problem: string;
  reportedAt: string;
  probeSerial: string;
  probeAssignmentId: number | null;
  probeNumber: number | null;
  label: string;
}

interface FieldOption {
  fieldSeasonId: number;
  fieldName: string;
  operation: string;
  probes: { probeAssignmentId: number; probeNumber: number; label: string }[];
}

interface UnassignedProbe {
  id: number;
  serial: string;
  brand: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 16,
  border: '1.5px solid var(--border-1)', borderRadius: 10,
  background: '#fff', color: 'var(--ink)', boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const taStyle: React.CSSProperties = {
  ...inputStyle, resize: 'vertical', minHeight: 90,
};

const backBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  color: 'var(--field-green)', fontWeight: 600, fontSize: 14,
  fontFamily: 'var(--font-display)', letterSpacing: '0.08em',
  textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer',
};

// ── CreateRepairForm ──────────────────────────────────────────────────────────

function CreateRepairForm({ season, onBack, onSaved }: {
  season: number;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedField, setSelectedField] = useState<FieldOption | null>(null);
  const [selectedPaId, setSelectedPaId] = useState<number | null>(null);
  const [problem, setProblem] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/installer/fields?season=${season}`)
      .then(r => r.json())
      .then(d => { setFieldOptions(d.fields ?? []); setLoadingFields(false); });
  }, [season]);

  const filtered = query.length >= 2 && !selectedField
    ? fieldOptions.filter(f =>
        f.fieldName.toLowerCase().includes(query.toLowerCase()) ||
        f.operation.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  const selectField = (f: FieldOption) => {
    setSelectedField(f);
    setQuery(f.fieldName);
    setSelectedPaId(f.probes.length === 1 ? f.probes[0].probeAssignmentId : null);
  };

  const handleSubmit = async () => {
    if (!selectedField || !problem.trim()) return;
    setSubmitting(true); setError('');
    try {
      const body: Record<string, unknown> = {
        field_season: selectedField.fieldSeasonId,
        problem: problem.trim(),
        reported_at: new Date().toISOString().split('T')[0],
      };
      if (selectedPaId) body.probe_assignment = selectedPaId;
      const res = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setError('Failed to save — try again'); setSubmitting(false); return; }
      onSaved();
    } catch { setError('Network error'); setSubmitting(false); }
  };

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button onClick={onBack} style={backBtnStyle}>Cancel</button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">New Repair</div>
        </div>
        <div style={{ width: 60 }} />
      </div>

      <div className="af-body" style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Field search */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 6 }}>Field</div>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedField(null); setSelectedPaId(null); }}
            placeholder={loadingFields ? 'Loading fields…' : 'Search by field or operation…'}
            disabled={loadingFields}
            style={inputStyle}
            autoComplete="off"
          />
          {filtered.length > 0 && (
            <div style={{
              border: '1.5px solid var(--border-1)', borderRadius: 10, marginTop: 6,
              overflow: 'hidden', background: '#fff',
              boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
            }}>
              {filtered.map((f, i) => (
                <button
                  key={f.fieldSeasonId}
                  onClick={() => selectField(f)}
                  style={{
                    width: '100%', padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
                    background: 'none', border: 'none',
                    borderTop: i > 0 ? '1px solid var(--border-1)' : 'none',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{f.fieldName}</div>
                  <div style={{ fontSize: 12, color: 'var(--stone-500)' }}>{f.operation}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Probe chooser (multi-probe fields) */}
        {selectedField && selectedField.probes.length > 1 && (
          <div>
            <div className="af-eyebrow" style={{ marginBottom: 6 }}>Which Probe?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selectedField.probes.map(p => (
                <button
                  key={p.probeAssignmentId}
                  onClick={() => setSelectedPaId(p.probeAssignmentId)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontWeight: 700, fontSize: 14,
                    background: selectedPaId === p.probeAssignmentId ? 'var(--field-green)' : '#f0ede8',
                    color: selectedPaId === p.probeAssignmentId ? 'var(--bone)' : 'var(--ink)',
                  }}
                >
                  {p.label || `Probe ${p.probeNumber}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Problem */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 6 }}>Problem</div>
          <textarea
            value={problem}
            onChange={e => setProblem(e.target.value)}
            placeholder="Describe the issue…"
            style={taStyle}
          />
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 14 }}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={!selectedField || !problem.trim() || submitting || (selectedField.probes.length > 1 && !selectedPaId)}
          style={{
            padding: '16px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--field-green)', color: 'var(--bone)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            opacity: (!selectedField || !problem.trim() || submitting) ? 0.5 : 1,
          }}
        >
          {submitting ? 'Saving…' : 'Log Repair Ticket'}
        </button>
      </div>
    </div>
  );
}

// ── CloseOutForm ──────────────────────────────────────────────────────────────

function CloseOutForm({ repair, onBack, onSaved }: {
  repair: InstallerRepair;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [fix, setFix] = useState('');
  const [probeReplaced, setProbeReplaced] = useState(false);
  const [unassignedProbes, setUnassignedProbes] = useState<UnassignedProbe[]>([]);
  const [loadingProbes, setLoadingProbes] = useState(false);
  const [newSerial, setNewSerial] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!probeReplaced) return;
    setLoadingProbes(true);
    fetch('/api/installer/unassigned-probes', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setUnassignedProbes(d.probes ?? []); setLoadingProbes(false); });
  }, [probeReplaced]);

  const canSubmit = fix.trim() && (!probeReplaced || newSerial) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError('');
    try {
      const body: Record<string, unknown> = {
        fix: fix.trim(),
        repaired_at: new Date().toISOString().split('T')[0],
        probe_replaced: probeReplaced,
      };
      if (probeReplaced && newSerial) body.new_probe_serial = newSerial;
      const res = await fetch(`/api/repairs/${repair.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setError('Failed to save — try again'); setSubmitting(false); return; }
      onSaved();
    } catch { setError('Network error'); setSubmitting(false); }
  };

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button onClick={onBack} style={backBtnStyle}>Cancel</button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Close Out</div>
        </div>
        <div style={{ width: 60 }} />
      </div>

      <div className="af-body" style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Repair summary */}
        <div style={{
          padding: '12px 14px', background: '#fff5f5', borderRadius: 12,
          border: '1.5px solid #fecaca',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{repair.fieldName}</div>
          </div>
          {repair.operation && <div style={{ fontSize: 12, color: 'var(--stone-500)', marginLeft: 18 }}>{repair.operation}</div>}
          {repair.problem && (
            <div style={{ fontSize: 14, color: 'var(--ink)', marginTop: 8, marginLeft: 18, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 600 }}>Problem: </span>{repair.problem}
            </div>
          )}
          {repair.probeSerial && (
            <div style={{ fontSize: 12, color: 'var(--stone-500)', marginTop: 4, marginLeft: 18, fontFamily: 'var(--font-mono)' }}>#{repair.probeSerial}</div>
          )}
          {repair.reportedAt && (
            <div style={{ fontSize: 11, color: 'var(--stone-500)', marginTop: 4, marginLeft: 18 }}>Reported {repair.reportedAt}</div>
          )}
        </div>

        {/* How fixed */}
        <div>
          <div className="af-eyebrow" style={{ marginBottom: 6 }}>How was it fixed?</div>
          <textarea
            value={fix}
            onChange={e => setFix(e.target.value)}
            placeholder="Describe what you did…"
            style={taStyle}
          />
        </div>

        {/* Probe replaced toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 14, color: 'var(--ink)' }}>
            Probe Replaced
          </div>
          <button
            onClick={() => { setProbeReplaced(p => !p); setNewSerial(''); }}
            style={{
              width: 52, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
              background: probeReplaced ? 'var(--field-green)' : '#d1d5db',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 4, left: probeReplaced ? 26 : 4,
              width: 22, height: 22, borderRadius: 11,
              background: '#fff', transition: 'left 0.2s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            }} />
          </button>
        </div>

        {/* Serial chooser */}
        {probeReplaced && (
          <div>
            <div className="af-eyebrow" style={{ marginBottom: 6 }}>New Probe Serial #</div>
            {loadingProbes ? (
              <div style={{ color: 'var(--stone-500)', fontSize: 14, padding: '10px 0' }}>Loading inventory…</div>
            ) : unassignedProbes.length === 0 ? (
              <div style={{ color: 'var(--stone-500)', fontSize: 14, padding: '10px 0' }}>No unassigned probes found</div>
            ) : (
              <div style={{
                border: '1.5px solid var(--border-1)', borderRadius: 10,
                overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
              }}>
                {unassignedProbes.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setNewSerial(p.serial)}
                    style={{
                      width: '100%', padding: '10px 14px', textAlign: 'left',
                      border: 'none', borderTop: i > 0 ? '1px solid var(--border-1)' : 'none',
                      cursor: 'pointer',
                      background: newSerial === p.serial ? 'var(--field-green)' : '#fff',
                      color: newSerial === p.serial ? 'var(--bone)' : 'var(--ink)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 15 }}>#{p.serial}</span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>{p.brand}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div style={{ color: '#ef4444', fontSize: 14 }}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            padding: '16px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--field-green)', color: 'var(--bone)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {submitting ? 'Saving…' : 'Mark Repaired ✓'}
        </button>
      </div>
    </div>
  );
}

// ── RepairsScreen ─────────────────────────────────────────────────────────────

export default function RepairsScreen({ season, onBack }: {
  season: number;
  onBack: () => void;
}) {
  const [repairs, setRepairs] = useState<InstallerRepair[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscreen, setSubscreen] = useState<'list' | 'create' | 'closeout'>('list');
  const [selected, setSelected] = useState<InstallerRepair | null>(null);

  const fetchRepairs = async (fresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/installer/repairs?season=${season}${fresh ? '&fresh=1' : ''}`, fresh ? { cache: 'no-store' } : undefined);
      const data = await res.json();
      setRepairs(data.repairs ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRepairs(); }, []);

  const handleSaved = () => { setSubscreen('list'); setSelected(null); fetchRepairs(true); };

  if (subscreen === 'create') {
    return <CreateRepairForm season={season} onBack={() => setSubscreen('list')} onSaved={handleSaved} />;
  }
  if (subscreen === 'closeout' && selected) {
    return <CloseOutForm repair={selected} onBack={() => { setSubscreen('list'); setSelected(null); }} onSaved={handleSaved} />;
  }

  return (
    <div className="af-screen">
      <div className="af-topbar">
        <button onClick={onBack} style={backBtnStyle}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="af-topbar-title">Repairs</div>
          <div className="af-topbar-sub">{loading ? '…' : `${repairs.length} open`}</div>
        </div>
        <button
          onClick={() => setSubscreen('create')}
          style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'var(--bone-raised,#f0ede8)', border: '1px solid var(--border-1)',
            color: 'var(--field-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
          aria-label="New repair"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="af-body" style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--stone-500)', fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Loading…
          </div>
        ) : repairs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--stone-500)' }}>
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}>
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
            </svg>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>No open repairs</div>
            <div style={{ fontSize: 13 }}>Tap + to log a new ticket</div>
          </div>
        ) : (
          repairs.map(r => (
            <button
              key={r.id}
              onClick={() => { setSelected(r); setSubscreen('closeout'); }}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
                padding: '14px 16px', borderRadius: 12, width: '100%', textAlign: 'left',
                background: '#fff', border: '1.5px solid var(--border-1)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, textTransform: 'uppercase', letterSpacing: '0.04em', flex: 1, color: 'var(--ink)' }}>
                  {r.fieldName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--stone-500)', flexShrink: 0 }}>{r.reportedAt}</div>
              </div>
              {r.operation && <div style={{ fontSize: 12, color: 'var(--stone-500)', marginLeft: 18 }}>{r.operation}</div>}
              {r.problem && (
                <div style={{ fontSize: 14, color: 'var(--ink)', marginLeft: 18, lineHeight: 1.4 }}>
                  {r.problem.length > 80 ? r.problem.slice(0, 80) + '…' : r.problem}
                </div>
              )}
              {r.probeSerial && (
                <div style={{ fontSize: 12, color: 'var(--stone-500)', marginLeft: 18, fontFamily: 'var(--font-mono)' }}>
                  #{r.probeSerial}{r.label ? ` · ${r.label}` : ''}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
