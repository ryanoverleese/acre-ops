'use client';

import { useState, useEffect } from 'react';
import {
  PageHeader,
  ContentCard,
  SectionHeader,
  SavedIndicator,
  ColumnTag,
  ColumnTagsContainer,
  FormFieldRow,
} from '@/components/ui';

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
  availableSeasons: string[];
}

const GLOBAL_SEASON_KEY = 'acre-ops-global-season';
const FIELD_COLUMNS_STORAGE_KEY = 'fields-tab-columns';

// Column definitions matching Fields page
type FieldColumnKey =
  | 'field' | 'operation' | 'billingEntity' | 'crop' | 'service' | 'cropConfirmed'
  | 'hybrid' | 'antenna' | 'battery' | 'sideDress' | 'loggerId' | 'probes'
  | 'routeOrder' | 'plannedInstaller' | 'readyToInstall'
  | 'probeStatus' | 'installDate' | 'installer' | 'approvalStatus'
  | 'removalDate' | 'removalNotes' | 'readyToRemove' | 'earlyRemoval';

type TabView = 'signup' | 'seasonSetup' | 'installPlanning' | 'activeSeason' | 'removal';

interface FieldColumnDefinition {
  key: FieldColumnKey;
  label: string;
  alwaysVisible?: boolean;
}

const ALL_COLUMN_DEFINITIONS: FieldColumnDefinition[] = [
  { key: 'field', label: 'Field', alwaysVisible: true },
  { key: 'operation', label: 'Operation' },
  { key: 'billingEntity', label: 'Billing Entity' },
  { key: 'crop', label: 'Crop' },
  { key: 'cropConfirmed', label: 'Crop Confirmed' },
  { key: 'service', label: 'Service Type' },
  { key: 'hybrid', label: 'Hybrid/Variety' },
  { key: 'antenna', label: 'Antenna' },
  { key: 'battery', label: 'Battery' },
  { key: 'sideDress', label: 'Side-dress' },
  { key: 'loggerId', label: 'Logger ID' },
  { key: 'probes', label: 'Probes' },
  { key: 'routeOrder', label: 'Route #' },
  { key: 'plannedInstaller', label: 'Planned Installer' },
  { key: 'readyToInstall', label: 'Ready to Install' },
  { key: 'probeStatus', label: 'Probe Status' },
  { key: 'installDate', label: 'Install Date' },
  { key: 'installer', label: 'Installer' },
  { key: 'approvalStatus', label: 'Approval Status' },
  { key: 'removalDate', label: 'Removal Date' },
  { key: 'removalNotes', label: 'Removal Notes' },
  { key: 'readyToRemove', label: 'Ready to Remove' },
  { key: 'earlyRemoval', label: 'Early Removal' },
];

const TAB_INFO: { key: TabView; label: string }[] = [
  { key: 'signup', label: 'Signup' },
  { key: 'seasonSetup', label: 'Season Setup' },
  { key: 'installPlanning', label: 'Install Planning' },
  { key: 'activeSeason', label: 'Active Season' },
  { key: 'removal', label: 'Removal' },
];

const TAB_DEFAULT_COLUMNS: Record<TabView, FieldColumnKey[]> = {
  signup: ['field', 'operation', 'billingEntity', 'crop', 'service'],
  seasonSetup: ['field', 'crop', 'hybrid', 'antenna', 'battery', 'sideDress', 'loggerId', 'probes'],
  installPlanning: ['field', 'probes', 'routeOrder', 'plannedInstaller', 'readyToInstall'],
  activeSeason: ['field', 'operation', 'probes', 'probeStatus', 'installDate', 'approvalStatus'],
  removal: ['field', 'removalDate', 'removalNotes', 'readyToRemove', 'earlyRemoval'],
};

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

