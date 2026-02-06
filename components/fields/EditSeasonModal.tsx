'use client';

import React, { useState } from 'react';
import type { ProcessedField, ProbeOption } from '@/app/fields/page';

interface ProbeWithStatus extends ProbeOption {
  isAssigned: boolean;
}

export interface EditSeasonModalProps {
  field: ProcessedField;
  initialForm: EditSeasonForm;
  selectedProbeId: string;
  selectedProbe2Id: string;
  onProbeIdChange: (id: string) => void;
  onProbe2IdChange: (id: string) => void;
  serviceTypeOptions: { value: string; label: string }[];
  getRateForServiceType: (serviceType: string) => string;
  getProbesForField: (fieldOperation: string, currentProbeId?: number | null) => ProbeWithStatus[];
  onClose: () => void;
  onSaved: () => void;
  onFieldsUpdate: (updater: (prev: ProcessedField[]) => ProcessedField[]) => void;
  onOpenCreateProbe: (target: 'probe1' | 'probe2', operationName: string) => void;
}

export interface EditSeasonForm {
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
  route_order: string;
  planned_installer: string;
  ready_to_install: boolean;
  billing_rate: string;
}

export const createEditSeasonForm = (field: ProcessedField, getRateForServiceType: (st: string) => string): EditSeasonForm => ({
  crop: field.crop || '',
  service_type: field.serviceType || '',
  antenna_type: field.antennaType || '',
  battery_type: field.batteryType || '',
  side_dress: field.sideDress || '',
  logger_id: field.loggerId || '',
  early_removal: field.earlyRemoval || '',
  hybrid_variety: field.hybridVariety || '',
  ready_to_remove: field.readyToRemove || '',
  planting_date: field.plantingDate || '',
  route_order: field.routeOrder?.toString() || '',
  planned_installer: field.plannedInstaller || '',
  ready_to_install: field.readyToInstall || false,
  billing_rate: getRateForServiceType(field.serviceType || ''),
});

