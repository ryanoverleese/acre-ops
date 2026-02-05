'use client';

import React, { useState } from 'react';
import type { BillingEntityOption } from '@/app/fields/page';

export interface CreateProbeModalProps {
  operationName: string;
  billingEntities: BillingEntityOption[];
  onClose: () => void;
  onCreated: (newProbeId: number, newProbeOption: {
    id: number;
    serialNumber: string;
    ownerBillingEntity: string;
    ownerOperationName: string;
    status: string;
  }) => void;
}

export default function CreateProbeModal({ operationName, billingEntities, onClose, onCreated }: CreateProbeModalProps) {
  const [form, setForm] = useState({
    brand: '',
    billing_entity: '',
    year_new: '',
  });
  const [saving, setSaving] = useState(false);

  const filteredBillingEntities = operationName
    ? billingEntities.filter((be) => be.operationName === operationName)
    : billingEntities;

  const handleCreate = async () => {
    if (!form.brand) {
      alert('Brand is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        brand: form.brand,
        status: 'On Order',
      };
      if (form.year_new) {
        payload.year_new = parseInt(form.year_new, 10);
      }
      if (form.billing_entity) {
        payload.billing_entity = parseInt(form.billing_entity, 10);
      }

      const response = await fetch('/api/probes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const newProbe = await response.json();
        const beId = form.billing_entity ? parseInt(form.billing_entity, 10) : null;
        const be = beId ? billingEntities.find(b => b.id === beId) : null;
        onCreated(newProbe.id, {
          id: newProbe.id,
          serialNumber: newProbe.serial_number || '',
          ownerBillingEntity: be?.name || 'On Order',
          ownerOperationName: be?.operationName || '',
          status: 'On Order',
        });
        onClose();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create probe');
      }
    } catch (error) {
      console.error('Create probe error:', error);
      alert('Failed to create probe');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()} style={{ width: '440px' }}>
        <div className="detail-panel-header">
          <h3>Create New Probe</h3>
          <button className="close-btn" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="detail-panel-content">
          <div className="edit-form">
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
              Create a probe on order. Serial number and rack location will be filled in when the probe arrives.
            </p>
            <div className="form-group">
              <label>Brand *</label>
              <select
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              >
                <option value="">Select brand...</option>
                <option value="CropX V4">CropX V4</option>
                <option value="Sentek 36&quot;/CropX Gateway">Sentek 36&quot;/CropX Gateway</option>
                <option value="Sentek 48&quot; Blue/Sentek Rocket">Sentek 48&quot; Blue/Sentek Rocket</option>
              </select>
            </div>
            <div className="form-group">
              <label>Billing Entity</label>
              <select
                value={form.billing_entity}
                onChange={(e) => setForm({ ...form, billing_entity: e.target.value })}
              >
                <option value="">Select billing entity...</option>
                {filteredBillingEntities.map((be) => (
                  <option key={be.id} value={be.id}>{be.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Year New *</label>
              <input
                type="number"
                value={form.year_new}
                onChange={(e) => setForm({ ...form, year_new: e.target.value })}
                placeholder="e.g., 2025"
              />
            </div>
          </div>
        </div>
        <div className="detail-panel-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating...' : 'Create Probe'}
          </button>
        </div>
      </div>
    </div>
  );
}
