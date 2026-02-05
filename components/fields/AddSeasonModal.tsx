'use client';

import React, { useState } from 'react';

interface AddSeasonForm {
  season: string;
  crop: string;
  service_type: string;
  antenna_type: string;
  battery_type: string;
  side_dress: string;
  logger_id: string;
  early_removal: string;
  hybrid_variety: string;
  ready_to_remove: string;
  planting_date: string;
  billing_rate: string;
}

export interface AddSeasonModalProps {
  fieldId: number;
  fieldName: string;
  billingEntityId: number | null;
  missingSeasons: string[];
  serviceTypeOptions: { value: string; label: string }[];
  getRateForServiceType: (serviceType: string) => string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddSeasonModal({
  fieldId,
  fieldName,
  billingEntityId,
  missingSeasons,
  serviceTypeOptions,
  getRateForServiceType,
  onClose,
  onSaved,
}: AddSeasonModalProps) {
  const [form, setForm] = useState<AddSeasonForm>({
    season: missingSeasons[0] || '2026',
    crop: '',
    service_type: '',
    antenna_type: '',
    battery_type: '',
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
          antenna_type: form.antenna_type || undefined,
          battery_type: form.battery_type || undefined,
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
                <label>Antenna Type</label>
                <select value={form.antenna_type} onChange={(e) => setForm({ ...form, antenna_type: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="10' CropX Antenna">10&apos; CropX Antenna</option>
                  <option value="10' Sentek Antenna">10&apos; Sentek Antenna</option>
                  <option value="6' CropX Antenna">6&apos; CropX Antenna</option>
                  <option value="ASK">ASK</option>
                  <option value="CropX Stub - White Flag">CropX Stub - White Flag</option>
                  <option value="Stub CropX Antenna">Stub CropX Antenna</option>
                  <option value="Stub Sentek Antenna">Stub Sentek Antenna</option>
                </select>
              </div>
              <div className="form-group">
                <label>Battery Type</label>
                <select value={form.battery_type} onChange={(e) => setForm({ ...form, battery_type: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="CropX">CropX</option>
                  <option value="Sentek New">Sentek New</option>
                  <option value="Sentek Used">Sentek Used</option>
                </select>
              </div>
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
            {saving ? 'Creating...' : 'Create Season'}
          </button>
        </div>
      </div>
    </div>
  );
}
