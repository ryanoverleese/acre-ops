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

export interface ProcessedProductService {
  id: number;
  serviceType: string;
  rate: number;
  dealerFee: number;
  description: string;
  status: string;
}

interface SelectOption {
  id: number;
  value: string;
  color: string;
}

interface FieldOptionsMeta {
  fieldId: number;
  options: SelectOption[];
}

interface TableSelectOptionsWithMeta {
  [fieldName: string]: FieldOptionsMeta;
}

interface SerializedSelectOptionsWithMeta {
  fields: TableSelectOptionsWithMeta;
  field_seasons: TableSelectOptionsWithMeta;
  probe_assignments: TableSelectOptionsWithMeta;
}

interface SettingsClientProps {
  initialProductsServices: ProcessedProductService[];
  availableSeasons: string[];
  selectOptions: SerializedSelectOptionsWithMeta;
}

const BASEROW_OPTION_COLORS = [
  'light-blue', 'light-green', 'light-orange', 'light-red', 'light-cyan',
  'blue', 'green', 'orange', 'red', 'cyan', 'yellow',
];

// Friendly labels for table and field names
const TABLE_LABELS: Record<string, string> = {
  fields: 'Fields',
  field_seasons: 'Field Seasons',
  probe_assignments: 'Probe Assignments',
};

const FIELD_LABELS: Record<string, string> = {
  irrigation_type: 'Irrigation Type',
  row_direction: 'Row Direction',
  water_source: 'Water Source',
  fuel_source: 'Fuel Source',
  drip_tubing_direction: 'Drip Tubing Direction',
  crop: 'Crop',
  service_type: 'Service Type',
  side_dress: 'Side Dress',
  early_removal: 'Early Removal',
  ready_to_remove: 'Ready to Remove',
  planned_installer: 'Planned Installer',
  antenna_type: 'Antenna Type',
  battery_type: 'Battery Type',
  probe_status: 'Probe Status',
  approval_status: 'Approval Status',
};

const GLOBAL_SEASON_KEY = 'acre-ops-global-season';
const FIELD_COLUMNS_STORAGE_KEY = 'fields-tab-columns';

// Column definitions matching Fields page
type FieldColumnKey =
  | 'field' | 'operation' | 'billingEntity' | 'crop' | 'service' | 'cropConfirmed'
  | 'hybrid' | 'antenna' | 'battery' | 'sideDress' | 'loggerId' | 'probes'
  | 'routeOrder' | 'plannedInstaller' | 'readyToInstall'
  | 'probeStatus' | 'installDate' | 'installer' | 'approvalStatus'
  | 'removalDate' | 'removalNotes' | 'readyToRemove' | 'earlyRemoval'
  | 'acres' | 'pivotAcres' | 'irrigationType' | 'rowDirection'
  | 'waterSource' | 'fuelSource' | 'elevation' | 'soilType' | 'fieldDirections';

type TabView = 'fieldData' | 'signup' | 'seasonSetup' | 'installPlanning' | 'activeSeason' | 'removal';

interface FieldColumnDefinition {
  key: FieldColumnKey;
  label: string;
  alwaysVisible?: boolean;
}

const ALL_COLUMN_DEFINITIONS: FieldColumnDefinition[] = [
  { key: 'field', label: 'Field', alwaysVisible: true },
  { key: 'acres', label: 'Acres' },
  { key: 'antenna', label: 'Antenna' },
  { key: 'approvalStatus', label: 'Approval Status' },
  { key: 'battery', label: 'Battery' },
  { key: 'billingEntity', label: 'Billing Entity' },
  { key: 'crop', label: 'Crop' },
  { key: 'cropConfirmed', label: 'Crop Confirmed' },
  { key: 'earlyRemoval', label: 'Early Removal' },
  { key: 'elevation', label: 'Elevation' },
  { key: 'fieldDirections', label: 'Field Directions' },
  { key: 'fuelSource', label: 'Fuel Source' },
  { key: 'hybrid', label: 'Hybrid/Variety' },
  { key: 'installDate', label: 'Install Date' },
  { key: 'installer', label: 'Installer' },
  { key: 'irrigationType', label: 'Irrigation Type' },
  { key: 'loggerId', label: 'Logger ID' },
  { key: 'operation', label: 'Operation' },
  { key: 'plannedInstaller', label: 'Planned Installer' },
  { key: 'pivotAcres', label: 'Pivot Acres' },
  { key: 'probeStatus', label: 'Probe Status' },
  { key: 'probes', label: 'Probes' },
  { key: 'readyToInstall', label: 'Ready to Install' },
  { key: 'readyToRemove', label: 'Ready to Remove' },
  { key: 'removalDate', label: 'Removal Date' },
  { key: 'removalNotes', label: 'Removal Notes' },
  { key: 'routeOrder', label: 'Route #' },
  { key: 'rowDirection', label: 'Row Direction' },
  { key: 'service', label: 'Service Type' },
  { key: 'sideDress', label: 'Side-dress' },
  { key: 'soilType', label: 'Soil Type' },
  { key: 'waterSource', label: 'Water Source' },
];

