'use client';

import React from 'react';

export interface InlineProbeCellProps {
  probeAssignmentId: number;
  field: string;
  value: string | number | boolean | null | undefined;
  type: 'text' | 'select' | 'number' | 'checkbox';
  options?: { value: string; label: string }[];
  onSave: (probeAssignmentId: number, field: string, value: unknown) => Promise<void>;
  onAction?: (actionValue: string) => void;
  savingFields: Set<string>;
  savedFields: Set<string>;
}

export default function InlineProbeCell({ probeAssignmentId, field, value, type, options, onSave, onAction, savingFields, savedFields }: InlineProbeCellProps) {
  const cellKey = `pa-${probeAssignmentId}-${field}`;
  const isSaving = savingFields.has(cellKey);
  const justSaved = savedFields.has(cellKey);

  const handleChange = async (newValue: unknown) => {
    // Intercept special action values (e.g., "__create_new__")
    if (typeof newValue === 'string' && newValue.startsWith('__') && newValue.endsWith('__') && onAction) {
      onAction(newValue);
      return;
    }
    await onSave(probeAssignmentId, field, newValue);
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
        {justSaved && <span style={{ fontSize: '10px', color: 'var(--accent-green)' }}>✓</span>}
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div style={{ position: 'relative' }}>
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
            background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)',
            transition: 'background 0.3s',
          }}
        >
          <option value="">—</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {isSaving && (
          <span style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          value={value as number || ''}
          onChange={(e) => handleChange(e.target.value ? parseFloat(e.target.value) : null)}
          disabled={isSaving}
          step="any"
          style={{
            width: '80px',
            padding: '4px 6px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)',
            transition: 'background 0.3s',
          }}
        />
        {isSaving && (
          <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={value as string || ''}
          onChange={(e) => handleChange(e.target.value || null)}
          disabled={isSaving}
          style={{
            width: '100%',
            padding: '4px 6px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)',
            transition: 'background 0.3s',
          }}
        />
        {isSaving && (
          <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  return <span>{value?.toString() || '—'}</span>;
}
