'use client';

import React, { useState } from 'react';
import type { ProcessedField, ProbeOption } from '@/app/fields/page';

interface ProbeWithStatus extends ProbeOption {
  isAssigned: boolean;
}

type OptionList = { value: string; label: string }[];

export interface DynamicSeasonOptions {
  crop: OptionList;
  side_dress: OptionList;
  early_removal: OptionList;
  ready_to_remove: OptionList;
  planned_installer: OptionList;
  antenna_type: OptionList;
  battery_type: OptionList;
}

export interface EditSeasonModalProps {
  field: ProcessedField;
  initialForm: EditSeasonForm;
  selectedProbeId: string;
  selectedProbe2Id: string;
  onProbeIdChange: (id: string) => void;
  onProbe2IdChange: (id: string) => void;
  productTypeOptions: { value: string; label: string }[];
  seasonOpts: DynamicSeasonOptions;
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
  probe2_antenna_type: string;
  probe2_battery_type: string;
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
  service_type: field.serviceTypeId ? String(field.serviceTypeId) : '',
  antenna_type: field.antennaType || '',
  battery_type: field.batteryType || '',
  probe2_antenna_type: field.probe2AntennaType || '',
  probe2_battery_type: field.probe2BatteryType || '',
  side_dress: field.sideDress || '',
  logger_id: field.loggerId || '',
  early_removal: field.earlyRemoval || '',
  hybrid_variety: field.hybridVariety || '',
  ready_to_remove: field.readyToRemove || '',
  planting_date: field.plantingDate || '',
  route_order: field.routeOrder?.toString() || '',
  planned_installer: field.plannedInstaller || '',
  ready_to_install: field.readyToInstall || false,
  billing_rate: getRateForServiceType(field.serviceTypeId ? String(field.serviceTypeId) : ''),
});

export default function EditSeasonModal({
  field,
  initialForm,
  selectedProbeId,
  selectedProbe2Id,
  onProbeIdChange,
  onProbe2IdChange,
  productTypeOptions,
  seasonOpts,
  getRateForServiceType,
  getProbesForField,
  onClose,
  onSaved,
  onFieldsUpdate,
  onOpenCreateProbe,
}: EditSeasonModalProps) {
  const [form, setForm] = useState<EditSeasonForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!field.fieldSeasonId) return;
    setSaving(true);
    try {
      // Helper: treat 'Unknown' the same as empty (it's a display-only default, not a real Baserow value)
      const clean = (val: string | undefined) => (val && val !== 'Unknown') ? val : null;

      // Season-level data goes to field_seasons (no probe data here)
      const patchBody: Record<string, unknown> = {
        crop: clean(form.crop),
        service_type: clean(form.service_type),
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

      const response = await fetch(`/api/field-seasons/${field.fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });

      // Helper to save a probe via probe_assignments
      const saveProbeAssignment = async (
        assignmentId: number | null,
        probeNumber: number,
        selectedId: string,
        antennaType: string | undefined,
        batteryType: string | undefined,
      ) => {
        const probeId = selectedId ? parseInt(selectedId, 10) : 0;
        if (assignmentId) {
          // Update existing probe_assignment
          await fetch(`/api/probe-assignments/${assignmentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              probe: probeId,
              probe_status: probeId ? 'Assigned' : 'Unassigned',
              antenna_type: clean(antennaType),
              battery_type: clean(batteryType),
            }),
          });
        } else if (probeId) {
          // Create new probe_assignment
          await fetch('/api/probe-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              field_season: field.fieldSeasonId,
              probe_number: probeNumber,
              probe: probeId,
              antenna_type: clean(antennaType),
              battery_type: clean(batteryType),
            }),
          });
        }
      };

      // Save probe 1 and probe 2 via probe_assignments (both use same pattern)
      await Promise.all([
        saveProbeAssignment(field.probeAssignmentId, 1, selectedProbeId, form.antenna_type, form.battery_type),
        saveProbeAssignment(field.probe2AssignmentId, 2, selectedProbe2Id, form.probe2_antenna_type, form.probe2_battery_type),
      ]);
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
                service_type: productTypeOptions.find(o => o.value === form.service_type)?.label || '',
                rate: form.billing_rate,
              }),
            });
          } catch (billingError) {
            console.error('Failed to update billing entry:', billingError);
          }
        }

        // Show "Saved!" confirmation briefly before reloading
        setSaved(true);
        setTimeout(() => {
          onSaved();
        }, 800);
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
                  {seasonOpts.crop.slice().sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
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
                  {productTypeOptions.slice().sort((a, b) => a.label.localeCompare(b.label)).map((opt) => (
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
                  {seasonOpts.antenna_type.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Battery Type</label>
                <select value={form.battery_type} onChange={(e) => setForm({ ...form, battery_type: e.target.value })}>
                  <option value="">Select...</option>
                  {seasonOpts.battery_type.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
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
                      {p.serialNumber ? `#${p.serialNumber}` : `(On Order #${p.id})`} - {p.isAssigned && p.id.toString() !== selectedProbeId ? 'Assigned' : p.ownerBillingEntity}
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
                      {p.serialNumber ? `#${p.serialNumber}` : `(On Order #${p.id})`} - {p.isAssigned && p.id.toString() !== selectedProbe2Id ? 'Assigned' : p.ownerBillingEntity}
                    </option>
                  ))}
                  <option value="__create_new__">+ Add New Probe</option>
                </select>
              </div>
            </div>
            {/* Probe 2 Equipment - only shown when probe 2 is assigned */}
            {selectedProbe2Id && (
              <div className="form-row">
                <div className="form-group">
                  <label>Probe 2 Antenna Type</label>
                  <select value={form.probe2_antenna_type} onChange={(e) => setForm({ ...form, probe2_antenna_type: e.target.value })}>
                    <option value="">Select...</option>
                    {seasonOpts.antenna_type.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Probe 2 Battery Type</label>
                  <select value={form.probe2_battery_type} onChange={(e) => setForm({ ...form, probe2_battery_type: e.target.value })}>
                    <option value="">Select...</option>
                    {seasonOpts.battery_type.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

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
                    {seasonOpts.planned_installer.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
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
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || saved}
            style={saved ? { backgroundColor: 'var(--accent-primary, #4a7a5b)' } : undefined}
          >
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