export default function SettingsClient({ initialServiceRates, availableSeasons }: SettingsClientProps) {
  const [serviceRates, setServiceRates] = useState(initialServiceRates);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(initialAddForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProcessedServiceRate>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [globalSeason, setGlobalSeason] = useState<string>(String(new Date().getFullYear()));
  const [seasonSaved, setSeasonSaved] = useState(false);
  const [tabColumns, setTabColumns] = useState<Record<TabView, FieldColumnKey[]>>(() => ({ ...TAB_DEFAULT_COLUMNS }));
  const [selectedColumnTab, setSelectedColumnTab] = useState<TabView>('signup');
  const [columnsSaved, setColumnsSaved] = useState(false);

  // Load global season from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GLOBAL_SEASON_KEY);
      if (stored) {
        setGlobalSeason(stored);
      }
    } catch (e) {
      console.error('Failed to load global season:', e);
    }
  }, []);

  // Load tab columns from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FIELD_COLUMNS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const validated: Record<TabView, FieldColumnKey[]> = { ...TAB_DEFAULT_COLUMNS };
        for (const tab of TAB_INFO.map(t => t.key)) {
          if (parsed[tab] && Array.isArray(parsed[tab])) {
            validated[tab] = parsed[tab].filter((col: string) =>
              ALL_COLUMN_DEFINITIONS.some(c => c.key === col)
            );
            // Ensure 'field' is always included
            if (!validated[tab].includes('field')) {
              validated[tab] = ['field', ...validated[tab]];
            }
          }
        }
        setTabColumns(validated);
      }
    } catch (e) {
      console.error('Failed to load tab columns:', e);
    }
  }, []);

  // Save global season to localStorage
  const handleSeasonChange = (newSeason: string) => {
    setGlobalSeason(newSeason);
    try {
      localStorage.setItem(GLOBAL_SEASON_KEY, newSeason);
      setSeasonSaved(true);
      setTimeout(() => setSeasonSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save global season:', e);
    }
  };

  // Toggle column visibility for a tab
  const handleToggleColumn = (columnKey: FieldColumnKey) => {
    if (columnKey === 'field') return; // Field column is always visible

    const currentColumns = tabColumns[selectedColumnTab];
    let newColumns: FieldColumnKey[];

    if (currentColumns.includes(columnKey)) {
      newColumns = currentColumns.filter(c => c !== columnKey);
    } else {
      // Add column in the original order from ALL_COLUMN_DEFINITIONS
      const allKeys = ALL_COLUMN_DEFINITIONS.map(c => c.key);
      newColumns = [...currentColumns, columnKey].sort((a, b) =>
        allKeys.indexOf(a) - allKeys.indexOf(b)
      );
    }

    const newTabColumns = { ...tabColumns, [selectedColumnTab]: newColumns };
    setTabColumns(newTabColumns);

    try {
      localStorage.setItem(FIELD_COLUMNS_STORAGE_KEY, JSON.stringify(newTabColumns));
      setColumnsSaved(true);
      setTimeout(() => setColumnsSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save column settings:', e);
    }
  };

  // Reset columns for a tab to defaults
  const handleResetColumns = () => {
    const newTabColumns = { ...tabColumns, [selectedColumnTab]: TAB_DEFAULT_COLUMNS[selectedColumnTab] };
    setTabColumns(newTabColumns);

    try {
      localStorage.setItem(FIELD_COLUMNS_STORAGE_KEY, JSON.stringify(newTabColumns));
      setColumnsSaved(true);
      setTimeout(() => setColumnsSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save column settings:', e);
    }
  };

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
      <PageHeader title="Settings" />

      {/* Application Settings */}
      <ContentCard className="mb-6">
        <SectionHeader title="Application Settings" />

        <FormFieldRow>
          <div className="form-field">
            <label>Default Season:</label>
            <select
              className="inline-select"
              value={globalSeason}
              onChange={(e) => handleSeasonChange(e.target.value)}
            >
              {availableSeasons.map((season) => (
                <option key={season} value={season}>{season}</option>
              ))}
            </select>
            <SavedIndicator show={seasonSaved} />
          </div>
        </FormFieldRow>
        <p className="section-description" style={{ marginTop: '8px', marginBottom: 0 }}>
          This season will be pre-selected when you visit pages with season filters.
        </p>
      </ContentCard>

      {/* Fields Tab Column Settings */}
      <ContentCard className="mb-6">
        <SectionHeader
          title="Fields Tab Columns"
          actions={<SavedIndicator show={columnsSaved} />}
        />

        <p className="section-description">
          Configure which columns are visible for each tab on the Fields page.
        </p>

        {/* Tab and column dropdowns */}
        <FormFieldRow className="mb-4">
          <div>
            <label className="form-group-label">Tab</label>
            <select
              className="inline-select"
              value={selectedColumnTab}
              onChange={(e) => setSelectedColumnTab(e.target.value as TabView)}
            >
              {TAB_INFO.map((tab) => (
                <option key={tab.key} value={tab.key}>{tab.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-group-label">Add Column</label>
            <select
              className="inline-select"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleToggleColumn(e.target.value as FieldColumnKey);
                }
              }}
            >
              <option value="">Select column to add...</option>
              {ALL_COLUMN_DEFINITIONS
                .filter(col => !col.alwaysVisible && !tabColumns[selectedColumnTab].includes(col.key))
                .map((col) => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
            </select>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleResetColumns}
            style={{ alignSelf: 'flex-end' }}
          >
            Reset to Defaults
          </button>
        </FormFieldRow>

        {/* Selected columns as removable tags */}
        <ColumnTagsContainer>
          {tabColumns[selectedColumnTab].map((colKey) => {
            const col = ALL_COLUMN_DEFINITIONS.find(c => c.key === colKey);
            if (!col) return null;
            return (
              <ColumnTag
                key={colKey}
                label={col.label}
                locked={col.alwaysVisible}
                onRemove={() => handleToggleColumn(colKey)}
              />
            );
          })}
        </ColumnTagsContainer>

        <div className="column-count">
          {tabColumns[selectedColumnTab].length} columns selected
        </div>
      </ContentCard>

      {/* Service Rates */}
      <ContentCard className="mb-6">
        <SectionHeader
          title="Service Rates"
          actions={
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              + Add Rate
            </button>
          }
        />

        <p className="section-description">
          Define billing rates for each service type. These rates auto-fill when enrolling fields.
        </p>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Service Type</th>
                <th className="align-right">Customer Rate</th>
                <th className="align-right">Dealer Fee</th>
                <th className="align-right">Margin</th>
                <th>Description</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activeRates.length === 0 && inactiveRates.length === 0 && (
                <tr>
                  <td colSpan={7} className="entity-empty">
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
                          className="form-group input"
                          value={editForm.serviceType || ''}
                          onChange={(e) => setEditForm({ ...editForm, serviceType: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-group input align-right"
                          value={editForm.rate || ''}
                          onChange={(e) => setEditForm({ ...editForm, rate: parseFloat(e.target.value) || 0 })}
                          step="0.01"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-group input align-right"
                          value={editForm.dealerFee || ''}
                          onChange={(e) => setEditForm({ ...editForm, dealerFee: parseFloat(e.target.value) || 0 })}
                          step="0.01"
                        />
                      </td>
                      <td className="align-right discount-text">
                        {formatCurrency((editForm.rate || 0) - (editForm.dealerFee || 0))}
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-group input"
                          value={editForm.description || ''}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
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
                        <div className="table-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => handleSaveEdit(rate.id)} disabled={savingEdit}>
                            {savingEdit ? '...' : 'Save'}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={handleCancelEdit}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="operation-name">{rate.serviceType}</td>
                      <td className="align-right">{formatCurrency(rate.rate)}</td>
                      <td className="align-right" style={{ color: 'var(--text-muted)' }}>{formatCurrency(rate.dealerFee)}</td>
                      <td className="align-right discount-text">{formatCurrency(rate.rate - rate.dealerFee)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{rate.description || '—'}</td>
                      <td>
                        <span className="status-badge installed">
                          <span className="status-dot"></span>
                          Active
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
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
        </div>

        {inactiveRates.length > 0 && (
          <>
            <h4 className="section-subtitle">Inactive Rates</h4>
            <div className="table-container">
              <table>
                <tbody>
                  {inactiveRates.map((rate) => (
                    <tr key={rate.id} style={{ opacity: 0.6 }}>
                      <td className="operation-name">{rate.serviceType}</td>
                      <td className="align-right">{formatCurrency(rate.rate)}</td>
                      <td className="align-right" style={{ color: 'var(--text-muted)' }}>{formatCurrency(rate.dealerFee)}</td>
                      <td className="align-right">{formatCurrency(rate.rate - rate.dealerFee)}</td>
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
            </div>
          </>
        )}
      </ContentCard>

      {/* Add Rate Modal */}
      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
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
                  <div className="margin-preview">
                    <span>Margin: </span>
                    <span className="discount-text">
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
