'use client';

import { useState } from 'react';
import type { FieldInfoItem, FieldInfoSelectOptions, BillingEntityOption } from './page';

interface FieldInfoClientProps {
  operationName: string;
  season: number;
  token: string;
  fields: FieldInfoItem[];
  selectOptions: FieldInfoSelectOptions;
  billingEntityOptions: BillingEntityOption[];
  visibleQuestions: string[];
}

interface FieldForm {
  irrigationType: string;
  rowDirection: string;
  waterSource: string;
  fuelSource: string;
  crop: string;
  sideDress: string;
  hybridVariety: string;
  plantingDate: string;
}

function ButtonGroup({ label, options, value, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {options.map((o) => {
          const isSelected = value === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(isSelected ? '' : o.value)}
              style={{
                padding: isSelected ? '10px 18px' : '8px 16px',
                fontSize: isSelected ? '15px' : '14px',
                border: isSelected ? '2px solid var(--accent-green)' : '1px solid var(--border)',
                borderRadius: '20px',
                cursor: 'pointer',
                background: isSelected ? 'var(--accent-green)' : 'var(--bg-card)',
                color: isSelected ? '#fff' : 'var(--text-primary)',
                fontWeight: isSelected ? 700 : 400,
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? '0 2px 8px rgba(76, 175, 80, 0.4)' : 'none',
                transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isSelected && (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FieldInfoClient({ operationName, season, token, fields: initialFields, selectOptions, billingEntityOptions, visibleQuestions }: FieldInfoClientProps) {
  const showQuestion = (key: string) => visibleQuestions.includes(key);
  const [fields, setFields] = useState(initialFields);
  const [billingEntities, setBillingEntities] = useState<Record<number, number | null>>(() => {
    const initial: Record<number, number | null> = {};
    initialFields.forEach((f) => {
      initial[f.fieldId] = f.billingEntityId;
    });
    return initial;
  });
  const [beSaving, setBeSaving] = useState<Record<number, boolean>>({});
  const [beSaved, setBeSaved] = useState<Record<number, boolean>>({});
  const [forms, setForms] = useState<Record<number, FieldForm>>(() => {
    const initial: Record<number, FieldForm> = {};
    initialFields.forEach((f) => {
      initial[f.fieldSeasonId] = {
        irrigationType: f.irrigationType,
        rowDirection: f.rowDirection,
        waterSource: f.waterSource,
        fuelSource: f.fuelSource,
        crop: f.crop,
        sideDress: f.sideDress,
        hybridVariety: f.hybridVariety,
        plantingDate: f.plantingDate,
      };
    });
    return initial;
  });
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});

  const API_FIELD_MAP: Record<string, string> = {
    irrigationType: 'irrigation_type',
    rowDirection: 'row_direction',
    waterSource: 'water_source',
    fuelSource: 'fuel_source',
    crop: 'crop',
    sideDress: 'side_dress',
    hybridVariety: 'hybrid_variety',
    plantingDate: 'planting_date',
  };

  const saveFieldChange = async (field: FieldInfoItem, key: keyof FieldForm, value: string) => {
    // Update form state immediately
    setForms((prev) => ({
      ...prev,
      [field.fieldSeasonId]: { ...prev[field.fieldSeasonId], [key]: value },
    }));

    const apiField = API_FIELD_MAP[key];
    if (!apiField) return;

    setSaving((prev) => ({ ...prev, [field.fieldSeasonId]: true }));
    try {
      const res = await fetch('/api/field-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          fieldId: field.fieldId,
          fieldSeasonId: field.fieldSeasonId,
          field: apiField,
          value: value || '',
        }),
      });

      if (!res.ok) throw new Error('Failed to save');

      setFields((prev) => prev.map((f) =>
        f.fieldSeasonId === field.fieldSeasonId ? { ...f, [key]: value } : f
      ));
      setSaved((prev) => ({ ...prev, [field.fieldSeasonId]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [field.fieldSeasonId]: false })), 2000);
    } catch {
      // silent fail - user can retry by tapping again
    } finally {
      setSaving((prev) => ({ ...prev, [field.fieldSeasonId]: false }));
    }
  };

  const saveBillingEntity = async (field: FieldInfoItem, beId: number | null) => {
    setBillingEntities((prev) => ({ ...prev, [field.fieldId]: beId }));
    setBeSaving((prev) => ({ ...prev, [field.fieldId]: true }));
    try {
      const res = await fetch('/api/field-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          fieldId: field.fieldId,
          field: 'billing_entity',
          value: beId,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setBeSaved((prev) => ({ ...prev, [field.fieldId]: true }));
      setTimeout(() => setBeSaved((prev) => ({ ...prev, [field.fieldId]: false })), 2000);
    } catch {
      // silent fail - user can retry
    } finally {
      setBeSaving((prev) => ({ ...prev, [field.fieldId]: false }));
    }
  };

  const filledCount = fields.filter((f) => {
    const form = forms[f.fieldSeasonId];
    return form && (form.irrigationType || form.crop);
  }).length;

  return (
    <div className="approval-page">
      <div className="approval-container">
        <header className="approval-header">
          <div className="approval-header-content">
            <h1>{operationName}</h1>
            <p className="approval-subtitle">{season} Season - Field Information</p>
          </div>
          <div className="approval-progress">
            <div className="progress-stats">
              <span className="stat approved">{filledCount} Updated</span>
              <span className="stat pending">{fields.length - filledCount} Remaining</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${fields.length > 0 ? (filledCount / fields.length) * 100 : 0}%` }}
              />
            </div>
            <p className="progress-text">{filledCount} of {fields.length} fields have info</p>
          </div>
        </header>

        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '15px', margin: '0 0 24px' }}>
          Tap to select options for each field. Changes save automatically.
        </p>

        <div className="approval-fields">
          {fields.map((field) => {
            const form = forms[field.fieldSeasonId];
            if (!form) return null;
            const isSaving = saving[field.fieldSeasonId];
            const isSaved = saved[field.fieldSeasonId];

            return (
              <div key={field.fieldSeasonId} className="approval-card expanded" style={{ marginBottom: '20px' }}>
                <div className="card-header">
                  <div className="card-title">
                    <h3>{field.name}</h3>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{field.acres} acres</span>
                  </div>
                </div>

                <div className="card-content">
                  {showQuestion('billing_entity') && billingEntityOptions.length > 1 && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Billing Entity
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                          value={billingEntities[field.fieldId] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value, 10) : null;
                            saveBillingEntity(field, val);
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            fontSize: '14px',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            boxSizing: 'border-box',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">Select billing entity...</option>
                          {billingEntityOptions.map((be) => (
                            <option key={be.id} value={be.id}>{be.name}</option>
                          ))}
                        </select>
                        {beSaving[field.fieldId] && (
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Saving...</span>
                        )}
                        {beSaved[field.fieldId] && (
                          <span style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Saved
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {showQuestion('crop') && (
                    <ButtonGroup
                      label="Crop"
                      options={selectOptions.crop}
                      value={form.crop}
                      onChange={(v) => saveFieldChange(field, 'crop', v)}
                    />
                  )}

                  {showQuestion('irrigation_type') && (
                    <ButtonGroup
                      label="Irrigation Type"
                      options={selectOptions.irrigation_type}
                      value={form.irrigationType}
                      onChange={(v) => saveFieldChange(field, 'irrigationType', v)}
                    />
                  )}

                  {showQuestion('row_direction') && (
                    <ButtonGroup
                      label="Row Direction"
                      options={selectOptions.row_direction}
                      value={form.rowDirection}
                      onChange={(v) => saveFieldChange(field, 'rowDirection', v)}
                    />
                  )}

                  {showQuestion('side_dress') && (
                    <ButtonGroup
                      label="Side Dress"
                      options={selectOptions.side_dress}
                      value={form.sideDress}
                      onChange={(v) => saveFieldChange(field, 'sideDress', v)}
                    />
                  )}

                  {showQuestion('water_source') && (
                    <ButtonGroup
                      label="Water Source"
                      options={selectOptions.water_source}
                      value={form.waterSource}
                      onChange={(v) => saveFieldChange(field, 'waterSource', v)}
                    />
                  )}

                  {showQuestion('fuel_source') && (
                    <ButtonGroup
                      label="Fuel Source"
                      options={selectOptions.fuel_source}
                      value={form.fuelSource}
                      onChange={(v) => saveFieldChange(field, 'fuelSource', v)}
                    />
                  )}

                  {/* Text fields for hybrid/planting date - save on blur */}
                  {(showQuestion('hybrid_variety') || showQuestion('planting_date')) && (
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {showQuestion('hybrid_variety') && (
                    <div style={{ flex: '1 1 200px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Hybrid / Variety
                      </div>
                      <input
                        type="text"
                        value={form.hybridVariety}
                        onChange={(e) => setForms((prev) => ({ ...prev, [field.fieldSeasonId]: { ...prev[field.fieldSeasonId], hybridVariety: e.target.value } }))}
                        onBlur={(e) => { if (e.target.value !== field.hybridVariety) saveFieldChange(field, 'hybridVariety', e.target.value); }}
                        placeholder="e.g. P1185AM"
                        style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', boxSizing: 'border-box' }}
                      />
                    </div>
                    )}
                    {showQuestion('planting_date') && (
                    <div style={{ flex: '1 1 200px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Planting Date
                      </div>
                      <input
                        type="date"
                        value={form.plantingDate}
                        onChange={(e) => saveFieldChange(field, 'plantingDate', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', boxSizing: 'border-box' }}
                      />
                    </div>
                    )}
                  </div>
                  )}

                  {/* Auto-save indicator */}
                  {(isSaving || isSaved) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                      {isSaving && (
                        <span style={{ color: 'var(--text-muted)' }}>Saving...</span>
                      )}
                      {isSaved && (
                        <span style={{ color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Saved
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="approval-footer">
          <p>Thank you for providing your field information.</p>
        </footer>
      </div>
    </div>
  );
}