const TAB_INFO: { key: TabView; label: string }[] = [
  { key: 'fieldData', label: 'Field Data' },
  { key: 'signup', label: 'Signup' },
  { key: 'seasonSetup', label: 'Season Setup' },
  { key: 'installPlanning', label: 'Install Planning' },
  { key: 'activeSeason', label: 'Active Season' },
  { key: 'removal', label: 'Removal' },
];

const TAB_DEFAULT_COLUMNS: Record<TabView, FieldColumnKey[]> = {
  fieldData: ['field', 'operation', 'acres', 'pivotAcres', 'irrigationType', 'waterSource', 'fuelSource', 'soilType', 'elevation'],
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

export default function SettingsClient({ initialProductsServices, availableSeasons, selectOptions }: SettingsClientProps) {
  const [productsServices, setProductsServices] = useState(initialProductsServices);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState(initialAddForm);
  const [saving, setSaving] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProcessedProductService>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [globalSeason, setGlobalSeason] = useState<string>(String(new Date().getFullYear()));
  const [seasonSaved, setSeasonSaved] = useState(false);
  const [tabColumns, setTabColumns] = useState<Record<TabView, FieldColumnKey[]>>(() => ({ ...TAB_DEFAULT_COLUMNS }));
  const [selectedColumnTab, setSelectedColumnTab] = useState<TabView>('signup');
  const [columnsSaved, setColumnsSaved] = useState(false);

  // Collapsible sections - all collapsed by default
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Dropdown options editing state
  const [localOptions, setLocalOptions] = useState<SerializedSelectOptionsWithMeta>(selectOptions);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [editingOption, setEditingOption] = useState<{ key: string; optionId: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Drag-and-drop state for dropdown option reordering
  const [dragSource, setDragSource] = useState<{ tableName: string; fieldName: string; index: number } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const saveFieldOptions = async (tableName: string, fieldName: string, options: (SelectOption | { value: string; color: string })[]) => {
    const tableOpts = localOptions[tableName as keyof SerializedSelectOptionsWithMeta];
    const fieldMeta = tableOpts?.[fieldName];
    if (!fieldMeta) return false;

    const key = `${tableName}.${fieldName}`;
    setSavingField(key);

    try {
      const response = await fetch('/api/select-options', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldId: fieldMeta.fieldId,
          select_options: options,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedOptions: SelectOption[] = data.select_options || options;
        setLocalOptions(prev => ({
          ...prev,
          [tableName]: {
            ...prev[tableName as keyof SerializedSelectOptionsWithMeta],
            [fieldName]: { fieldId: fieldMeta.fieldId, options: updatedOptions },
          },
        }));
        return true;
      } else {
        alert('Failed to update options');
        return false;
      }
    } catch (error) {
      console.error('Error saving options:', error);
      alert('Failed to save options');
      return false;
    } finally {
      setSavingField(null);
    }
  };

  const handleAddOption = async (tableName: string, fieldName: string) => {
    if (!newOptionValue.trim()) return;
    const tableOpts = localOptions[tableName as keyof SerializedSelectOptionsWithMeta];
    const fieldMeta = tableOpts?.[fieldName];
    if (!fieldMeta) return;

    if (fieldMeta.options.some(o => o.value.toLowerCase() === newOptionValue.trim().toLowerCase())) {
      alert('This option already exists');
      return;
    }

    const color = BASEROW_OPTION_COLORS[fieldMeta.options.length % BASEROW_OPTION_COLORS.length];
    const newOptions = [
      ...fieldMeta.options,
      { value: newOptionValue.trim(), color },
    ];

    const success = await saveFieldOptions(tableName, fieldName, newOptions);
    if (success) {
      setNewOptionValue('');
      setAddingTo(null);
    }
  };

  const handleRemoveOption = async (tableName: string, fieldName: string, optionId: number) => {
    const tableOpts = localOptions[tableName as keyof SerializedSelectOptionsWithMeta];
    const fieldMeta = tableOpts?.[fieldName];
    if (!fieldMeta) return;

    const optionToRemove = fieldMeta.options.find(o => o.id === optionId);
    if (!confirm(`Remove "${optionToRemove?.value}"? Any rows using this value will be cleared.`)) return;

    const newOptions = fieldMeta.options.filter(o => o.id !== optionId);
    await saveFieldOptions(tableName, fieldName, newOptions);
  };

  const handleRenameOption = async (tableName: string, fieldName: string, optionId: number) => {
    if (!editValue.trim()) {
      setEditingOption(null);
      setEditValue('');
      return;
    }

    const tableOpts = localOptions[tableName as keyof SerializedSelectOptionsWithMeta];
    const fieldMeta = tableOpts?.[fieldName];
    if (!fieldMeta) return;

    const currentOpt = fieldMeta.options.find(o => o.id === optionId);
    if (currentOpt && currentOpt.value === editValue.trim()) {
      setEditingOption(null);
      setEditValue('');
      return;
    }

    const newOptions = fieldMeta.options.map(o =>
      o.id === optionId ? { ...o, value: editValue.trim() } : o
    );

    await saveFieldOptions(tableName, fieldName, newOptions);
    setEditingOption(null);
    setEditValue('');
  };

  const handleDragStart = (e: React.DragEvent, tableName: string, fieldName: string, index: number) => {
    setDragSource({ tableName, fieldName, index });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = async (tableName: string, fieldName: string, dropIndex: number) => {
    if (!dragSource || dragSource.tableName !== tableName || dragSource.fieldName !== fieldName) {
      setDragSource(null);
      setDragOverIndex(null);
      return;
    }

    if (dragSource.index === dropIndex) {
      setDragSource(null);
      setDragOverIndex(null);
      return;
    }

    const tableOpts = localOptions[tableName as keyof SerializedSelectOptionsWithMeta];
    const fieldMeta = tableOpts?.[fieldName];
    if (!fieldMeta) return;

    const newOptions = [...fieldMeta.options];
    const [movedItem] = newOptions.splice(dragSource.index, 1);
    newOptions.splice(dropIndex, 0, movedItem);

    // Update local state immediately for snappy feedback
    setLocalOptions(prev => ({
      ...prev,
      [tableName]: {
        ...prev[tableName as keyof SerializedSelectOptionsWithMeta],
        [fieldName]: { fieldId: fieldMeta.fieldId, options: newOptions },
      },
    }));

    setDragSource(null);
    setDragOverIndex(null);

    // Persist to Baserow
    await saveFieldOptions(tableName, fieldName, newOptions);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOverIndex(null);
  };

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
      const response = await fetch('/api/products-services', {
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
        setProductsServices([...productsServices, {
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
        alert(error.error || 'Failed to create product/service');
      }
    } catch (error) {
      console.error('Error creating product/service:', error);
      alert('Failed to create product/service');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (rate: ProcessedProductService) => {
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
      const response = await fetch(`/api/products-services/${id}`, {
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
        setProductsServices(productsServices.map((sr) =>
          sr.id === id ? { ...sr, ...editForm } as ProcessedProductService : sr
        ));
        setEditingId(null);
        setEditForm({});
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update product/service');
      }
    } catch (error) {
      console.error('Error updating product/service:', error);
      alert('Failed to update product/service');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (rate: ProcessedProductService) => {
    const newStatus = rate.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const response = await fetch(`/api/products-services/${rate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setProductsServices(productsServices.map((sr) =>
          sr.id === rate.id ? { ...sr, status: newStatus } : sr
        ));
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const activeRates = productsServices.filter((sr) => sr.status === 'Active');
  const inactiveRates = productsServices.filter((sr) => sr.status !== 'Active');

  return (
    <>
      <PageHeader title="Settings" />

      {/* Application Settings */}
      <ContentCard className="mb-6">
        <div
          onClick={() => toggleSection('appSettings')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
        >
          <div style={{ flex: 1 }}>
            <SectionHeader title="Application Settings" />
          </div>
          <svg
            fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"
            style={{ transition: 'transform 0.2s', transform: openSections.has('appSettings') ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginBottom: 'var(--space-4)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {openSections.has('appSettings') && (
          <>
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
          </>
        )}
      </ContentCard>

      {/* Fields Tab Column Settings */}
      <ContentCard className="mb-6">
        <div
          onClick={() => toggleSection('tabColumns')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
        >
          <div style={{ flex: 1 }}>
            <SectionHeader
              title="Fields Tab Columns"
              actions={<SavedIndicator show={columnsSaved} />}
            />
          </div>
          <svg
            fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"
            style={{ transition: 'transform 0.2s', transform: openSections.has('tabColumns') ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginBottom: 'var(--space-4)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {openSections.has('tabColumns') && (
          <>
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
          </>
        )}
      </ContentCard>

      {/* Products & Services */}
      <ContentCard className="mb-6">
        <div
          onClick={() => toggleSection('productsServices')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
        >
          <div style={{ flex: 1 }}>
            <SectionHeader
              title="Products & Services"
              actions={
                openSections.has('productsServices') ? (
                  <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); setShowAddModal(true); }} style={{ marginLeft: '12px' }}>
                    + Add Rate
                  </button>
                ) : undefined
              }
            />
          </div>
          <svg
            fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"
            style={{ transition: 'transform 0.2s', transform: openSections.has('productsServices') ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginBottom: 'var(--space-4)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {openSections.has('productsServices') && (
          <>
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
          </>
        )}
      </ContentCard>

      {/* Add Rate Modal */}
      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add Product / Service</h3>
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

      {/* Dropdown Options */}
      <ContentCard className="mb-6">
        <div
          onClick={() => toggleSection('dropdownOptions')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
        >
          <div style={{ flex: 1 }}>
            <SectionHeader title="Dropdown Options" />
          </div>
          <svg
            fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"
            style={{ transition: 'transform 0.2s', transform: openSections.has('dropdownOptions') ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginBottom: 'var(--space-4)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {openSections.has('dropdownOptions') && (
          <>
        <p className="section-description">
          Manage dropdown options used across the application. Click an option to rename it, use &times; to remove, or + to add new options.
        </p>

        {(Object.entries(localOptions) as [string, TableSelectOptionsWithMeta][]).map(([tableName, tableOpts]) => {
          const fieldEntries = (Object.entries(tableOpts) as [string, FieldOptionsMeta][]).filter(([, meta]) => meta.options.length > 0);
          if (fieldEntries.length === 0) return null;

          return (
            <div key={tableName} style={{ marginTop: '16px' }}>
              <h4 className="section-subtitle" style={{ marginBottom: '8px' }}>
                {TABLE_LABELS[tableName] || tableName}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {fieldEntries.sort(([a], [b]) => a.localeCompare(b)).map(([fieldName, meta]) => {
                  const fieldKey = `${tableName}.${fieldName}`;
                  const isSaving = savingField === fieldKey;
                  const isAdding = addingTo === fieldKey;

                  return (
                    <div key={fieldName} style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '12px',
                      background: 'var(--bg-secondary)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {FIELD_LABELS[fieldName] || fieldName.replace(/_/g, ' ')}
                        </span>
                        {isSaving && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>Saving...</span>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        {meta.options.map((opt, optIndex) => {
                          const isEditing = editingOption?.key === fieldKey && editingOption.optionId === opt.id;
                          const isDragging = dragSource?.tableName === tableName && dragSource?.fieldName === fieldName && dragSource?.index === optIndex;
                          const isDragOver = dragSource?.tableName === tableName && dragSource?.fieldName === fieldName && dragOverIndex === optIndex;

                          if (isEditing) {
                            return (
                              <input
                                key={opt.id}
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleRenameOption(tableName, fieldName, opt.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameOption(tableName, fieldName, opt.id);
                                  if (e.key === 'Escape') { setEditingOption(null); setEditValue(''); }
                                }}
                                autoFocus
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  border: '2px solid var(--accent)',
                                  background: 'var(--bg-primary)',
                                  color: 'var(--text-primary)',
                                  outline: 'none',
                                  width: `${Math.max(60, editValue.length * 8 + 20)}px`,
                                }}
                              />
                            );
                          }

                          return (
                            <span
                              key={opt.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, tableName, fieldName, optIndex)}
                              onDragOver={(e) => handleDragOver(e, optIndex)}
                              onDrop={() => handleDrop(tableName, fieldName, optIndex)}
                              onDragEnd={handleDragEnd}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                background: isDragOver ? 'var(--accent-green)' : 'var(--bg-tertiary)',
                                border: isDragOver ? '2px solid var(--accent-green)' : '1px solid var(--border)',
                                color: isDragOver ? '#fff' : 'var(--text-primary)',
                                cursor: 'grab',
                                opacity: isDragging ? 0.4 : 1,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span
                                onClick={() => { setEditingOption({ key: fieldKey, optionId: opt.id }); setEditValue(opt.value); }}
                                style={{ cursor: 'pointer' }}
                                title="Click to rename, drag to reorder"
                              >
                                {opt.value}
                              </span>
                              <button
                                onClick={() => handleRemoveOption(tableName, fieldName, opt.id)}
                                disabled={isSaving}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: isDragOver ? '#fff' : 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: '0 2px',
                                  fontSize: '14px',
                                  lineHeight: 1,
                                  opacity: 0.6,
                                }}
                                title="Remove option"
                              >
                                &times;
                              </button>
                            </span>
                          );
                        })}

                        {isAdding ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <input
                              type="text"
                              value={newOptionValue}
                              onChange={(e) => setNewOptionValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddOption(tableName, fieldName);
                                if (e.key === 'Escape') { setAddingTo(null); setNewOptionValue(''); }
                              }}
                              autoFocus
                              placeholder="New option..."
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                border: '2px solid var(--accent)',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                width: '120px',
                              }}
                            />
                            <button
                              onClick={() => handleAddOption(tableName, fieldName)}
                              disabled={isSaving || !newOptionValue.trim()}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                padding: '2px 8px',
                                fontSize: '12px',
                                fontWeight: 700,
                              }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setAddingTo(null); setNewOptionValue(''); }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '0 4px',
                                fontSize: '14px',
                              }}
                            >
                              &times;
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => { setAddingTo(fieldKey); setNewOptionValue(''); }}
                            disabled={isSaving}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              background: 'none',
                              border: '1px dashed var(--border)',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            + Add New
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
          </>
        )}
      </ContentCard>

      {/* Data Backup */}
      <ContentCard className="mb-6">
        <div
          onClick={() => toggleSection('backup')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}
        >
          <div style={{ flex: 1 }}>
            <SectionHeader title="Data Backup" />
          </div>
          <svg
            fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20"
            style={{ transition: 'transform 0.2s', transform: openSections.has('backup') ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0, marginBottom: 'var(--space-4)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {openSections.has('backup') && (
          <>
            <p className="section-description">
              Download a full backup of all your data as a CSV file. Opens in Excel or Google Sheets.
            </p>
            <div style={{ marginTop: '12px' }}>
              <button
                className="btn btn-primary"
                disabled={backupLoading}
                onClick={async () => {
                  setBackupLoading(true);
                  try {
                    const response = await fetch('/api/backup');
                    if (!response.ok) throw new Error('Backup failed');
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'acre-ops-backup.csv';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch {
                    alert('Failed to download backup. Please try again.');
                  } finally {
                    setBackupLoading(false);
                  }
                }}
              >
                {backupLoading ? 'Downloading...' : 'Download Backup'}
              </button>
            </div>
          </>
        )}
      </ContentCard>
    </>
  );
}
