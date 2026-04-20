'use client';

import React from 'react';
import SearchableSelect from './SearchableSelect';

export interface InlineCellProps {
  fieldSeasonId: number | null;
  field: string;
  value: string | number | boolean | null | undefined;
  type: 'text' | 'select' | 'number' | 'checkbox';
  options?: { value: string; label: string }[];
  onSave: (fieldSeasonId: number, field: string, value: unknown) => Promise<void>;
  savingFields: Set<string>;
  savedFields: Set<string>;
}

export default function InlineCell({ fieldSeasonId, field, value, type, options, onSave, savingFields, savedFields }: InlineCellProps) {
  const cellKey = `${fieldSeasonId}-${field}`;
  const isSaving = savingFields.has(cellKey);
  const justSaved = savedFields.has(cellKey);

  const handleChange = async (newValue: unknown) => {
    if (!fieldSeasonId) return;
    await onSave(fieldSeasonId, field, newValue);
  };

  if (type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => handleChange(e.target.checked)}
          disabled={isSaving}
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
        />
        {isSaving && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...</span>}
        {justSaved && <span style={{ fontSize: '10px', color: 'var(--accent-primary)' }}>✓</span>}
      </div>
    );
  }

  if (type === 'select') {
    const sorted = options?.slice().sort((a, b) => a.label.localeCompare(b.label)) || [];
    const useSearchable = sorted.length >= 15;
    return (
      <div style={{ position: 'relative' }}>
        {useSearchable ? (
          <SearchableSelect
            value={value as string || ''}
            onChange={(v) => handleChange(v || null)}
            options={sorted}
            disabled={isSaving}
            style={{
              background: justSaved ? 'var(--accent-primary-dim)' : undefined,
              transition: 'background 0.3s',
            }}
          />
        ) : (
          <select
            value={value as string || ''}
            onChange={(e) => handleChange(e.target.value || null)}
            disabled={isSaving}
            style={{
              width: '100%',
              padding: '4px 6px',
              fontSize: '12px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: justSaved ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)',
              transition: 'background 0.3s',
            }}
          >
            <option value="">—</option>
            {sorted.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        {isSaving && (
          <span style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  if (type === 'number') {
    return <InlineNumberCell
      value={value}
      onSave={handleChange}
      isSaving={isSaving}
      justSaved={justSaved}
    />;
  }

  return <span>{value?.toString() || '—'}</span>;
}

// Buffered integer input — no spinner arrows, numeric keyboard on mobile,
// saves only on blur or Enter so typing feels instant.
function InlineNumberCell({
  value, onSave, isSaving, justSaved,
}: {
  value: string | number | boolean | null | undefined;
  onSave: (v: unknown) => Promise<void>;
  isSaving: boolean;
  justSaved: boolean;
}) {
  // Format incoming value as a clean integer string ('1.0' → '1')
  const toDisplay = (v: InlineCellProps['value']): string => {
    if (v == null || v === '') return '';
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? String(n) : '';
  };

  const [local, setLocal] = React.useState<string>(() => toDisplay(value));
  const [focused, setFocused] = React.useState(false);

  // Sync external value in — but don't clobber what the user is actively typing.
  React.useEffect(() => {
    if (!focused) setLocal(toDisplay(value));
  }, [value, focused]);

  const commit = async () => {
    const trimmed = local.trim();
    const current = toDisplay(value);
    if (trimmed === current) return; // nothing changed
    await onSave(trimmed === '' ? null : parseInt(trimmed, 10));
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={local}
        onChange={(e) => setLocal(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setLocal(toDisplay(value)); (e.target as HTMLInputElement).blur(); }
        }}
        disabled={isSaving}
        placeholder="—"
        style={{
          width: '60px',
          padding: '4px 6px',
          fontSize: '12px',
          textAlign: 'center',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          background: justSaved ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)',
          transition: 'background 0.3s',
          fontVariantNumeric: 'tabular-nums',
        }}
      />
      {isSaving && (
        <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
      )}
    </div>
  );
}
