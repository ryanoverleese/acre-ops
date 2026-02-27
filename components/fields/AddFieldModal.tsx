'use client';

import React, { useState, useEffect } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import type { BillingEntityOption } from '@/app/fields/page';

export interface AddFieldForm {
  billing_entity: string;
  name: string;
  acres: string;
  pivot_acres: string;
  irrigation_type: string;
  row_direction: string;
  lat: string;
  lng: string;
  water_source: string;
  fuel_source: string;
  notes: string;
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

export const createInitialAddFieldForm = (season: string): AddFieldForm => ({
  billing_entity: '',
  name: '',
  acres: '',
  pivot_acres: '',
  irrigation_type: '',
  row_direction: '',
  lat: '',
  lng: '',
  water_source: '',
  fuel_source: '',
  notes: '',
  season,
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

type OptionList = { value: string; label: string }[];

export interface DynamicFieldOptions {
  irrigation_type: OptionList;
  row_direction: OptionList;
  water_source: OptionList;
  fuel_source: OptionList;
}

export interface DynamicSeasonOptions {
  crop: OptionList;
  side_dress: OptionList;
  early_removal: OptionList;
  ready_to_remove: OptionList;
}

export interface AddFieldModalProps {
  currentSeason: string;
  billingEntities: BillingEntityOption[];
  productTypeOptions: { value: string; label: string }[];
  fieldOpts: DynamicFieldOptions;
  seasonOpts: DynamicSeasonOptions;
  getRateForServiceType: (serviceType: string) => string;
  onClose: () => void;
  onSaved: () => void;
  onOpenLocationPicker: () => void;
  latLng: { lat: string; lng: string } | null;
}

export default function AddFieldModal({
  currentSeason,
  billingEntities,
  productTypeOptions,
  fieldOpts,
  seasonOpts,
  getRateForServiceType,
  onClose,
  onSaved,
  onOpenLocationPicker,
  latLng,
}: AddFieldModalProps) {
  const [form, setForm] = useState<AddFieldForm>(() => createInitialAddFieldForm(currentSeason));
  const [saving, setSaving] = useState(false);

  // Sync lat/lng from location picker
  useEffect(() => {
    if (latLng) {
      setForm(prev => ({ ...prev, lat: latLng.lat, lng: latLng.lng }));
    }
  }, [latLng]);

  const handleSubmit = async () => {
    if (!form.billing_entity) {
      alert('Billing Entity is required');
      return;
    }
    if (!form.name.trim()) {
      alert('Field name is required');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_entity: parseInt(form.billing_entity, 10),
          name: form.name,
          acres: form.acres ? parseFloat(form.acres) : undefined,
          pivot_acres: form.pivot_acres ? parseFloat(form.pivot_acres) : undefined,
          irrigation_type: form.irrigation_type || undefined,
          row_direction: form.row_direction || undefined,
          lat: form.lat ? parseFloat(form.lat) : undefined,
          lng: form.lng ? parseFloat(form.lng) : undefined,
          water_source: form.water_source || undefined,
          fuel_source: form.fuel_source || undefined,
          notes: form.notes || undefined,
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
        if (form.billing_rate && result.fieldSeason?.id) {
          try {
            await fetch('/api/billing/enroll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                billing_entity_id: parseInt(form.billing_entity, 10),
                season: form.season,
                field_season_id: result.fieldSeason.id,
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
        alert(error.error || 'Failed to create field');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create field');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="detail-panel-header">
          <h3>Add New Field</h3>
          <button className="close-btn" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="detail-panel-content">
          <div className="edit-form">
            <div className="form-group">
              <label>Billing Entity *</label>
              <SearchableSelect
                value={form.billing_entity}
                onChange={(v) => setForm({ ...form, billing_entity: v })}
                options={[...billingEntities].sort((a, b) => a.name.localeCompare(b.name)).map((be) => ({
                  value: String(be.id),
                  label: `${be.name} (${be.operationName})`,
                }))}
                placeholder="Select billing entity..."
              />
            </div>
            <div className="form-group">
              <label>Field Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter field name" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Acres</label>
                <input type="number" value={form.acres} onChange={(e) => setForm({ ...form, acres: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Pivot Acres</label>
                <input type="number" value={form.pivot_acres} onChange={(e) => setForm({ ...form, pivot_acres: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Irrigation Type</label>
                <select value={form.irrigation_type} onChange={(e) => setForm({ ...form, irrigation_type: e.target.value })}>
                  <option value="">Select...</option>
                  {fieldOpts.irrigation_type.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Row Direction</label>
                <select value={form.row_direction} onChange={(e) => setForm({ ...form, row_direction: e.target.value })}>
                  <option value="">Select...</option>
                  {fieldOpts.row_direction.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Latitude</label>
                <input type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
              </div>
            </div>
            <button
              type="button"
              className="location-btn"
              onClick={onOpenLocationPicker}
              style={{ marginBottom: '16px' }}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Pick Location on Map
            </button>
            <div className="form-row">
              <div className="form-group">
                <label>Water Source</label>
                <select value={form.water_source} onChange={(e) => setForm({ ...form, water_source: e.target.value })}>
                  <option value="">Select...</option>
                  {fieldOpts.water_source.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Fuel Source</label>
                <select value={form.fuel_source} onChange={(e) => setForm({ ...form, fuel_source: e.target.value })}>
                  <option value="">Select...</option>
                  {fieldOpts.fuel_source.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
            <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Season Info ({form.season})</h4>

            <div className="form-row">
              <div className="form-group">
                <label>Season</label>
                <select value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })}>
                  <option value="2027">2027</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
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
            {saving ? 'Creating...' : 'Create Field'}
          </button>
        </div>
      </div>
    </div>
  );
}