export default function EditSeasonModal({
  field,
  initialForm,
  selectedProbeId,
  selectedProbe2Id,
  onProbeIdChange,
  onProbe2IdChange,
  serviceTypeOptions,
  getRateForServiceType,
  getProbesForField,
  onClose,
  onSaved,
  onFieldsUpdate,
  onOpenCreateProbe,
}: EditSeasonModalProps) {
  const [form, setForm] = useState<EditSeasonForm>(initialForm);
  const [saving, setSaving] = useState(false);

  // Track original probe IDs so we only send them when changed
  const [initialProbeId] = useState(selectedProbeId);
  const [initialProbe2Id] = useState(selectedProbe2Id);

  const handleSave = async () => {
    if (!field.fieldSeasonId) return;
    setSaving(true);
    try {
      // Helper: treat 'Unknown' the same as empty (it's a display-only default, not a real Baserow value)
      const clean = (val: string | undefined) => (val && val !== 'Unknown') ? val : null;

      const patchBody: Record<string, unknown> = {
        crop: clean(form.crop),
        service_type: clean(form.service_type),
        antenna_type: clean(form.antenna_type),
        battery_type: clean(form.battery_type),
        side_dress: clean(form.side_dress),
        logger_id: form.logger_id || null,
        early_removal: clean(form.early_removal),
        hybrid_variety: form.hybrid_variety || null,
        ready_to_remove: clean(form.ready_to_remove),
        planting_date: form.planting_date || null,
        route_order: form.route_order ? parseInt(form.route_order, 10) : null,
        planned_installer: form.planned_installer || null,
        ready_to_install: form.ready_to_install,
      };

      // Only send probe fields if they actually changed - use 0 to explicitly clear
      if (selectedProbeId !== initialProbeId) {
        const probeId = selectedProbeId ? parseInt(selectedProbeId, 10) : 0;
        patchBody.probe = probeId;
        patchBody.probe_status = probeId ? 'Assigned' : 'Unassigned';
      }
      if (selectedProbe2Id !== initialProbe2Id) {
        const probe2Id = selectedProbe2Id ? parseInt(selectedProbe2Id, 10) : 0;
        patchBody.probe_2 = probe2Id;
        patchBody.probe_2_status = probe2Id ? 'Assigned' : 'Unassigned';
      }

      const response = await fetch(`/api/field-seasons/${field.fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      if (response.ok) {
        // Create/update invoice line if billing_rate is provided
        if (form.billing_rate && field.billingEntityId) {
          try {
            await fetch('/api/billing/enroll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                billing_entity_id: field.billingEntityId,
                season: field.season,
                field_season_id: field.fieldSeasonId,
                service_type: form.service_type || '',
                rate: form.billing_rate,
              }),
            });
          } catch (billingError) {
            console.error('Failed to update billing entry:', billingError);
          }
        }

        onSaved();
      } else {
        const error = await response.json();
        console.error('Field season update failed:', error);
        alert(`Failed to update season: ${error.details || error.error || response.status}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to update season');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(initialForm);
    onClose();
  };

  return (
    <div className="detail-panel-overlay" onClick={handleCancel}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="detail-panel-header">
          <h3>Edit {field.season} Season</h3>
          <button className="close-btn" onClick={handleCancel}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="detail-panel-content">
          <div className="edit-form">
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
              Edit seasonal data for <strong>{field.name}</strong> in the {field.season} season.
            </p>
            <div className="form-row">
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
            <div className="form-row">
              <div className="form-group">
                <label>Probe 1</label>
                <select value={selectedProbeId} onChange={(e) => {
                  if (e.target.value === '__create_new__') {
                    onOpenCreateProbe('probe1', field.operation);
                  } else {
                    onProbeIdChange(e.target.value);
                  }
                }}>
                  <option value="">— No Probe —</option>
                  {getProbesForField(field.operation, field.probeId).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.serialNumber ? `#${p.serialNumber}` : `(On Order #${p.id})`} ({p.isAssigned && p.id.toString() !== selectedProbeId ? 'Assigned' : p.ownerBillingEntity})
                    </option>
                  ))}
                  <option value="__create_new__">+ Add New Probe</option>
                </select>
              </div>
              <div className="form-group">
                <label>Probe 2 (Optional)</label>
                <select value={selectedProbe2Id} onChange={(e) => {
                  if (e.target.value === '__create_new__') {
                    onOpenCreateProbe('probe2', field.operation);
                  } else {
                    onProbe2IdChange(e.target.value);
                  }
                }}>
                  <option value="">— No Probe —</option>
                  {getProbesForField(field.operation, field.probe2Id).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.serialNumber ? `#${p.serialNumber}` : `(On Order #${p.id})`} ({p.isAssigned && p.id.toString() !== selectedProbe2Id ? 'Assigned' : p.ownerBillingEntity})
                    </option>
                  ))}
                  <option value="__create_new__">+ Add New Probe</option>
                </select>
              </div>
            </div>

            {/* Install Planning Section */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: '16px', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>Install Planning</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Route Order</label>
                  <input
                    type="number"
                    value={form.route_order}
                    onChange={(e) => setForm({ ...form, route_order: e.target.value })}
                    placeholder="e.g., 1, 2, 3..."
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Planned Installer</label>
                  <select value={form.planned_installer} onChange={(e) => setForm({ ...form, planned_installer: e.target.value })}>
                    <option value="">Select...</option>
                    <option value="Brian">Brian</option>
                    <option value="Daine">Daine</option>
                    <option value="Ryan">Ryan</option>
                    <option value="Ryan and Kasen">Ryan and Kasen</option>

                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.ready_to_install}
                      onChange={(e) => setForm({ ...form, ready_to_install: e.target.checked })}
                      style={{ width: '18px', height: '18px' }}
                    />
                    Ready to Install
                  </label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Check this when the field is confirmed and ready for the installer to visit.
                  </p>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={field.nrcsField || false}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        try {
                          const response = await fetch(`/api/fields/${field.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nrcs_field: checked }),
                          });
                          if (response.ok) {
                            onFieldsUpdate(prev => prev.map(f =>
                              f.id === field.id ? { ...f, nrcsField: checked } : f
                            ));
                          }
                        } catch (error) {
                          console.error('Failed to update NRCS field:', error);
                        }
                      }}
                      style={{ width: '18px', height: '18px' }}
                    />
                    NRCS Field
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="detail-panel-footer">
          <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
