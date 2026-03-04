'use client';

import React, { useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
export interface CreateProbeModalBillingEntity {
  id: number;
  name: string;
  operationName?: string;
}

export interface CreateProbeModalProps {
  operationName: string;
  billingEntities: CreateProbeModalBillingEntity[];
  onClose: () => void;
  onCreated: (newProbeId: number, newProbeOption: {
    id: number;
    serialNumber: string;
    brand: string;
    ownerBillingEntity: string;
    ownerOperationName: string;
    status: string;
  }) => void;
  /** When set, this is a trade-in flow — shows trade year picker and calls onTradeComplete after creation */
  tradingProbe?: { id: number; serialNumber: string; brand: string; billingEntityId?: number };
  onTradeComplete?: (oldProbeId: number, tradeYear: string) => void;
}

export default function CreateProbeModal({ operationName, billingEntities, onClose, onCreated, tradingProbe, onTradeComplete }: CreateProbeModalProps) {
  const [form, setForm] = useState({
    brand: '',
    billing_entity: tradingProbe?.billingEntityId ? String(tradingProbe.billingEntityId) : '',
    year_new: '',
    trade_year: '',
  });
  const [saving, setSaving] = useState(false);

  const isTradeIn = !!tradingProbe;

  const filteredBillingEntities = operationName
    ? billingEntities.filter((be) => be.operationName === operationName)
    : billingEntities;

  const handleCreate = async () => {
    if (!form.brand) {
      alert('Brand is required');
      return;
    }
    if (isTradeIn && !form.trade_year) {
      alert('Trade year is required');
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
          brand: form.brand || '',
          ownerBillingEntity: be?.name || 'On Order',
          ownerOperationName: be?.operationName || '',
          status: 'On Order',
        });

        // Set trade_year on old probe
        if (isTradeIn && onTradeComplete) {
          onTradeComplete(tradingProbe.id, form.trade_year);
        }

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

  const currentYear = new Date().getFullYear();
  const tradeYearOptions = Array.from({ length: 5 }, (_, i) => currentYear + i);

  return (
    <div className="detail-panel-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()} style={{ width: '440px' }}>
        <div className="detail-panel-header">
          <h3>{isTradeIn ? 'Trade-In Replacement' : 'Create New Probe'}</h3>
          <button className="close-btn" onClick={onClose}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="detail-panel-content">
          <div className="edit-form">
            {isTradeIn ? (
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Replacing {tradingProbe.serialNumber ? `#${tradingProbe.serialNumber}` : `probe #${tradingProbe.id}`} ({tradingProbe.brand}). Create the replacement probe and select the trade year.
              </p>
            ) : (
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Create a probe on order. Serial number and rack location will be filled in when the probe arrives.
              </p>
            )}
            {isTradeIn && (
              <div className="form-group">
                <label>Trade Year *</label>
                <select
                  value={form.trade_year}
                  onChange={(e) => setForm({ ...form, trade_year: e.target.value })}
                >
                  <option value="">Select trade year...</option>
                  {tradeYearOptions.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </div>
            )}
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
              <SearchableSelect
                value={form.billing_entity}
                onChange={(v) => setForm({ ...form, billing_entity: v })}
                options={filteredBillingEntities.map((be) => ({
                  value: String(be.id),
                  label: be.name,
                }))}
                placeholder="Select billing entity..."
              />
            </div>
            <div className="form-group">
              <label>Year New</label>
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
            {saving ? 'Creating...' : isTradeIn ? 'Create Replacement' : 'Create Probe'}
          </button>
        </div>
      </div>
    </div>
  );
}
