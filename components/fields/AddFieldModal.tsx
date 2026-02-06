'use client';

import React, { useState, useEffect } from 'react';
import type { BillingEntityOption } from '@/app/fields/page';

export interface AddFieldForm {
  billing_entity: string;
  name: string;
  acres: string;
  pivot_acres: string;
  irrigation_type: string;
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

export interface AddFieldModalProps {
  currentSeason: string;
  billingEntities: BillingEntityOption[];
  serviceTypeOptions: { value: string; label: string }[];
  getRateForServiceType: (serviceType: string) => string;
  onClose: () => void;
  onSaved: () => void;
  onOpenLocationPicker: () => void;
  latLng: { lat: string; lng: string } | null;
}

export default function AddFieldModal({
  currentSeason,
  billingEntities,
  serviceTypeOptions,
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
                service_type: form.service_type || '',
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
              <select value={form.billing_entity} onChange={(e) => setForm({ ...form, billing_entity: e.target.value })}>
                <option value="">Select billing entity...</option>
                {[...billingEntities].sort((a, b) => a.name.localeCompare(b.name)).map((be) => (
                  <option key={be.id} value={be.id}>{be.name} ({be.operationName})</option>
                ))}
              </select>
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
            <div className="form-group">
              <label>Irrigation Type</label>
              <select value={form.irrigation_type} onChange={(e) => setForm({ ...form, irrigation_type: e.target.value })}>
                <option value="">Select...</option>
                <option value="Drip">Drip</option>
                <option value="Dryland">Dryland</option>
                <option value="Gravity">Gravity</option>
                <option value="Pivot">Pivot</option>
                <option value="Pivot - Corner System">Pivot - Corner System</option>
                <option value="Pivot - Wiper">Pivot - Wiper</option>
              </select>
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
                  <option value="Well">Well</option>
                  <option value="Canal">Canal</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Fuel Source</label>
                <select value={form.fuel_source} onChange={(e) => setForm({ ...form, fuel_source: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="Electric">Electric</option>
                  <option value="Natural Gas">Natural Gas</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Other">Other</option>
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
                <select value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })}>
                  <option value="">Select crop...</option>
                  <option value="Corn">Corn</option>
                  <option value="Other">Other</option>
                  <option value="Seed Corn">Seed Corn</option>
                  <option value="Soybeans">Soybeans</option>
                  <option value="Wheat">Wheat</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Service Type</label>
                <select value={form.service_type} onChange={(e) => {
                  const serviceType = e.target.value;
                  const rate = getRateForServiceType(serviceType);
                  setForm({ ...form, service_type: serviceType, billing_rate: rate });
                }}>
                  <option value="">Select...</option>
                  {serviceTypeOptions.slice().sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
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
                  <option value="Coulter">Coulter</option>
                  <option value="Coulter 7&quot; off Row">Coulter 7&quot; off Row</option>
                  <option value="Cultivate">Cultivate</option>
                  <option value="Cultivation Likely">Cultivation Likely</option>
                  <option value="High Y-Drop">High Y-Drop</option>
                  <option value="Low Y-Drop">Low Y-Drop</option>
                  <option value="None">None</option>
                  <option value="Pivot">Pivot</option>
                  <option value="Sprayer Drops">Sprayer Drops</option>
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
                  <option value="Dummy Probe – Drip">Dummy Probe – Drip</option>
                  <option value="Early Incentive Corn">Early Incentive Corn</option>
                  <option value="HMC">HMC</option>
                  <option value="HMC Maybe">HMC Maybe</option>
                  <option value="HMC – Oct 1">HMC – Oct 1</option>
                  <option value="Popcorn">Popcorn</option>
                  <option value="Regular">Regular</option>
                  <option value="Seed Corn">Seed Corn</option>
                  <option value="Silage">Silage</option>
                  <option value="Sorghum">Sorghum</option>
                  <option value="Soybeans">Soybeans</option>
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
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
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
