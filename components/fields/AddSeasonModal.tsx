'use client';

import React, { useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';

interface AddSeasonForm {
  season: string;
  crop: string;
  service_type: string;
  side_dress: string;
  logger_id: string;
  early_removal: string;
  hybrid_variety: string;
  ready_to_remove: string;
  planting_date: string;
  billing_rate: string;
}

type OptionList = { value: string; label: string }[];

export interface DynamicSeasonOptions {
  crop: OptionList;
  side_dress: OptionList;
  early_removal: OptionList;
  ready_to_remove: OptionList;
}

export interface AddSeasonModalProps {
  fieldId: number;
  fieldName: string;
  billingEntityId: number | null;
  missingSeasons: string[];
  productTypeOptions: { value: string; label: string }[];
  seasonOpts: DynamicSeasonOptions;
  getRateForServiceType: (serviceType: string) => string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddSeasonModal({
  fieldId,
  fieldName,
  billingEntityId,
  missingSeasons,
  productTypeOptions,
  seasonOpts,
  getRateForServiceType,
  onClose,
  onSaved,
}: AddSeasonModalProps) {
  const [form, setForm] = useState<AddSeasonForm>({
    season: missingSeasons[0] || '2026',
    crop: '',
    service_type: '',
    side_dress: '',
    logger_id: '',
    early_removal: '',
    hybrid_variety: '',
    ready_to_remove: '',
    planting_date: '',
    billing_rate: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.season) {
      alert('Season is required');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/field-seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: fieldId,
          season: form.season,
          crop: form.crop || undefined,
          service_type: form.service_type || undefined,
          side_dress: form.side_dress || undefined,
          logger_id: form.logger_id || undefined,
          early_removal: form.early_removal || undefined,
          hybrid_variety: form.hybrid_variety || undefined,
          ready_to_remove: form.ready_to_remove || undefined,
          planting_date: form.planting_date || undefined,
        }),
      });
      if (response.ok) {
        const result = await response.json();

        // Create invoice line if billing_rate is provided
        if (form.billing_rate && result.id && billingEntityId) {
          try {
            await fetch('/api/billing/enroll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                billing_entity_id: billingEntityId,
                season: form.season,
                field_season_id: result.id,
                service_type: productTypeOptions.find(o => o.value === form.service_type)?.label || '',
                rate: form.billing_rate,
              }),
            });
          } catch (billingError) {
            console.error('Failed to create billing entry:', billingError);
          }
        }

        onSaved();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create season');
      }
    } catch (error) {
      console.error('Add season error:', error);
      alert('Failed to create season');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="detail-panel-header">
          <h3>Add Season for {fieldName}</h3>
          <button className="close-btn" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="detail-panel-content">
          <div className="edit-form">
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Create a new season entry for this field. This will allow you to assign a probe and track service for the new season.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>Season *</label>
                <select value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })}>
                  {missingSeasons.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Crop</label>
                <SearchableSelect
                  value={form.crop}
                  onChange={(v) => setForm({ ...form, crop: v })}
                  options={seasonOpts.crop.slice().sort((a, b) => a.label.localeCompare(b.label))}
                  placeholder="Select crop..."
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Service Type</label>
                <SearchableSelect
                  value={form.service_type}
                  onChange={(v) => {
                    const rate = getRateForServiceType(v);
                    setForm({ ...form, service_type: v, billing_rate: rate });
                  }}
                  options={productTypeOptions.slice().sort((a, b) => a.label.localeCompare(b.label))}
                  placeholder="Select..."
                />
              </div>
              <div className="form-group">
                <label>Billing Rate ($)</label>
                <input
                  type="number"
                  value={form.billing_rate}
                  onChange={(e) => setForm({ ...form, billing_rate: e.target.value })}
                  placeholder="Auto-filled from service type"
                  step="0.01"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Side Dress</label>
                <select value={form.side_dress} onChange={(e) => setForm({ ...form, side_dress: e.target.value })}>
                  <option value="">Select...</option>
                  {seasonOpts.side_dress.slice().sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Logger ID</label>
                <input
                  type="text"
                  value={form.logger_id}
                  onChange={(e) => setForm({ ...form, logger_id: e.target.value })}
                  placeholder="e.g., 7080859"
                />
              </div>
              <div className="form-group">
                <label>Early Removal</label>
                <select value={form.early_removal} onChange={(e) => setForm({ ...form, early_removal: e.target.value })}>
                  <option value="">Select...</option>
                  {seasonOpts.early_removal.slice().sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Hybrid/Variety</label>
                <input
                  type="text"
                  value={form.hybrid_variety}
                  onChange={(e) => setForm({ ...form, hybrid_variety: e.target.value })}
                  placeholder="e.g., P1185AM"
                />
              </div>
              <div className="form-group">
                <label>Ready to Remove</label>
                <select value={form.ready_to_remove} onChange={(e) => setForm({ ...form, ready_to_remove: e.target.value })}>
                  <option value="">Select...</option>
                  {seasonOpts.ready_to_remove.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Planting Date</label>
                <input
                  type="date"
                  value={form.planting_date}
                  onChange={(e) => setForm({ ...form, planting_date: e.target.value })}
                />
              </div>
              <div className="form-group"></div>
            </div>
          </div>
        </div>
        <div className="detail-panel-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating...' : 'Create Season'}
          </button>
        </div>
      </div>
    </div>
  );
}
