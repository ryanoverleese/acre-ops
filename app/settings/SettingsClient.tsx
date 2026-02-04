'use client';

import { useState } from 'react';

export interface ProcessedServiceRate {
  id: number;
  serviceType: string;
  rate: number;
  dealerFee: number;
  description: string;
  status: string;
}

interface SettingsClientProps {
  initialServiceRates: ProcessedServiceRate[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

const initialAddForm = {
  serviceType: '',
  rate: '',
  dealerFee: '',
  description: '',
};

export default function SettingsClient({ initialServiceRates }: SettingsClientProps) {
  const [serviceRates, setServiceRates] = useState(initialServiceRates);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(initialAddForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProcessedServiceRate>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const handleAddRate = async () => {
    if (!addForm.serviceType.trim()) {
      alert('Service type is required');
      return;
    }
    if (!addForm.rate) {
      alert('Rate is required');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/service-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_type: addForm.serviceType,
          rate: parseFloat(addForm.rate),
          dealer_fee: addForm.dealerFee ? parseFloat(addForm.dealerFee) : 0,
          description: addForm.description || '',
          status: 'Active',
        }),
      });

      if (response.ok) {
        const newRate = await response.json();
        setServiceRates([...serviceRates, {
          id: newRate.id,
          serviceType: newRate.service_type || '',
          rate: newRate.rate || 0,
          dealerFee: newRate.dealer_fee || 0,
          description: newRate.description || '',
          status: newRate.status?.value || 'Active',
        }]);
        setShowAddModal(false);
        setAddForm(initialAddForm);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create service rate');
      }
    } catch (error) {
      console.error('Error creating service rate:', error);
      alert('Failed to create service rate');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (rate: ProcessedServiceRate) => {
    setEditingId(rate.id);
    setEditForm({
      serviceType: rate.serviceType,
      rate: rate.rate,
      dealerFee: rate.dealerFee,
      description: rate.description,
      status: rate.status,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async (id: number) => {
    setSavingEdit(true);
    try {
      const response = await fetch(`/api/service-rates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_type: editForm.serviceType,
          rate: editForm.rate,
          dealer_fee: editForm.dealerFee,
          description: editForm.description,
          status: editForm.status,
        }),
      });

      if (response.ok) {
        setServiceRates(serviceRates.map((sr) =>
          sr.id === id ? { ...sr, ...editForm } as ProcessedServiceRate : sr
        ));
        setEditingId(null);
        setEditForm({});
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update service rate');
      }
    } catch (error) {
      console.error('Error updating service rate:', error);
      alert('Failed to update service rate');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (rate: ProcessedServiceRate) => {
    const newStatus = rate.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const response = await fetch(`/api/service-rates/${rate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setServiceRates(serviceRates.map((sr) =>
          sr.id === rate.id ? { ...sr, status: newStatus } : sr
        ));
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const activeRates = serviceRates.filter((sr) => sr.status === 'Active');
  const inactiveRates = serviceRates.filter((sr) => sr.status !== 'Active');

  return (
    <>
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <div className="content-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>Service Rates</h3>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Rate
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Define billing rates for each service type. These rates auto-fill when enrolling fields.
        </p>

        <table>
          <thead>
            <tr>
              <th>Service Type</th>
              <th style={{ textAlign: 'right' }}>Customer Rate</th>
              <th style={{ textAlign: 'right' }}>Dealer Fee</th>
              <th style={{ textAlign: 'right' }}>Margin</th>
              <th>Description</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {activeRates.length === 0 && inactiveRates.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No service rates defined. Click &quot;Add Rate&quot; to create your first one.
                </td>
              </tr>
            )}
            {activeRates.map((rate) => (
              <tr key={rate.id}>
                {editingId === rate.id ? (
                  <>
                    <td>
                      <input
                        type="text"
                        value={editForm.serviceType || ''}
                        onChange={(e) => setEditForm({ ...editForm, serviceType: e.target.value })}
                        style={{ width: '100%', padding: '4px 8px' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={editForm.rate || ''}
                        onChange={(e) => setEditForm({ ...editForm, rate: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100px', padding: '4px 8px', textAlign: 'right' }}
                        step="0.01"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={editForm.dealerFee || ''}
                        onChange={(e) => setEditForm({ ...editForm, dealerFee: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100px', padding: '4px 8px', textAlign: 'right' }}
                        step="0.01"
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-green)' }}>
                      {formatCurrency((editForm.rate || 0) - (editForm.dealerFee || 0))}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={editForm.description || ''}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        style={{ width: '100%', padding: '4px 8px' }}
                        placeholder="Optional notes"
                      />
                    </td>
                    <td>
                      <span className="status-badge installed">
                        <span className="status-dot"></span>
                        Active
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => handleSaveEdit(rate.id)} disabled={savingEdit}>
                          {savingEdit ? '...' : 'Save'}
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ fontWeight: 500 }}>{rate.serviceType}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(rate.rate)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>{formatCurrency(rate.dealerFee)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-green)' }}>{formatCurrency(rate.rate - rate.dealerFee)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{rate.description || '—'}</td>
                    <td>
                      <span className="status-badge installed">
                        <span className="status-dot"></span>
                        Active
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="action-btn" title="Edit" onClick={() => handleStartEdit(rate)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button className="action-btn" title="Deactivate" onClick={() => handleToggleStatus(rate)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {inactiveRates.length > 0 && (
          <>
            <h4 style={{ marginTop: '24px', marginBottom: '12px', color: 'var(--text-muted)' }}>Inactive Rates</h4>
            <table>
              <tbody>
                {inactiveRates.map((rate) => (
                  <tr key={rate.id} style={{ opacity: 0.6 }}>
                    <td style={{ fontWeight: 500 }}>{rate.serviceType}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(rate.rate)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>{formatCurrency(rate.dealerFee)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(rate.rate - rate.dealerFee)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{rate.description || '—'}</td>
                    <td>
                      <span className="status-badge pending">
                        <span className="status-dot"></span>
                        Inactive
                      </span>
                    </td>
                    <td>
                      <button className="action-btn" title="Reactivate" onClick={() => handleToggleStatus(rate)}>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Add Rate Modal */}
      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" style={{ width: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add Service Rate</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Service Type *</label>
                  <input
                    type="text"
                    value={addForm.serviceType}
                    onChange={(e) => setAddForm({ ...addForm, serviceType: e.target.value })}
                    placeholder="e.g., CropX DIY - Fishell Rate"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Customer Rate ($) *</label>
                    <input
                      type="number"
                      value={addForm.rate}
                      onChange={(e) => setAddForm({ ...addForm, rate: e.target.value })}
                      placeholder="e.g., 650"
                      step="0.01"
                    />
                  </div>
                  <div className="form-group">
                    <label>Dealer Fee ($)</label>
                    <input
                      type="number"
                      value={addForm.dealerFee}
                      onChange={(e) => setAddForm({ ...addForm, dealerFee: e.target.value })}
                      placeholder="e.g., 350"
                      step="0.01"
                    />
                  </div>
                </div>
                {addForm.rate && (
                  <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', marginBottom: '12px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Margin: </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-green)' }}>
                      {formatCurrency(parseFloat(addForm.rate || '0') - parseFloat(addForm.dealerFee || '0'))}
                    </span>
                  </div>
                )}
                <div className="form-group">
                  <label>Description (optional)</label>
                  <input
                    type="text"
                    value={addForm.description}
                    onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                    placeholder="Notes about this rate"
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddRate} disabled={saving}>
                {saving ? 'Saving...' : 'Add Rate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
