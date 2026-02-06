'use client';

import { useState } from 'react';
import type { FieldInfoItem, FieldInfoSelectOptions } from './page';

interface FieldInfoClientProps {
  operationName: string;
  season: number;
  fields: FieldInfoItem[];
  selectOptions: FieldInfoSelectOptions;
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

export default function FieldInfoClient({ operationName, season, fields: initialFields, selectOptions }: FieldInfoClientProps) {
  const [fields, setFields] = useState(initialFields);
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

  const updateForm = (fieldSeasonId: number, key: keyof FieldForm, value: string) => {
    setForms((prev) => ({
      ...prev,
      [fieldSeasonId]: { ...prev[fieldSeasonId], [key]: value },
    }));
    setSaved((prev) => ({ ...prev, [fieldSeasonId]: false }));
  };

  const handleSave = async (field: FieldInfoItem) => {
    const form = forms[field.fieldSeasonId];
    if (!form) return;

    setSaving((prev) => ({ ...prev, [field.fieldSeasonId]: true }));
    try {
      // Save field-level data
      const fieldBody: Record<string, unknown> = {};
      if (form.irrigationType !== field.irrigationType) fieldBody.irrigation_type = form.irrigationType || null;
      if (form.rowDirection !== field.rowDirection) fieldBody.row_direction = form.rowDirection || null;
      if (form.waterSource !== field.waterSource) fieldBody.water_source = form.waterSource || null;
      if (form.fuelSource !== field.fuelSource) fieldBody.fuel_source = form.fuelSource || null;

      if (Object.keys(fieldBody).length > 0) {
        const res = await fetch(`/api/fields/${field.fieldId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fieldBody),
        });
        if (!res.ok) {
          alert('Failed to save field data');
          return;
        }
      }

      // Save field_season-level data
      const seasonBody: Record<string, unknown> = {};
      if (form.crop !== field.crop) seasonBody.crop = form.crop || null;
      if (form.sideDress !== field.sideDress) seasonBody.side_dress = form.sideDress || null;
      if (form.hybridVariety !== field.hybridVariety) seasonBody.hybrid_variety = form.hybridVariety || null;
      if (form.plantingDate !== field.plantingDate) seasonBody.planting_date = form.plantingDate || null;

      if (Object.keys(seasonBody).length > 0) {
        const res = await fetch(`/api/field-seasons/${field.fieldSeasonId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(seasonBody),
        });
        if (!res.ok) {
          alert('Failed to save season data');
          return;
        }
      }

      // Update local state
      setFields((prev) =>
        prev.map((f) =>
          f.fieldSeasonId === field.fieldSeasonId
            ? { ...f, ...form }
            : f
        )
      );
      setSaved((prev) => ({ ...prev, [field.fieldSeasonId]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [field.fieldSeasonId]: false })), 3000);
    } catch {
      alert('Failed to save');
    } finally {
      setSaving((prev) => ({ ...prev, [field.fieldSeasonId]: false }));
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
          Tap to select options for each field, then hit Save.
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
                  <ButtonGroup
                    label="Crop"
                    options={selectOptions.crop}
                    value={form.crop}
                    onChange={(v) => updateForm(field.fieldSeasonId, 'crop', v)}
                  />

                  <ButtonGroup
                    label="Irrigation Type"
                    options={selectOptions.irrigation_type}
                    value={form.irrigationType}
                    onChange={(v) => updateForm(field.fieldSeasonId, 'irrigationType', v)}
                  />

                  <ButtonGroup
                    label="Row Direction"
                    options={selectOptions.row_direction}
                    value={form.rowDirection}
                    onChange={(v) => updateForm(field.fieldSeasonId, 'rowDirection', v)}
                  />

                  <ButtonGroup
                    label="Side Dress"
                    options={selectOptions.side_dress}
                    value={form.sideDress}
                    onChange={(v) => updateForm(field.fieldSeasonId, 'sideDress', v)}
                  />

                  <ButtonGroup
                    label="Water Source"
                    options={selectOptions.water_source}
                    value={form.waterSource}
                    onChange={(v) => updateForm(field.fieldSeasonId, 'waterSource', v)}
                  />

                  <ButtonGroup
                    label="Fuel Source"
                    options={selectOptions.fuel_source}
                    value={form.fuelSource}
                    onChange={(v) => updateForm(field.fieldSeasonId, 'fuelSource', v)}
                  />

                  {/* Text fields for hybrid/planting date */}
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Hybrid / Variety
                      </div>
                      <input
                        type="text"
                        value={form.hybridVariety}
                        onChange={(e) => updateForm(field.fieldSeasonId, 'hybridVariety', e.target.value)}
                        placeholder="e.g. P1185AM"
                        style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Planting Date
                      </div>
                      <input
                        type="date"
                        value={form.plantingDate}
                        onChange={(e) => updateForm(field.fieldSeasonId, 'plantingDate', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-secondary)', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {/* Save */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleSave(field)}
                      disabled={isSaving}
                      style={{ padding: '10px 32px', fontSize: '15px' }}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    {isSaved && (
                      <span style={{ color: 'var(--accent-green)', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Saved!
                      </span>
                    )}
                  </div>
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
