'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import EmptyState from '@/components/EmptyState';
import InlineProbeCell from '@/components/InlineProbeCell';
import CreateProbeModal from '@/components/fields/CreateProbeModal';
import EditSeasonModal, { createEditSeasonForm } from '@/components/fields/EditSeasonModal';
import AddFieldModal from '@/components/fields/AddFieldModal';
import AddSeasonModal from '@/components/fields/AddSeasonModal';
import { FieldCell, COLUMN_MIN_WIDTHS } from '@/components/fields/FieldCell';
import type { ProcessedField, ProcessedProbeAssignment, OperationOption, BillingEntityOption, ProbeOption, ServiceRateOption } from './page';

const FieldsMap = dynamic(() => import('@/components/FieldsMap'), {
  ssr: false,
  loading: () => <div className="fields-map" style={{ display: 'block' }}><div className="loading"><div className="loading-spinner"></div>Loading map...</div></div>,
});

const LocationPicker = dynamic(() => import('@/components/LocationPicker'), {
  ssr: false,
  loading: () => <div className="location-picker-overlay"><div className="location-picker-modal"><div className="loading">Loading map...</div></div></div>,
});

type TabView = 'fieldData' | 'signup' | 'seasonSetup' | 'installPlanning' | 'activeSeason' | 'removal';

interface FieldsClientProps {
  initialFields: ProcessedField[];
  operations: OperationOption[];
  billingEntities: BillingEntityOption[];
  probes: ProbeOption[];
  availableSeasons: string[];
  initialProbeAssignments: ProcessedProbeAssignment[];
  serviceRates: ServiceRateOption[];
}

// Column definitions for all tabs
type FieldColumnKey =
  | 'field' | 'operation' | 'billingEntity' | 'crop' | 'service' | 'cropConfirmed'
  | 'hybrid' | 'antenna' | 'battery' | 'sideDress' | 'loggerId' | 'probes'
  | 'routeOrder' | 'plannedInstaller' | 'readyToInstall' | 'nrcsField'
  | 'probeStatus' | 'installDate' | 'installer' | 'approvalStatus'
  | 'removalDate' | 'removalNotes' | 'readyToRemove' | 'earlyRemoval'
  | 'acres' | 'pivotAcres' | 'irrigationType' | 'rowDirection'
  | 'waterSource' | 'fuelSource' | 'elevation' | 'soilType' | 'fieldDirections';

interface FieldColumnDefinition {
  key: FieldColumnKey;
  label: string;
  alwaysVisible?: boolean;
}

// All available columns
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
  { key: 'nrcsField', label: 'NRCS Field' },
  { key: 'operation', label: 'Operation' },
  { key: 'pivotAcres', label: 'Pivot Acres' },
  { key: 'plannedInstaller', label: 'Planned Installer' },
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

// Default columns for each tab
const TAB_DEFAULT_COLUMNS: Record<TabView, FieldColumnKey[]> = {
  fieldData: ['field', 'operation', 'acres', 'pivotAcres', 'irrigationType', 'waterSource', 'fuelSource', 'soilType', 'elevation'],
  signup: ['field', 'operation', 'billingEntity', 'crop', 'service'],
  seasonSetup: ['field', 'crop', 'hybrid', 'antenna', 'battery', 'sideDress', 'loggerId', 'probes'],
  installPlanning: ['field', 'probes', 'routeOrder', 'plannedInstaller', 'readyToInstall'],
  activeSeason: ['field', 'operation', 'probes', 'probeStatus', 'installDate', 'approvalStatus'],
  removal: ['field', 'removalDate', 'removalNotes', 'readyToRemove', 'earlyRemoval'],
};

// Tab display info
const TAB_INFO: { key: TabView; label: string }[] = [
  { key: 'fieldData', label: 'Field Data' },
  { key: 'signup', label: 'Signup' },
  { key: 'seasonSetup', label: 'Season Setup' },
  { key: 'installPlanning', label: 'Install Planning' },
  { key: 'activeSeason', label: 'Active Season' },
  { key: 'removal', label: 'Removal' },
];

const FIELD_COLUMNS_STORAGE_KEY = 'fields-tab-columns';

export default function FieldsClient({
  initialFields,
  operations,
  billingEntities,
  probes,
  availableSeasons,
  initialProbeAssignments,
  serviceRates,
}: FieldsClientProps) {
  const [fields, setFields] = useState(initialFields);
  const [probeAssignments, setProbeAssignments] = useState(initialProbeAssignments);
  const [expandedFieldSeasons, setExpandedFieldSeasons] = useState<Set<number>>(new Set());
  const [addingProbeForFieldSeason, setAddingProbeForFieldSeason] = useState<number | null>(null);
  const [savingProbeAssignment, setSavingProbeAssignment] = useState(false);
  const [currentSeason, setCurrentSeason] = useState(availableSeasons[0] || '2026');
  const [customYears, setCustomYears] = useState<string[]>([]);
  const [currentOperation, setCurrentOperation] = useState<string>('all');
  const [currentIrrigationType, setCurrentIrrigationType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapVisible, setMapVisible] = useState(false);
  const [colorBy, setColorBy] = useState<'none' | 'crop' | 'status' | 'operation'>('none');
  const [selectedField, setSelectedField] = useState<ProcessedField | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ProcessedField>>({});
  const [currentTab, setCurrentTab] = useState<TabView>(() => {
    // Restore tab from sessionStorage if available
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('fieldsCurrentTab');
      if (saved && TAB_INFO.some(t => t.key === saved)) {
        return saved as TabView;
      }
    }
    return 'signup';
  });
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFieldLatLng, setAddFieldLatLng] = useState<{ lat: string; lng: string } | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('field');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showProbeAssign, setShowProbeAssign] = useState(false);
  const [selectedProbeId, setSelectedProbeId] = useState<string>('');
  const [selectedProbe2Id, setSelectedProbe2Id] = useState<string>('');
  const [savingProbe, setSavingProbe] = useState(false);
  const [showCreateProbeModal, setShowCreateProbeModal] = useState(false);
  const [createProbeTarget, setCreateProbeTarget] = useState<'probe1' | 'probe2'>('probe1');
  const [createProbeAssignmentId, setCreateProbeAssignmentId] = useState<number | null>(null);
  const [createProbeOperationName, setCreateProbeOperationName] = useState('');
  const [localProbes, setLocalProbes] = useState(probes);
  const [showSeasonFieldsEdit, setShowSeasonFieldsEdit] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState<'edit' | 'add' | 'probeAssignment'>('edit');
  const [editingProbeAssignmentLocation, setEditingProbeAssignmentLocation] = useState<ProcessedProbeAssignment | null>(null);
  const [showAddSeasonModal, setShowAddSeasonModal] = useState(false);
  // Removal logging
  const [showRemovalModal, setShowRemovalModal] = useState(false);
  const [removalForm, setRemovalForm] = useState({
    removal_date: '',
    removal_notes: '',
    log_to_probe: false,
  });
  const [savingRemoval, setSavingRemoval] = useState(false);
  const [showRolloverModal, setShowRolloverModal] = useState(false);
  const [rolloverForm, setRolloverForm] = useState({
    fromSeason: availableSeasons[1] || String(new Date().getFullYear() - 1),
    toSeason: availableSeasons[0] || String(new Date().getFullYear()),
    copyProbes: false,
  });
  const [rollingOver, setRollingOver] = useState(false);

  // Batch enroll/unenroll modal state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchMode, setBatchMode] = useState<'enroll' | 'unenroll'>('enroll');
  const [batchSeason, setBatchSeason] = useState(availableSeasons[0] || String(new Date().getFullYear()));
  const [batchServiceType, setBatchServiceType] = useState('');
  const [selectedBatchFieldIds, setSelectedBatchFieldIds] = useState<Set<number>>(new Set());
  const [batchSaving, setBatchSaving] = useState(false);

  // Column picker state
  const [tabColumns, setTabColumns] = useState<Record<TabView, FieldColumnKey[]>>(() => ({ ...TAB_DEFAULT_COLUMNS }));
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Persist currentTab to sessionStorage so it survives page reloads
  useEffect(() => {
    sessionStorage.setItem('fieldsCurrentTab', currentTab);
  }, [currentTab]);

  // Load column preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FIELD_COLUMNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<TabView, FieldColumnKey[]>;
        // Validate and merge with defaults
        const validated: Record<TabView, FieldColumnKey[]> = { ...TAB_DEFAULT_COLUMNS };
        for (const tab of TAB_INFO.map(t => t.key)) {
          if (parsed[tab] && Array.isArray(parsed[tab])) {
            const valid = parsed[tab].filter((col: string) => ALL_COLUMN_DEFINITIONS.some((def) => def.key === col));
            if (!valid.includes('field')) valid.unshift('field');
            validated[tab] = valid as FieldColumnKey[];
          }
        }
        setTabColumns(validated);
      }
    } catch (e) {
      console.error('Failed to load column preferences:', e);
    }
  }, []);

  // Save column preferences to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(FIELD_COLUMNS_STORAGE_KEY, JSON.stringify(tabColumns));
    } catch (e) {
      console.error('Failed to save column preferences:', e);
    }
  }, [tabColumns]);

  // Get visible columns for current tab
  const visibleColumns = tabColumns[currentTab] || TAB_DEFAULT_COLUMNS[currentTab];

  // Column label lookup
  const columnLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    ALL_COLUMN_DEFINITIONS.forEach((col) => { map[col.key] = col.label; });
    return map;
  }, []);

  // Get display value for a column key from a field (for mobile cards)
  const getMobileCardValue = (field: ProcessedField, key: FieldColumnKey): string => {
    switch (key) {
      case 'field': return field.name;
      case 'operation': return field.operation || '—';
      case 'billingEntity': return field.billingEntityName || '—';
      case 'crop': return field.crop || '—';
      case 'cropConfirmed': return (field.crop && field.crop !== 'Unknown') ? 'Yes' : 'No';
      case 'service': return field.serviceType || '—';
      case 'hybrid': return field.hybridVariety || '—';
      case 'antenna': return field.antennaType || '—';
      case 'battery': return field.batteryType || '—';
      case 'sideDress': return field.sideDress || '—';
      case 'loggerId': return field.loggerId || '—';
      case 'probes': return [field.probe, field.probe2].filter(Boolean).join(', ') || '—';
      case 'probeStatus': return field.probeStatus || '—';
      case 'routeOrder': return field.routeOrder?.toString() || '—';
      case 'plannedInstaller': return field.plannedInstaller || '—';
      case 'readyToInstall': return field.readyToInstall ? 'Yes' : 'No';
      case 'nrcsField': return field.nrcsField ? 'Yes' : 'No';
      case 'installDate': return field.installDate || '—';
      case 'installer': return field.installer || '—';
      case 'approvalStatus': return field.approvalStatus || '—';
      case 'removalDate': return field.removalDate || '—';
      case 'removalNotes': return field.removalNotes || '—';
      case 'readyToRemove': return field.readyToRemove || '—';
      case 'earlyRemoval': return field.earlyRemoval || '—';
      case 'acres': return field.acres ? field.acres.toString() : '—';
      case 'pivotAcres': return field.pivotAcres ? field.pivotAcres.toString() : '—';
      case 'irrigationType': return field.irrigationType || '—';
      case 'rowDirection': return field.rowDirection || '—';
      case 'waterSource': return field.waterSource || '—';
      case 'fuelSource': return field.fuelSource || '—';
      case 'elevation': return field.elevation?.toString() || '—';
      case 'soilType': return field.soilType || '—';
      case 'fieldDirections': return field.fieldDirections || '—';
      default: return '—';
    }
  };

  // Close column picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(event.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    if (showColumnPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnPicker]);

  const toggleColumn = (columnKey: FieldColumnKey) => {
    const column = ALL_COLUMN_DEFINITIONS.find((col) => col.key === columnKey);
    if (column?.alwaysVisible) return;
    setTabColumns((prev) => ({
      ...prev,
      [currentTab]: prev[currentTab].includes(columnKey)
        ? prev[currentTab].filter((c) => c !== columnKey)
        : [...prev[currentTab], columnKey],
    }));
  };

  const isColumnVisible = (columnKey: FieldColumnKey) => visibleColumns.includes(columnKey);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Combine available seasons with any custom years added by user
  const allSeasons = useMemo(() => {
    const combined = new Set([...availableSeasons, ...customYears]);
    return Array.from(combined).sort((a, b) => b.localeCompare(a));
  }, [availableSeasons, customYears]);

  // Create service rate lookup map by service type name
  const serviceRateMap = useMemo(() => {
    const map = new Map<string, number>();
    serviceRates.forEach((sr) => {
      if (sr.serviceType) {
        map.set(sr.serviceType, sr.rate);
      }
    });
    return map;
  }, [serviceRates]);

  // Create service type options from service rates
  const serviceTypeOptions = useMemo(() => {
    return serviceRates
      .filter((sr) => sr.serviceType)
      .map((sr) => ({ value: sr.serviceType, label: sr.serviceType }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [serviceRates]);

  // Helper to get rate for a service type
  const getRateForServiceType = useCallback((serviceType: string): string => {
    const rate = serviceRateMap.get(serviceType);
    return rate !== undefined ? rate.toString() : '';
  }, [serviceRateMap]);

  // Filter fields by current season - only show fields that have actual season data
  const seasonFields = useMemo(() => {
    if (currentSeason === 'all') {
      // Show unique fields (dedupe by field ID, keep most recent season)
      const fieldMap = new Map<number, ProcessedField>();
      // Sort by season descending so we keep the most recent
      const sorted = [...fields].sort((a, b) => (b.season || '').localeCompare(a.season || ''));
      sorted.forEach((f) => {
        if (!fieldMap.has(f.id)) {
          fieldMap.set(f.id, f);
        }
      });
      return Array.from(fieldMap.values());
    }

    // Only show fields that have an actual field_season record for this season
    return fields.filter((f) => f.season === currentSeason && f.fieldSeasonId !== null);
  }, [fields, currentSeason]);

  // Calculate fields that can be rolled over (exist in fromSeason but not in toSeason)
  const rolloverStats = useMemo(() => {
    const fromFields = fields.filter((f) => f.season === rolloverForm.fromSeason);
    const toFieldIds = new Set(
      fields.filter((f) => f.season === rolloverForm.toSeason).map((f) => f.id)
    );
    const fieldsToRollover = fromFields.filter((f) => !toFieldIds.has(f.id));
    return {
      fromCount: fromFields.length,
      toCount: fields.filter((f) => f.season === rolloverForm.toSeason).length,
      canRollover: fieldsToRollover.length,
      fieldsToRollover,
    };
  }, [fields, rolloverForm.fromSeason, rolloverForm.toSeason]);

  // Calculate fields available for batch enroll/unenroll
  const batchFieldsList = useMemo(() => {
    // Get unique fields (dedupe by field ID)
    const uniqueFields = new Map<number, ProcessedField>();
    fields.forEach((f) => {
      if (!uniqueFields.has(f.id)) {
        uniqueFields.set(f.id, f);
      }
    });

    // For enroll: fields that DON'T have a field_season for batchSeason
    // For unenroll: fields that DO have a field_season for batchSeason
    const fieldsInSeason = fields.filter((f) => f.season === batchSeason && f.fieldSeasonId);
    const fieldIdsInSeason = new Set(fieldsInSeason.map((f) => f.id));

    if (batchMode === 'enroll') {
      // Return fields NOT in the season
      return Array.from(uniqueFields.values())
        .filter((f) => !fieldIdsInSeason.has(f.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Return fields IN the season (with their fieldSeasonId for deletion)
      return fieldsInSeason.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [fields, batchSeason, batchMode]);

  // Calculate which seasons each field has and is missing (with field_season IDs for deletion)
  const fieldSeasonsMap = useMemo(() => {
    const map = new Map<number, { existing: Map<string, number>; missing: string[] }>();

    // Get unique field IDs
    const fieldIds = new Set(fields.map((f) => f.id));

    fieldIds.forEach((fieldId) => {
      // Map season year to fieldSeasonId
      const existingSeasons = new Map<string, number>();
      fields
        .filter((f) => f.id === fieldId && f.season && f.fieldSeasonId)
        .forEach((f) => existingSeasons.set(f.season, f.fieldSeasonId!));
      const existingYears = new Set(existingSeasons.keys());
      const missing = availableSeasons.filter((s) => !existingYears.has(s));
      map.set(fieldId, { existing: existingSeasons, missing });
    });

    return map;
  }, [fields, availableSeasons]);

  // Calculate which seasons the selected field is missing
  const missingSeasonsForField = useMemo(() => {
    if (!selectedField) return [];
    return fieldSeasonsMap.get(selectedField.id)?.missing || [];
  }, [selectedField, fieldSeasonsMap]);

  const filteredFields = useMemo(() => {
    let filtered = seasonFields;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((f) =>
        (f.name || '').toLowerCase().includes(query) ||
        (f.operation || '').toLowerCase().includes(query) ||
        (f.crop || '').toLowerCase().includes(query) ||
        f.probe?.toLowerCase().includes(query)
      );
    }

    if (currentOperation !== 'all') {
      filtered = filtered.filter((f) => f.operationId?.toString() === currentOperation);
    }

    if (currentIrrigationType !== 'all') {
      filtered = filtered.filter((f) => (f.irrigationType || 'Unknown') === currentIrrigationType);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: string | number | boolean = '';
      let bVal: string | number | boolean = '';

      switch (sortColumn) {
        case 'field': aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase(); break;
        case 'operation': aVal = (a.operation || '').toLowerCase(); bVal = (b.operation || '').toLowerCase(); break;
        case 'billingEntity': aVal = (a.billingEntityName || '').toLowerCase(); bVal = (b.billingEntityName || '').toLowerCase(); break;
        case 'crop': aVal = (a.crop || '').toLowerCase(); bVal = (b.crop || '').toLowerCase(); break;
        case 'cropConfirmed': aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase(); break; // Checkbox column - fallback to name
        case 'service': aVal = (a.serviceType || '').toLowerCase(); bVal = (b.serviceType || '').toLowerCase(); break;
        case 'hybrid': aVal = (a.hybridVariety || '').toLowerCase(); bVal = (b.hybridVariety || '').toLowerCase(); break;
        case 'antenna': aVal = (a.antennaType || '').toLowerCase(); bVal = (b.antennaType || '').toLowerCase(); break;
        case 'battery': aVal = (a.batteryType || '').toLowerCase(); bVal = (b.batteryType || '').toLowerCase(); break;
        case 'sideDress': aVal = (a.sideDress || '').toLowerCase(); bVal = (b.sideDress || '').toLowerCase(); break;
        case 'loggerId': aVal = (a.loggerId || '').toLowerCase(); bVal = (b.loggerId || '').toLowerCase(); break;
        case 'probes': aVal = (a.probe || '').toLowerCase(); bVal = (b.probe || '').toLowerCase(); break;
        case 'routeOrder': aVal = a.routeOrder || 999; bVal = b.routeOrder || 999; break;
        case 'plannedInstaller': aVal = (a.plannedInstaller || '').toLowerCase(); bVal = (b.plannedInstaller || '').toLowerCase(); break;
        case 'readyToInstall': aVal = a.readyToInstall ? 1 : 0; bVal = b.readyToInstall ? 1 : 0; break;
        case 'nrcsField': aVal = a.nrcsField ? 1 : 0; bVal = b.nrcsField ? 1 : 0; break;
        case 'probeStatus': aVal = (a.probeStatus || '').toLowerCase(); bVal = (b.probeStatus || '').toLowerCase(); break;
        case 'installDate': aVal = a.installDate || ''; bVal = b.installDate || ''; break;
        case 'installer': aVal = (a.installer || '').toLowerCase(); bVal = (b.installer || '').toLowerCase(); break;
        case 'approvalStatus': aVal = (a.approvalStatus || '').toLowerCase(); bVal = (b.approvalStatus || '').toLowerCase(); break;
        case 'removalDate': aVal = a.removalDate || ''; bVal = b.removalDate || ''; break;
        case 'removalNotes': aVal = (a.removalNotes || '').toLowerCase(); bVal = (b.removalNotes || '').toLowerCase(); break;
        case 'readyToRemove': aVal = (a.readyToRemove || '').toLowerCase(); bVal = (b.readyToRemove || '').toLowerCase(); break;
        case 'earlyRemoval': aVal = (a.earlyRemoval || '').toLowerCase(); bVal = (b.earlyRemoval || '').toLowerCase(); break;
        default: aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [seasonFields, searchQuery, currentOperation, currentIrrigationType, sortColumn, sortDirection]);

  const mapFields = useMemo(() => {
    return filteredFields.map((f) => ({
      id: f.id,
      name: f.name,
      operation: f.operation,
      operationId: f.operationId,
      acres: f.acres,
      crop: f.crop,
      probe: f.probe,
      status: (f.probeStatus || 'unassigned').toLowerCase().replace(' ', '-'),
      lat: f.lat,
      lng: f.lng,
    }));
  }, [filteredFields]);

  // Calculate approval stats for the Active Season tab
  const approvalStats = useMemo(() => {
    const pending = seasonFields.filter(f => !f.approvalStatus || f.approvalStatus === 'Pending');
    const approved = seasonFields.filter(f => f.approvalStatus === 'Approved');
    const rejected = seasonFields.filter(f => f.approvalStatus === 'Rejected');
    return {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      total: seasonFields.length,
    };
  }, [seasonFields]);

  // Get set of probe IDs that are currently assigned (for the selected season)
  const assignedProbeIds = useMemo(() => {
    const ids = new Set<number>();
    probeAssignments.forEach(pa => {
      if (pa.probeId) {
        ids.add(pa.probeId);
      }
    });
    return ids;
  }, [probeAssignments]);

  // All probes with assignment status
  const allProbesWithStatus = useMemo(() => {
    return [...localProbes]
      .map(p => ({
        ...p,
        isAssigned: assignedProbeIds.has(p.id),
      }))
      .sort((a, b) => {
        // Sort by owner billing entity first, then by serial number
        const opCompare = (a.ownerBillingEntity || '').localeCompare(b.ownerBillingEntity || '');
        if (opCompare !== 0) return opCompare;
        return (a.serialNumber || '').localeCompare(b.serialNumber || '');
      });
  }, [localProbes, assignedProbeIds]);

  // Filter probes for a specific field's operation: show probes owned by the same
  // operation + Acre Insights inventory probes, plus any probe already assigned to this field
  const getProbesForField = useCallback((fieldOperation: string, currentProbeId?: number | null) => {
    const COMPANY_NAME = 'Acre Insights';
    return allProbesWithStatus.filter(p => {
      // Always include the currently assigned probe so it stays visible
      if (currentProbeId && p.id === currentProbeId) return true;
      // Include probes owned by the same operation
      if (p.ownerOperationName && p.ownerOperationName === fieldOperation) return true;
      // Include Acre Insights company inventory
      if (p.ownerOperationName === COMPANY_NAME) return true;
      if (p.ownerBillingEntity === COMPANY_NAME) return true;
      // Include unassigned/no-owner probes (On Order with no operation set yet)
      if (!p.ownerOperationName && !p.ownerBillingEntity) return true;
      if (p.ownerBillingEntity === 'Unassigned') return true;
      return false;
    });
  }, [allProbesWithStatus]);

  // Legacy alias - sortedProbes now defaults to all probes (used only as fallback)
  const sortedProbes = allProbesWithStatus;

  // Inline save handler for seasonal data
  const handleInlineSave = useCallback(async (fieldSeasonId: number, field: string, value: unknown) => {
    const cellKey = `${fieldSeasonId}-${field}`;

    // Mark as saving
    setSavingFields(prev => new Set(prev).add(cellKey));

    try {
      // Map field names to API field names
      const apiFieldMap: Record<string, string> = {
        crop: 'crop',
        serviceType: 'service_type',
        routeOrder: 'route_order',
        plannedInstaller: 'planned_installer',
        readyToInstall: 'ready_to_install',
        approvalStatus: 'approval_status',
      };

      // Probe 1 changes go to probe_assignments, not field_seasons
      if (field === 'probeId') {
        const probeId = value ? parseInt(value as string, 10) : 0;
        const currentField = fields.find(f => f.fieldSeasonId === fieldSeasonId);
        const assignmentId = currentField?.probeAssignmentId;

        let response: Response;
        if (assignmentId) {
          response = await fetch(`/api/probe-assignments/${assignmentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              probe: probeId,
              probe_status: probeId ? 'Assigned' : 'Unassigned',
            }),
          });
        } else if (probeId) {
          response = await fetch('/api/probe-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              field_season: fieldSeasonId,
              probe_number: 1,
              probe: probeId,
            }),
          });
        } else {
          // No assignment exists and no probe selected - nothing to do
          setSavingFields(prev => { const n = new Set(prev); n.delete(cellKey); return n; });
          return;
        }

        if (response.ok) {
          const probe = probes.find(p => p.id === (value ? parseInt(value as string, 10) : 0));
          setFields(prev => prev.map(f => {
            if (f.fieldSeasonId === fieldSeasonId) {
              return {
                ...f,
                probeId: value ? parseInt(value as string, 10) : null,
                probe: probe ? `#${probe.serialNumber}` : null,
                probeStatus: value ? 'Assigned' : 'Unassigned',
              };
            }
            return f;
          }));
          setSavedFields(prev => new Set(prev).add(cellKey));
          setTimeout(() => setSavedFields(prev => { const n = new Set(prev); n.delete(cellKey); return n; }), 1500);
        }
        setSavingFields(prev => { const n = new Set(prev); n.delete(cellKey); return n; });
        return;
      }

      // Antenna/battery type changes go to probe_assignments (probe 1)
      if (field === 'antennaType' || field === 'batteryType') {
        const currentField = fields.find(f => f.fieldSeasonId === fieldSeasonId);
        const assignmentId = currentField?.probeAssignmentId;
        if (assignmentId) {
          const apiName = field === 'antennaType' ? 'antenna_type' : 'battery_type';
          const response = await fetch(`/api/probe-assignments/${assignmentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [apiName]: value || null }),
          });
          if (response.ok) {
            setFields(prev => prev.map(f => f.fieldSeasonId === fieldSeasonId ? { ...f, [field]: value } : f));
            setSavedFields(prev => new Set(prev).add(cellKey));
            setTimeout(() => setSavedFields(prev => { const n = new Set(prev); n.delete(cellKey); return n; }), 1500);
          }
        }
        setSavingFields(prev => { const n = new Set(prev); n.delete(cellKey); return n; });
        return;
      }

      const apiField = apiFieldMap[field] || field;
      const body: Record<string, unknown> = { [apiField]: value };

      const response = await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        // Update local state
        setFields(prev => prev.map(f => {
          if (f.fieldSeasonId === fieldSeasonId) {
            return { ...f, [field]: value };
          }
          return f;
        }));

        // Show saved indicator
        setSavedFields(prev => new Set(prev).add(cellKey));
        setTimeout(() => {
          setSavedFields(prev => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        }, 1500);
      } else {
        console.error('Failed to save:', await response.text());
      }
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setSavingFields(prev => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  }, [probes]);

  // Inline save handler for field-level data (not season-level)
  const handleInlineFieldSave = useCallback(async (fieldId: number, fieldName: string, value: unknown) => {
    const cellKey = `field-${fieldId}-${fieldName}`;
    setSavingFields(prev => new Set(prev).add(cellKey));
    try {
      const body: Record<string, unknown> = { [fieldName]: value };
      const response = await fetch(`/api/fields/${fieldId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setFields(prev => prev.map(f => {
          if (f.id !== fieldId) return f;
          const camelKey = fieldName === 'nrcs_field' ? 'nrcsField' : fieldName;
          return { ...f, [camelKey]: value };
        }));
        setSavedFields(prev => new Set(prev).add(cellKey));
        setTimeout(() => {
          setSavedFields(prev => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        }, 1500);
      }
    } catch (error) {
      console.error('Save field error:', error);
    } finally {
      setSavingFields(prev => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  }, []);

  // Delete a field season entry
  const handleDeleteFieldSeason = async (fieldSeasonId: number, fieldName: string, season: string) => {
    if (!confirm(`Delete the ${season} season entry for "${fieldName}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove from local state
        setFields(prev => prev.filter(f => f.fieldSeasonId !== fieldSeasonId));
      } else {
        alert('Failed to delete field season');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete field season');
    }
  };

  // Quick approve/reject handler
  const handleQuickApproval = async (field: ProcessedField, status: 'Approved' | 'Rejected') => {
    if (!field.fieldSeasonId) return;

    const cellKey = `${field.fieldSeasonId}-approvalStatus`;
    setSavingFields(prev => new Set(prev).add(cellKey));

    try {
      const response = await fetch(`/api/field-seasons/${field.fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_status: status,
          approval_date: new Date().toISOString().split('T')[0],
        }),
      });

      if (response.ok) {
        setFields(prev => prev.map(f => {
          if (f.fieldSeasonId === field.fieldSeasonId) {
            return { ...f, approvalStatus: status };
          }
          return f;
        }));

        setSavedFields(prev => new Set(prev).add(cellKey));
        setTimeout(() => {
          setSavedFields(prev => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        }, 1500);
      } else {
        alert('Failed to update approval status');
      }
    } catch (error) {
      console.error('Approval error:', error);
      alert('Failed to update approval status');
    } finally {
      setSavingFields(prev => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  const handleRowClick = (field: ProcessedField) => {
    setSelectedField(field);
    setEditForm({
      name: field.name,
      acres: field.acres,
      pivotAcres: field.pivotAcres,
      crop: field.crop,
      lat: field.lat,
      lng: field.lng,
      waterSource: field.waterSource,
      fuelSource: field.fuelSource,
      notes: field.notes,
      elevation: field.elevation,
      soilType: field.soilType,
      placementNotes: field.placementNotes,
      irrigationType: field.irrigationType,
      rowDirection: field.rowDirection,
      dripTubingDirection: field.dripTubingDirection,
      dripTubingSpacing: field.dripTubingSpacing,
      dripEmitterSpacing: field.dripEmitterSpacing,
      dripZones: field.dripZones,
      dripGpm: field.dripGpm,
      dripDepth: field.dripDepth,
    });
    setIsEditing(false);
    setShowProbeAssign(false);
    setShowSeasonFieldsEdit(false);
    setSelectedProbeId(field.probeId?.toString() || '');
    setSelectedProbe2Id(field.probe2Id?.toString() || '');
  };

  const handleClosePanel = () => {
    setSelectedField(null);
    setIsEditing(false);
    setEditForm({});
    setShowProbeAssign(false);
    setShowSeasonFieldsEdit(false);
    setSelectedProbeId('');
    setSelectedProbe2Id('');
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!selectedField) return;
    setSaving(true);
    try {
      // Round lat/lng to 6 decimal places (Baserow limit)
      const lat = editForm.lat ? Math.round(Number(editForm.lat) * 1000000) / 1000000 : null;
      const lng = editForm.lng ? Math.round(Number(editForm.lng) * 1000000) / 1000000 : null;

      const response = await fetch(`/api/fields/${selectedField.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          acres: editForm.acres,
          pivot_acres: editForm.pivotAcres,
          lat,
          lng,
          water_source: editForm.waterSource || null,
          fuel_source: editForm.fuelSource || null,
          notes: editForm.notes || null,
          elevation: editForm.elevation || null,
          soil_type: editForm.soilType || null,
          placement_notes: editForm.placementNotes || null,
          irrigation_type: editForm.irrigationType || null,
          row_direction: editForm.rowDirection || null,
          drip_tubing_direction: editForm.dripTubingDirection || null,
          drip_tubing_spacing: editForm.dripTubingSpacing || null,
          drip_emitter_spacing: editForm.dripEmitterSpacing || null,
          drip_zones: editForm.dripZones || null,
          drip_gpm: editForm.dripGpm || null,
          drip_depth: editForm.dripDepth || null,
        }),
      });
      if (response.ok) {
        // Update local state instead of reloading to preserve current tab
        const updatedField: ProcessedField = {
          ...selectedField,
          name: editForm.name || selectedField.name,
          acres: editForm.acres ?? selectedField.acres,
          pivotAcres: editForm.pivotAcres,
          lat: lat ?? selectedField.lat,
          lng: lng ?? selectedField.lng,
          waterSource: editForm.waterSource,
          fuelSource: editForm.fuelSource,
          notes: editForm.notes,
          elevation: editForm.elevation,
          soilType: editForm.soilType,
          placementNotes: editForm.placementNotes,
          irrigationType: editForm.irrigationType,
          rowDirection: editForm.rowDirection,
          dripTubingDirection: editForm.dripTubingDirection,
          dripTubingSpacing: editForm.dripTubingSpacing,
          dripEmitterSpacing: editForm.dripEmitterSpacing,
          dripZones: editForm.dripZones,
          dripGpm: editForm.dripGpm,
          dripDepth: editForm.dripDepth,
        };

        // Update fields array
        setFields(prev => prev.map(f =>
          f.id === selectedField.id && f.fieldSeasonId === selectedField.fieldSeasonId
            ? updatedField
            : f
        ));

        // Update selected field and close edit mode
        setSelectedField(updatedField);
        setIsEditing(false);
      } else {
        alert('Failed to save changes');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedField) {
      setEditForm({
        name: selectedField.name,
        acres: selectedField.acres,
        pivotAcres: selectedField.pivotAcres,
        crop: selectedField.crop,
        lat: selectedField.lat,
        lng: selectedField.lng,
        waterSource: selectedField.waterSource,
        fuelSource: selectedField.fuelSource,
        notes: selectedField.notes,
        elevation: selectedField.elevation,
        soilType: selectedField.soilType,
        placementNotes: selectedField.placementNotes,
        irrigationType: selectedField.irrigationType,
        rowDirection: selectedField.rowDirection,
        dripTubingDirection: selectedField.dripTubingDirection,
        dripTubingSpacing: selectedField.dripTubingSpacing,
        dripEmitterSpacing: selectedField.dripEmitterSpacing,
        dripZones: selectedField.dripZones,
        dripGpm: selectedField.dripGpm,
        dripDepth: selectedField.dripDepth,
      });
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!selectedField) return;
    if (!confirm(`Delete field "${selectedField.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`/api/fields/${selectedField.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        window.location.reload();
      } else {
        alert('Failed to delete field');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete field');
    }
  };

  const handleAssignProbe = async () => {
    if (!selectedField || !selectedField.fieldSeasonId) {
      alert('Cannot assign probe: No field season found');
      return;
    }
    setSavingProbe(true);
    try {
      const probeId = selectedProbeId ? parseInt(selectedProbeId, 10) : 0;
      let response: Response;
      if (selectedField.probeAssignmentId) {
        // Update existing probe_assignment
        response = await fetch(`/api/probe-assignments/${selectedField.probeAssignmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            probe: probeId,
            probe_status: probeId ? 'Assigned' : 'Unassigned',
          }),
        });
      } else if (probeId) {
        // Create new probe_assignment with probe_number=1
        response = await fetch('/api/probe-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field_season: selectedField.fieldSeasonId,
            probe_number: 1,
            probe: probeId,
          }),
        });
      } else {
        // No assignment and no probe - nothing to do
        setShowProbeAssign(false);
        setSavingProbe(false);
        return;
      }
      if (response.ok) {
        setShowProbeAssign(false);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to assign probe');
      }
    } catch (error) {
      console.error('Assign probe error:', error);
      alert('Failed to assign probe');
    } finally {
      setSavingProbe(false);
    }
  };

  // Handle removal logging
  const handleLogRemoval = async () => {
    if (!selectedField?.fieldSeasonId) return;
    if (!removalForm.removal_date) {
      alert('Removal date is required');
      return;
    }
    setSavingRemoval(true);
    try {
      // Update field season with removal date and notes
      const response = await fetch(`/api/field-seasons/${selectedField.fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          removal_date: removalForm.removal_date,
          removal_notes: removalForm.removal_notes || null,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Failed to log removal');
        return;
      }

      // If checkbox is checked and there's a probe, append to probe notes
      if (removalForm.log_to_probe && removalForm.removal_notes && selectedField.probeId) {
        // First get the current probe to get existing notes
        const probeResponse = await fetch(`/api/probes/${selectedField.probeId}`);
        if (probeResponse.ok) {
          const probeData = await probeResponse.json();
          const existingNotes = probeData.notes || '';
          const timestamp = removalForm.removal_date;
          const newNote = `[${timestamp}] ${removalForm.removal_notes}`;
          const updatedNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;

          await fetch(`/api/probes/${selectedField.probeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: updatedNotes }),
          });
        }
      }

      setShowRemovalModal(false);
      setRemovalForm({ removal_date: '', removal_notes: '', log_to_probe: false });
      window.location.reload();
    } catch (error) {
      console.error('Log removal error:', error);
      alert('Failed to log removal');
    } finally {
      setSavingRemoval(false);
    }
  };

  // Quick start season for a field (no modal)
  const handleQuickStartSeason = async (fieldId: number, season: string) => {
    try {
      const response = await fetch('/api/field-seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: fieldId,
          season: season,
        }),
      });
      if (response.ok) {
        const newFieldSeason = await response.json();
        // Update local state - find the field and add a new entry with the season
        const existingField = fields.find(f => f.id === fieldId);
        if (existingField) {
          const newSeasonField: ProcessedField = {
            ...existingField,
            fieldSeasonId: newFieldSeason.id,
            season: season,
            crop: 'Unknown',
            serviceType: '',
            antennaType: '',
            batteryType: '',
            sideDress: '',
            loggerId: '',
            earlyRemoval: '',
            hybridVariety: '',
            readyToRemove: '',
            plantingDate: '',
            probe: null,
            probeId: null,
            probeStatus: 'Unassigned',
            probe2: null,
            probe2Id: null,
            probe2Status: 'Unassigned',
            routeOrder: undefined,
            plannedInstaller: '',
            readyToInstall: false,
          };
          setFields(prev => [...prev, newSeasonField]);
        }
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to start season');
      }
    } catch (error) {
      console.error('Quick start season error:', error);
      alert('Failed to start season');
    }
  };

  // Delete a field_season
  const handleDeleteSeason = async (fieldSeasonId: number, season: string) => {
    if (!confirm(`Delete ${season} season? This will also remove any probe assignments for this season.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to delete season');
      }
    } catch (error) {
      console.error('Delete season error:', error);
      alert('Failed to delete season');
    }
  };

  const handleRollover = async () => {
    if (rolloverStats.canRollover === 0) {
      alert('No fields to roll over');
      return;
    }

    if (!confirm(`This will create ${rolloverStats.canRollover} new field season entries for ${rolloverForm.toSeason}. Continue?`)) {
      return;
    }

    setRollingOver(true);
    try {
      // Season-level data only (no probe/antenna/battery - those go to probe_assignments)
      const items = rolloverStats.fieldsToRollover.map((f) => ({
        field: f.id,
        season: rolloverForm.toSeason,
        service_type: f.serviceType || undefined,
        source_field_season_id: f.fieldSeasonId,
      }));

      const response = await fetch('/api/field-seasons/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        const result = await response.json();

        // Copy ALL probe_assignments (probe 1, 2, etc.) for each new field_season
        if (result.results && result.results.length > 0) {
          const probeAssignmentsToCopy: {
            field_season: number;
            probe_number: number;
            placement_lat?: number;
            placement_lng?: number;
            elevation?: number | string;
            soil_type?: string;
            placement_notes?: string;
          }[] = [];

          for (const createdFs of result.results) {
            if (createdFs.source_field_season_id) {
              const sourceProbeAssignments = probeAssignments.filter(
                pa => pa.fieldSeasonId === createdFs.source_field_season_id
              );

              for (const sourcePa of sourceProbeAssignments) {
                probeAssignmentsToCopy.push({
                  field_season: createdFs.id,
                  probe_number: sourcePa.probeNumber,
                  placement_lat: sourcePa.placementLat,
                  placement_lng: sourcePa.placementLng,
                  elevation: sourcePa.elevation,
                  soil_type: sourcePa.soilType,
                  placement_notes: sourcePa.placementNotes,
                });
              }
            }
          }

          if (probeAssignmentsToCopy.length > 0) {
            await fetch('/api/probe-assignments/bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: probeAssignmentsToCopy }),
            });
          }
        }

        alert(`Successfully created ${result.created} field seasons for ${rolloverForm.toSeason}!`);
        setShowRolloverModal(false);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to roll over fields');
      }
    } catch (error) {
      console.error('Rollover error:', error);
      alert('Failed to roll over fields');
    } finally {
      setRollingOver(false);
    }
  };

  // Handle batch enroll
  const handleBatchEnroll = async () => {
    if (selectedBatchFieldIds.size === 0) {
      alert('Please select at least one field');
      return;
    }

    if (!confirm(`This will enroll ${selectedBatchFieldIds.size} field(s) in ${batchSeason}. Continue?`)) {
      return;
    }

    setBatchSaving(true);
    try {
      const items = Array.from(selectedBatchFieldIds).map((fieldId) => ({
        field: fieldId,
        season: batchSeason,
        service_type: batchServiceType || undefined,
      }));

      const response = await fetch('/api/field-seasons/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        setShowBatchModal(false);
        setSelectedBatchFieldIds(new Set());
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to enroll fields');
      }
    } catch (error) {
      console.error('Batch enroll error:', error);
      alert('Failed to enroll fields');
    } finally {
      setBatchSaving(false);
    }
  };

  // Handle batch unenroll
  const handleBatchUnenroll = async () => {
    if (selectedBatchFieldIds.size === 0) {
      alert('Please select at least one field');
      return;
    }

    if (!confirm(`This will remove ${selectedBatchFieldIds.size} field(s) from ${batchSeason}. This will also delete any probe assignments and billing line items for these fields. Continue?`)) {
      return;
    }

    setBatchSaving(true);
    try {
      // Get the fieldSeasonIds for the selected fields
      const fieldSeasonIdsToDelete = batchFieldsList
        .filter((f) => selectedBatchFieldIds.has(f.id) && f.fieldSeasonId)
        .map((f) => f.fieldSeasonId!);

      // First, fetch and delete all invoice_lines for these field_seasons
      const invoiceLinesResponse = await fetch('/api/invoice-lines');
      if (invoiceLinesResponse.ok) {
        const allInvoiceLines = await invoiceLinesResponse.json();
        const invoiceLineIdsToDelete = allInvoiceLines
          .filter((il: { field_season?: { id: number }[] }) =>
            il.field_season?.[0]?.id && fieldSeasonIdsToDelete.includes(il.field_season[0].id)
          )
          .map((il: { id: number }) => il.id);

        if (invoiceLineIdsToDelete.length > 0) {
          const ilDeletePromises = invoiceLineIdsToDelete.map((ilId: number) =>
            fetch(`/api/invoice-lines/${ilId}`, { method: 'DELETE' })
          );
          await Promise.all(ilDeletePromises);
        }
      }

      // Next, delete all probe_assignments for these field_seasons
      const probeAssignmentIdsToDelete = probeAssignments
        .filter((pa) => fieldSeasonIdsToDelete.includes(pa.fieldSeasonId))
        .map((pa) => pa.id);

      if (probeAssignmentIdsToDelete.length > 0) {
        const paDeletePromises = probeAssignmentIdsToDelete.map((paId) =>
          fetch(`/api/probe-assignments/${paId}`, { method: 'DELETE' })
        );
        await Promise.all(paDeletePromises);
      }

      // Now delete each field_season
      const deletePromises = fieldSeasonIdsToDelete.map((fsId) =>
        fetch(`/api/field-seasons/${fsId}`, { method: 'DELETE' })
      );

      const results = await Promise.all(deletePromises);
      const failures = results.filter((r) => !r.ok);

      if (failures.length > 0) {
        alert(`${failures.length} field(s) failed to unenroll. They may have linked repairs.`);
      }

      setShowBatchModal(false);
      setSelectedBatchFieldIds(new Set());
      window.location.reload();
    } catch (error) {
      console.error('Batch unenroll error:', error);
      alert('Failed to unenroll fields');
    } finally {
      setBatchSaving(false);
    }
  };

  // Toggle expand/collapse for a field_season row
  const toggleFieldSeasonExpand = (fieldSeasonId: number) => {
    setExpandedFieldSeasons(prev => {
      const next = new Set(prev);
      if (next.has(fieldSeasonId)) {
        next.delete(fieldSeasonId);
      } else {
        next.add(fieldSeasonId);
      }
      return next;
    });
  };

  // Get probe assignments for a specific field_season
  const getProbeAssignmentsForFieldSeason = useCallback((fieldSeasonId: number) => {
    return probeAssignments
      .filter(pa => pa.fieldSeasonId === fieldSeasonId)
      .sort((a, b) => a.probeNumber - b.probeNumber);
  }, [probeAssignments]);

  // Handle inline save for probe assignment
  const handleProbeAssignmentSave = useCallback(async (probeAssignmentId: number, field: string, value: unknown) => {
    const cellKey = `pa-${probeAssignmentId}-${field}`;
    setSavingFields(prev => new Set(prev).add(cellKey));

    try {
      const apiFieldMap: Record<string, string> = {
        probeId: 'probe',
        probeStatus: 'probe_status',
        antennaType: 'antenna_type',
        batteryType: 'battery_type',
        placementLat: 'placement_lat',
        placementLng: 'placement_lng',
        elevation: 'elevation',
        soilType: 'soil_type',
        placementNotes: 'placement_notes',
        installDate: 'install_date',
        installLat: 'install_lat',
        installLng: 'install_lng',
        installNotes: 'install_notes',
        cropxTelemetryId: 'cropx_telemetry_id',
        signalStrength: 'signal_strength',
        approvalStatus: 'approval_status',
        approvalNotes: 'approval_notes',
      };

      const apiField = apiFieldMap[field] || field;
      const body: Record<string, unknown> = {};

      // Handle probe assignment specially - use 0 to explicitly clear (null is ignored by API)
      if (field === 'probeId') {
        body.probe = value ? parseInt(value as string, 10) : 0;
        body.probe_status = value ? 'Assigned' : 'Unassigned';
      } else {
        body[apiField] = value;
      }

      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setProbeAssignments(prev => prev.map(pa => {
          if (pa.id === probeAssignmentId) {
            const updated = { ...pa };
            if (field === 'probeId') {
              const probe = probes.find(p => p.id === parseInt(value as string, 10));
              updated.probeId = value ? parseInt(value as string, 10) : null;
              updated.probe = probe ? `#${probe.serialNumber}` : null;
              updated.probeStatus = value ? 'Assigned' : 'Unassigned';
            } else {
              (updated as Record<string, unknown>)[field] = value;
            }
            return updated;
          }
          return pa;
        }));

        setSavedFields(prev => new Set(prev).add(cellKey));
        setTimeout(() => {
          setSavedFields(prev => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        }, 1500);
      } else {
        console.error('Failed to save probe assignment:', await response.text());
      }
    } catch (error) {
      console.error('Save probe assignment error:', error);
    } finally {
      setSavingFields(prev => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  }, [probes]);

  const handleProbeCreated = useCallback(async (newProbeId: number, newProbeOption: ProbeOption) => {
    setLocalProbes(prev => [...prev, newProbeOption]);
    // If triggered from an inline probe assignment dropdown, auto-save to that assignment
    if (createProbeAssignmentId) {
      await handleProbeAssignmentSave(createProbeAssignmentId, 'probeId', newProbeId.toString());
      setCreateProbeAssignmentId(null);
    } else {
      // Edit Season modal flow: just select it in the dropdown
      if (createProbeTarget === 'probe1') {
        setSelectedProbeId(newProbeId.toString());
      } else {
        setSelectedProbe2Id(newProbeId.toString());
      }
    }
  }, [createProbeAssignmentId, createProbeTarget, handleProbeAssignmentSave]);

  // Save probe assignment location (all location fields in single call)
  const handleProbeAssignmentLocationSave = useCallback(async (
    probeAssignmentId: number,
    lat: number,
    lng: number,
    elevation?: number | null,
    soilType?: string | null
  ) => {
    const cellKey = `pa-${probeAssignmentId}-location`;
    setSavingFields(prev => new Set(prev).add(cellKey));

    try {
      // Round coordinates to 6 decimal places (Baserow field limit)
      const body: Record<string, unknown> = {
        placement_lat: Math.round(lat * 1000000) / 1000000,
        placement_lng: Math.round(lng * 1000000) / 1000000,
      };

      if (elevation !== undefined && elevation !== null) {
        body.elevation = elevation;
      }
      if (soilType) {
        body.soil_type = soilType;
      }

      console.log('Saving probe assignment location:', probeAssignmentId, body);

      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setProbeAssignments(prev => prev.map(pa => {
          if (pa.id === probeAssignmentId) {
            return {
              ...pa,
              placementLat: lat,
              placementLng: lng,
              elevation: elevation ?? pa.elevation,
              soilType: soilType ?? pa.soilType,
            };
          }
          return pa;
        }));

        setSavedFields(prev => new Set(prev).add(cellKey));
        setTimeout(() => {
          setSavedFields(prev => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        }, 1500);
      } else {
        const errorText = await response.text();
        console.error('Failed to save probe assignment location:', errorText);
        alert('Failed to save location. See console for details.');
      }
    } catch (error) {
      console.error('Save probe assignment location error:', error);
      alert('Failed to save location. See console for details.');
    } finally {
      setSavingFields(prev => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  }, []);

  // Add new probe assignment with defaults from field
  const handleAddProbeAssignment = async (fieldSeasonId: number, probeNumber: number) => {
    console.log('Adding probe assignment:', { fieldSeasonId, probeNumber });
    setSavingProbeAssignment(true);
    try {
      const response = await fetch('/api/probe-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_season: fieldSeasonId,
          probe_number: probeNumber,
        }),
      });

      if (response.ok) {
        const created = await response.json();
        console.log('Created probe assignment:', created);
        // Process the created probe assignment
        const probeLink = created.probe?.[0];
        const probeData = probeLink ? probes.find(p => p.id === probeLink.id) : null;

        const newProbeAssignment: ProcessedProbeAssignment = {
          id: created.id,
          fieldSeasonId: fieldSeasonId,
          probeNumber: created.probe_number ?? probeNumber,
          probe: probeData ? `#${probeData.serialNumber}` : null,
          probeId: probeLink?.id || null,
          probeStatus: created.probe_status?.value || 'Unassigned',
          placementLat: created.placement_lat,
          placementLng: created.placement_lng,
          elevation: created.elevation,
          soilType: created.soil_type,
          placementNotes: created.placement_notes,
          approvalStatus: created.approval_status?.value || 'Pending',
          approvalNotes: created.approval_notes,
          approvalDate: created.approval_date,
        };

        setProbeAssignments(prev => [...prev, newProbeAssignment]);
        setAddingProbeForFieldSeason(null);
        // Make sure the row is expanded
        setExpandedFieldSeasons(prev => new Set(prev).add(fieldSeasonId));
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create probe assignment');
      }
    } catch (error) {
      console.error('Add probe assignment error:', error);
      alert('Failed to create probe assignment');
    } finally {
      setSavingProbeAssignment(false);
    }
  };

  // Delete probe assignment
  const handleDeleteProbeAssignment = async (probeAssignmentId: number) => {
    if (!confirm('Delete this probe assignment? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/probe-assignments/${probeAssignmentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setProbeAssignments(prev => prev.filter(pa => pa.id !== probeAssignmentId));
      } else {
        alert('Failed to delete probe assignment');
      }
    } catch (error) {
      console.error('Delete probe assignment error:', error);
      alert('Failed to delete probe assignment');
    }
  };

  const getStatusBadge = (status: string | undefined | null) => {
    const safeStatus = status || 'Unassigned';
    const normalized = safeStatus.toLowerCase().replace(/\s+/g, '-');
    const statusMap: Record<string, { class: string; label: string }> = {
      unassigned: { class: 'needs-probe', label: 'Unassigned' },
      assigned: { class: 'pending', label: 'Assigned' },
      'ready-to-install': { class: 'pending', label: 'Ready to Install' },
      installed: { class: 'installed', label: 'Installed' },
      'in-season-repair-requested': { class: 'repair', label: 'In Season Repair' },
      'ready-to-remove': { class: 'pending', label: 'Ready to Remove' },
      removed: { class: 'needs-probe', label: 'Removed' },
      'off-season-repair-requested': { class: 'repair', label: 'Off Season Repair' },
      rma: { class: 'repair', label: 'RMA' },
    };
    const config = statusMap[normalized] || { class: 'needs-probe', label: safeStatus };
    return (
      <span className={`status-badge ${config.class}`}>
        <span className="status-dot"></span>
        {config.label}
      </span>
    );
  };

  const getCropBadge = (crop: string | undefined | null) => {
    const safeCrop = crop || 'Unknown';
    const cropLower = safeCrop.toLowerCase();
    let cropClass = 'other';
    if (cropLower === 'corn' || cropLower === 'seed corn') cropClass = 'corn';
    else if (cropLower === 'soybeans') cropClass = 'soybeans';
    else if (cropLower === 'wheat') cropClass = 'wheat';
    return <span className={`crop-badge ${cropClass}`}>{safeCrop}</span>;
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Fields</h2>
          <select
            value={currentSeason}
            onChange={(e) => {
              if (e.target.value === '__add_year__') {
                const year = prompt('Enter year (e.g., 2028):');
                if (year && /^\d{4}$/.test(year.trim())) {
                  const newYear = year.trim();
                  if (!allSeasons.includes(newYear)) {
                    setCustomYears(prev => [...prev, newYear]);
                  }
                  setCurrentSeason(newYear);
                }
              } else {
                setCurrentSeason(e.target.value);
              }
            }}
            className="season-selector"
            style={{
              background: 'var(--accent-green-dim)',
              color: 'var(--accent-green)',
              border: 'none',
              padding: '4px 12px',
              borderRadius: '16px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Seasons</option>
            {allSeasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="__add_year__">+ Add Year...</option>
          </select>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '8px' }}>
          {/* Column Picker */}
          <div ref={columnPickerRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                title="Select columns to display"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Columns
              </button>
              {showColumnPicker && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 100,
                    minWidth: '180px',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    padding: '8px 0',
                  }}
                >
                  <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Show Columns</span>
                  </div>
                  {ALL_COLUMN_DEFINITIONS.map((col) => (
                    <label
                      key={col.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        cursor: col.alwaysVisible ? 'not-allowed' : 'pointer',
                        opacity: col.alwaysVisible ? 0.6 : 1,
                        fontSize: '13px',
                      }}
                      onClick={(e) => {
                        if (!col.alwaysVisible) {
                          e.preventDefault();
                          toggleColumn(col.key);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isColumnVisible(col.key)}
                        disabled={col.alwaysVisible}
                        onChange={() => {}}
                        style={{ cursor: col.alwaysVisible ? 'not-allowed' : 'pointer' }}
                      />
                      {col.label}
                      {col.alwaysVisible && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(required)</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          <button className="btn btn-secondary" onClick={() => setShowRolloverModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Copy to New Season
          </button>
          <button className="btn btn-secondary" onClick={() => { setShowBatchModal(true); setSelectedBatchFieldIds(new Set()); }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Batch Enroll
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Field
          </button>
        </div>
      </header>

      <div className="content">
        {/* Tab Navigation */}
        <div className="fields-filter-row">
          {/* Desktop: Tab buttons */}
          <div className="fields-tabs fields-tabs-desktop">
            {TAB_INFO.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setCurrentTab(tab.key)}
                className={currentTab === tab.key ? 'active' : ''}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Mobile: Dropdown */}
          <select
            className="fields-tabs-mobile"
            value={currentTab}
            onChange={(e) => setCurrentTab(e.target.value as TabView)}
          >
            {TAB_INFO.map((tab) => (
              <option key={tab.key} value={tab.key}>{tab.label}</option>
            ))}
          </select>
        </div>

        {/* Approval Summary - Active Season Tab */}
        {currentTab === 'activeSeason' && approvalStats.total > 0 && (
          <div style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginRight: '8px' }}>Approval Status:</span>
            <div style={{ display: 'flex', gap: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--accent-yellow, #eab308)',
                }}></span>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Pending: </span>
                <strong>{approvalStats.pending}</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--accent-green)',
                }}></span>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Approved: </span>
                <strong style={{ color: 'var(--accent-green)' }}>{approvalStats.approved}</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--accent-red, #ef4444)',
                }}></span>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Rejected: </span>
                <strong style={{ color: 'var(--accent-red, #ef4444)' }}>{approvalStats.rejected}</strong>
              </span>
            </div>
            {approvalStats.pending > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
                Use the checkmark/X buttons in each row to quickly approve or reject fields
              </span>
            )}
          </div>
        )}

        <div className={`fields-container ${mapVisible ? 'map-visible' : ''}`}>
          <div className="fields-list">
            <div className="table-container">
              <div className="table-header">
                <h3 className="table-title">Fields — {currentSeason === 'all' ? 'All Seasons' : `${currentSeason} Season`}</h3>
                <div className="table-actions">
                  <div className="search-box" style={{ width: '200px' }}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search fields..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <select value={currentOperation} onChange={(e) => setCurrentOperation(e.target.value)}>
                    <option value="all">All Operations</option>
                    {operations.slice().sort((a, b) => a.name.localeCompare(b.name)).map((op) => (
                      <option key={op.id} value={op.id.toString()}>{op.name}</option>
                    ))}
                  </select>
                  <select value={currentIrrigationType} onChange={(e) => setCurrentIrrigationType(e.target.value)}>
                    <option value="all">All Irrigation</option>
                    <option value="Drip">Drip</option>
                    <option value="Dryland">Dryland</option>
                    <option value="Gravity">Gravity</option>
                    <option value="Pivot">Pivot</option>
                    <option value="Pivot - Corner System">Pivot - Corner System</option>
                    <option value="Pivot - Wiper">Pivot - Wiper</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                  <button className={`map-toggle ${mapVisible ? 'active' : ''}`} onClick={() => setMapVisible(!mapVisible)}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Map View
                  </button>
                  {mapVisible && (
                    <select
                      value={colorBy}
                      onChange={(e) => setColorBy(e.target.value as 'none' | 'crop' | 'status' | 'operation')}
                      className="color-by-select"
                    >
                      <option value="none">Color by...</option>
                      <option value="crop">Crop</option>
                      <option value="status">Status</option>
                      <option value="operation">Operation</option>
                    </select>
                  )}
                </div>
              </div>
              {/* Data View - Inline Editable */}
              <div style={{ overflowX: 'auto' }}>
                    <table className="desktop-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {visibleColumns.map((colKey) => {
                            const colDef = ALL_COLUMN_DEFINITIONS.find((c) => c.key === colKey);
                            if (!colDef) return null;
                            const isSorted = sortColumn === colKey;
                            return (
                              <th
                                key={colKey}
                                className="sortable"
                                style={{ minWidth: COLUMN_MIN_WIDTHS[colKey] || '80px', cursor: 'pointer' }}
                                onClick={() => handleSort(colKey)}
                              >
                                {colDef.label}
                                {isSorted && (
                                  <span className="sort-indicator">
                                    {sortDirection === 'asc' ? ' ▲' : ' ▼'}
                                  </span>
                                )}
                              </th>
                            );
                          })}
                          <th style={{ minWidth: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFields.length === 0 ? (
                          <tr>
                            <td colSpan={visibleColumns.length + 1}>
                              <EmptyState
                                icon={searchQuery ? 'search' : currentSeason !== 'all' ? 'calendar' : 'fields'}
                                title={searchQuery ? 'No matching fields' : currentSeason !== 'all' ? `No fields for ${currentSeason}` : 'No fields yet'}
                                description={searchQuery ? 'Try a different search term' : currentSeason !== 'all' ? 'Use "Copy to New Season" to set up fields for this year' : 'Add your first field to get started'}
                                action={!searchQuery && currentSeason === 'all' ? { label: 'Add Field', onClick: () => setShowAddModal(true) } : undefined}
                              />
                            </td>
                          </tr>
                        ) : (
                          filteredFields.map((field) => {
                            const fieldSeasonProbeAssignments = field.fieldSeasonId ? getProbeAssignmentsForFieldSeason(field.fieldSeasonId) : [];
                            const isExpanded = field.fieldSeasonId ? expandedFieldSeasons.has(field.fieldSeasonId) : false;
                            const hasProbeAssignments = fieldSeasonProbeAssignments.length > 0;
                            const needsSeasonStart = !field.fieldSeasonId && currentSeason !== 'all';

                            const renderCell = (colKey: FieldColumnKey) => (
                              <FieldCell
                                key={colKey}
                                colKey={colKey}
                                field={field}
                                hasProbeAssignments={hasProbeAssignments}
                                probeAssignmentCount={fieldSeasonProbeAssignments.length}
                                hasDuplicateProbeLocation={fieldSeasonProbeAssignments.length >= 2 && fieldSeasonProbeAssignments.some((pa, i) =>
                                  pa.placementLat && pa.placementLng && fieldSeasonProbeAssignments.some((other, j) =>
                                    i !== j && other.placementLat && other.placementLng
                                    && Number(other.placementLat).toFixed(6) === Number(pa.placementLat).toFixed(6)
                                    && Number(other.placementLng).toFixed(6) === Number(pa.placementLng).toFixed(6)
                                  )
                                )}
                                isExpanded={isExpanded}
                                serviceTypeOptions={serviceTypeOptions}
                                savingFields={savingFields}
                                savedFields={savedFields}
                                onRowClick={handleRowClick}
                                onInlineSave={handleInlineSave}
                                onInlineFieldSave={handleInlineFieldSave}
                                onToggleExpand={toggleFieldSeasonExpand}
                              />
                            );

                            return (
                              <React.Fragment key={`${field.id}-${field.fieldSeasonId || 'no-season'}`}>
                                <tr>
                                  {needsSeasonStart ? (
                                    <>
                                      {visibleColumns.includes('field') && (
                                        <td style={{ fontWeight: 500, cursor: 'pointer' }} title="Click to view details" onClick={() => handleRowClick(field)}>
                                          {field.name}
                                        </td>
                                      )}
                                      <td colSpan={visibleColumns.length - (visibleColumns.includes('field') ? 1 : 0)} style={{ textAlign: 'left' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No {currentSeason} season configured</span>
                                          <button onClick={(e) => { e.stopPropagation(); handleQuickStartSeason(field.id, currentSeason); }}
                                            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '4px', border: 'none', background: 'var(--accent-green)', color: 'white', cursor: 'pointer' }}>
                                            Start {currentSeason} Season
                                          </button>
                                        </div>
                                      </td>
                                      <td></td>
                                    </>
                                  ) : (
                                    <>
                                      {visibleColumns.map((colKey) => renderCell(colKey))}
                                      <td onClick={(e) => e.stopPropagation()}>
                                        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                          <button className="action-btn" title="View details" onClick={() => handleRowClick(field)}>
                                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                          </button>
                                          {currentTab === 'activeSeason' && field.fieldSeasonId && field.approvalStatus !== 'Approved' && (
                                            <button
                                              className="action-btn"
                                              title="Approve"
                                              onClick={() => handleQuickApproval(field, 'Approved')}
                                              style={{ color: 'var(--accent-green)' }}
                                            >
                                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                              </svg>
                                            </button>
                                          )}
                                          {currentTab === 'activeSeason' && field.fieldSeasonId && field.approvalStatus !== 'Rejected' && (
                                            <button
                                              className="action-btn"
                                              title="Reject"
                                              onClick={() => handleQuickApproval(field, 'Rejected')}
                                              style={{ color: 'var(--accent-red, #ef4444)' }}
                                            >
                                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                            </button>
                                          )}
                                          {field.fieldSeasonId && (
                                            <button className="action-btn" title="Delete season entry" onClick={() => handleDeleteFieldSeason(field.fieldSeasonId!, field.name, field.season)} style={{ color: 'var(--text-muted)' }}>
                                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </>
                                  )}
                                </tr>
                                {/* Expanded probe assignment sub-rows */}
                                {isExpanded && field.fieldSeasonId && (
                                  <tr>
                                    <td colSpan={visibleColumns.length + 1} style={{ padding: 0 }}>
                                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                        <thead>
                                          <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                            <th style={{ paddingLeft: '32px', width: '80px' }}></th>
                                            <th style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '2px', paddingTop: '6px', textAlign: 'left', width: '140px' }}>Location</th>
                                            <th style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '2px', paddingTop: '6px', textAlign: 'left', width: '200px' }}>Probe</th>
                                            <th style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '2px', paddingTop: '6px', textAlign: 'left', width: '120px' }}>Status</th>
                                            <th style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '2px', paddingTop: '6px', textAlign: 'left', width: '140px' }}>Antenna</th>
                                            <th style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '2px', paddingTop: '6px', textAlign: 'left', width: '130px' }}>Battery</th>
                                            <th style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '2px', paddingTop: '6px', textAlign: 'left', width: '100px' }}>Notes</th>
                                            <th style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '2px', paddingTop: '6px', textAlign: 'left', width: '100px' }}>Approval</th>
                                            <th style={{ width: '36px' }}></th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                    {fieldSeasonProbeAssignments.map((pa) => {
                                      const hasDuplicateLocation = pa.placementLat && pa.placementLng && fieldSeasonProbeAssignments.some(
                                        (other) => other.id !== pa.id && other.placementLat && other.placementLng
                                          && Number(other.placementLat).toFixed(6) === Number(pa.placementLat).toFixed(6)
                                          && Number(other.placementLng).toFixed(6) === Number(pa.placementLng).toFixed(6)
                                      );
                                      return (
                                      <tr key={`pa-${pa.id}`} style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                        <td style={{ paddingLeft: '32px' }}>
                                          <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>
                                            Probe {pa.probeNumber}
                                          </span>
                                        </td>
                                        <td
                                          style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingProbeAssignmentLocation(pa);
                                            setLocationPickerTarget('probeAssignment');
                                            setShowLocationPicker(true);
                                          }}
                                          title="Click to edit location"
                                        >
                                          {pa.placementLat && pa.placementLng ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                              {hasDuplicateLocation && (
                                                <span title="Same location as another probe" style={{ color: '#f59e0b', fontSize: '14px', lineHeight: 1 }}>&#9888;</span>
                                              )}
                                              {Number(pa.placementLat).toFixed(4)}, {Number(pa.placementLng).toFixed(4)}
                                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12" style={{ opacity: 0.6 }}>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                              </svg>
                                            </span>
                                          ) : (
                                            <span style={{ color: 'var(--accent-blue)' }}>Set location</span>
                                          )}
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                          <InlineProbeCell
                                            probeAssignmentId={pa.id}
                                            field="probeId"
                                            value={pa.probeId?.toString() || ''}
                                            type="select"
                                            options={[
                                              ...getProbesForField(field.operation, pa.probeId).map(p => ({
                                                value: p.id.toString(),
                                                label: `${p.serialNumber ? `#${p.serialNumber}` : `(On Order #${p.id})`} (${p.isAssigned && p.id !== pa.probeId ? 'Assigned' : p.ownerBillingEntity})`,
                                              })),
                                              { value: '__create_new__', label: '+ Add New Probe' },
                                            ]}
                                            onSave={handleProbeAssignmentSave}
                                            onAction={(action) => {
                                              if (action === '__create_new__') {
                                                setCreateProbeTarget('probe1');
                                                setCreateProbeAssignmentId(pa.id);
                                                setCreateProbeOperationName(field.operation);
                                                setShowCreateProbeModal(true);
                                              }
                                            }}
                                            savingFields={savingFields}
                                            savedFields={savedFields}
                                          />
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                          <InlineProbeCell
                                            probeAssignmentId={pa.id}
                                            field="probeStatus"
                                            value={pa.probeStatus}
                                            type="select"
                                            options={[
                                              { value: 'Unassigned', label: 'Unassigned' },
                                              { value: 'Assigned', label: 'Assigned' },
                                              { value: 'Ready to Install', label: 'Ready to Install' },
                                              { value: 'Installed', label: 'Installed' },
                                              { value: 'In Season Repair Requested', label: 'In Season Repair' },
                                              { value: 'Ready to Remove', label: 'Ready to Remove' },
                                              { value: 'Removed', label: 'Removed' },
                                              { value: 'Off Season Repair Requested', label: 'Off Season Repair' },
                                            ]}
                                            onSave={handleProbeAssignmentSave}
                                            savingFields={savingFields}
                                            savedFields={savedFields}
                                          />
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                          <InlineProbeCell
                                            probeAssignmentId={pa.id}
                                            field="antennaType"
                                            value={pa.antennaType}
                                            type="select"
                                            options={[
                                              { value: 'Sentek Stub', label: 'Sentek Stub' },
                                              { value: 'CropX Stub', label: 'CropX Stub' },
                                              { value: "Sentek 10'", label: "Sentek 10'" },
                                              { value: "CropX 10'", label: "CropX 10'" },
                                              { value: "CropX 6'", label: "CropX 6'" },
                                              { value: 'ASK', label: 'ASK' },
                                            ]}
                                            onSave={handleProbeAssignmentSave}
                                            savingFields={savingFields}
                                            savedFields={savedFields}
                                          />
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                          <InlineProbeCell
                                            probeAssignmentId={pa.id}
                                            field="batteryType"
                                            value={pa.batteryType}
                                            type="select"
                                            options={[
                                              { value: 'CropX', label: 'CropX' },
                                              { value: 'Sentek New', label: 'Sentek New' },
                                              { value: 'Sentek Used', label: 'Sentek Used' },
                                            ]}
                                            onSave={handleProbeAssignmentSave}
                                            savingFields={savingFields}
                                            savedFields={savedFields}
                                          />
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                          <InlineProbeCell
                                            probeAssignmentId={pa.id}
                                            field="placementNotes"
                                            value={pa.placementNotes}
                                            type="text"
                                            onSave={handleProbeAssignmentSave}
                                            savingFields={savingFields}
                                            savedFields={savedFields}
                                          />
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                          <InlineProbeCell
                                            probeAssignmentId={pa.id}
                                            field="approvalStatus"
                                            value={pa.approvalStatus}
                                            type="select"
                                            options={[
                                              { value: 'Pending', label: 'Pending' },
                                              { value: 'Approved', label: 'Approved' },
                                              { value: 'Change Requested', label: 'Change Requested' },
                                            ]}
                                            onSave={handleProbeAssignmentSave}
                                            savingFields={savingFields}
                                            savedFields={savedFields}
                                          />
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                          <button
                                            className="action-btn"
                                            title="Delete probe assignment"
                                            onClick={() => handleDeleteProbeAssignment(pa.id)}
                                            style={{ color: 'var(--text-muted)' }}
                                          >
                                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        </td>
                                      </tr>
                                      );
                                    })}
                                    {/* Add probe assignment row */}
                                    <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                      <td colSpan={9} style={{ paddingLeft: '32px' }}>
                                        <button
                                          onClick={() => handleAddProbeAssignment(field.fieldSeasonId!, fieldSeasonProbeAssignments.length + 1)}
                                          disabled={savingProbeAssignment}
                                          style={{
                                            background: 'none',
                                            border: '1px dashed var(--border)',
                                            padding: '4px 12px',
                                            borderRadius: '4px',
                                            color: 'var(--accent-green)',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                          }}
                                        >
                                          {savingProbeAssignment ? 'Adding...' : `+ Add Probe ${fieldSeasonProbeAssignments.length + 1}`}
                                        </button>
                                      </td>
                                    </tr>
                                        </tbody>
                                      </table>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-cards">
                    {filteredFields.length === 0 ? (
                      <EmptyState
                        icon={searchQuery ? 'search' : currentSeason !== 'all' ? 'calendar' : 'fields'}
                        title={searchQuery ? 'No matching fields' : currentSeason !== 'all' ? `No fields for ${currentSeason}` : 'No fields yet'}
                        description={searchQuery ? 'Try a different search term' : currentSeason !== 'all' ? 'Use "Copy to New Season" to set up fields for this year' : 'Add your first field to get started'}
                        action={!searchQuery && currentSeason === 'all' ? { label: 'Add Field', onClick: () => setShowAddModal(true) } : undefined}
                      />
                    ) : (
                      filteredFields.map((field) => (
                        <div key={`${field.id}-${field.fieldSeasonId}`} className="mobile-card" onClick={() => handleRowClick(field)}>
                          <div className="mobile-card-header">
                            <span className="mobile-card-title">{field.name}</span>
                            {getStatusBadge(field.probeStatus)}
                          </div>
                          <div className="mobile-card-body">
                            {visibleColumns.filter((col) => col !== 'field').map((col) => (
                              <div key={col} className="mobile-card-row">
                                <span>{columnLabelMap[col] || col}:</span> {getMobileCardValue(field, col)}
                              </div>
                            ))}
                          </div>
                          <div className="mobile-card-footer" style={{
                            marginTop: '12px',
                            paddingTop: '12px',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'flex-end'
                          }}>
                            <span style={{
                              color: 'var(--accent-green)',
                              fontSize: '13px',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              View Details
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
            </div>
          </div>

          {mapVisible && (
            <FieldsMap fields={mapFields} visible={mapVisible} colorBy={colorBy} />
          )}
        </div>

        {/* Detail Panel */}
        {selectedField && (
          <div className="detail-panel-overlay" onClick={handleClosePanel}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>{selectedField.name}</h3>
                <button className="close-btn" onClick={handleClosePanel}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                {isEditing ? (
                  <div className="edit-form">
                    <div className="form-group">
                      <label>Field Name</label>
                      <input type="text" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Acres</label>
                        <input type="number" value={editForm.acres || ''} onChange={(e) => setEditForm({ ...editForm, acres: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="form-group">
                        <label>Pivot Acres</label>
                        <input type="number" value={editForm.pivotAcres || ''} onChange={(e) => setEditForm({ ...editForm, pivotAcres: parseFloat(e.target.value) || undefined })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Latitude</label>
                        <input type="number" step="any" value={editForm.lat || ''} onChange={(e) => setEditForm({ ...editForm, lat: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="form-group">
                        <label>Longitude</label>
                        <input type="number" step="any" value={editForm.lng || ''} onChange={(e) => setEditForm({ ...editForm, lng: parseFloat(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="location-btn"
                      onClick={() => {
                        setLocationPickerTarget('edit');
                        setShowLocationPicker(true);
                      }}
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
                        <select value={editForm.waterSource || ''} onChange={(e) => setEditForm({ ...editForm, waterSource: e.target.value })}>
                          <option value="">Select...</option>
                          <option value="Well">Well</option>
                          <option value="Canal">Canal</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Fuel Source</label>
                        <select value={editForm.fuelSource || ''} onChange={(e) => setEditForm({ ...editForm, fuelSource: e.target.value })}>
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
                      <textarea value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
                    </div>

                    {/* Irrigation Fields */}
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '16px', paddingTop: '16px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>Irrigation Details</h4>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Irrigation Type</label>
                          <select value={editForm.irrigationType || ''} onChange={(e) => setEditForm({ ...editForm, irrigationType: e.target.value })}>
                            <option value="">Select...</option>
                            <option value="Drip">Drip</option>
                            <option value="Dryland">Dryland</option>
                            <option value="Gravity">Gravity</option>
                            <option value="Pivot">Pivot</option>
                            <option value="Pivot - Corner System">Pivot - Corner System</option>
                            <option value="Pivot - Wiper">Pivot - Wiper</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Row Direction</label>
                          <select value={editForm.rowDirection || ''} onChange={(e) => setEditForm({ ...editForm, rowDirection: e.target.value })}>
                            <option value="">Select...</option>
                            <option value="N-S">N-S</option>
                            <option value="E-W">E-W</option>
                          </select>
                        </div>
                      </div>

                      {/* Drip-specific fields - only show when irrigation type is Drip */}
                      {editForm.irrigationType === 'Drip' && (
                        <>
                          <div className="form-row">
                            <div className="form-group">
                              <label>Tubing Direction</label>
                              <select value={editForm.dripTubingDirection || ''} onChange={(e) => setEditForm({ ...editForm, dripTubingDirection: e.target.value })}>
                                <option value="">Select...</option>
                                <option value="N-S">N-S</option>
                                <option value="E-W">E-W</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label>Tubing Spacing (in)</label>
                              <input type="number" value={editForm.dripTubingSpacing || ''} onChange={(e) => setEditForm({ ...editForm, dripTubingSpacing: parseInt(e.target.value) || undefined })} />
                            </div>
                            <div className="form-group">
                              <label>Emitter Spacing (in)</label>
                              <input type="number" value={editForm.dripEmitterSpacing || ''} onChange={(e) => setEditForm({ ...editForm, dripEmitterSpacing: parseInt(e.target.value) || undefined })} />
                            </div>
                          </div>
                          <div className="form-row">
                            <div className="form-group">
                              <label>Zones</label>
                              <input type="number" value={editForm.dripZones || ''} onChange={(e) => setEditForm({ ...editForm, dripZones: parseInt(e.target.value) || undefined })} />
                            </div>
                            <div className="form-group">
                              <label>GPM</label>
                              <input type="number" value={editForm.dripGpm || ''} onChange={(e) => setEditForm({ ...editForm, dripGpm: parseInt(e.target.value) || undefined })} />
                            </div>
                            <div className="form-group">
                              <label>Depth (in)</label>
                              <input type="number" value={editForm.dripDepth || ''} onChange={(e) => setEditForm({ ...editForm, dripDepth: parseInt(e.target.value) || undefined })} />
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Location Data Fields */}
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '16px', paddingTop: '16px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>Location Data</h4>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Elevation (ft)</label>
                          <input type="number" value={editForm.elevation || ''} onChange={(e) => setEditForm({ ...editForm, elevation: parseInt(e.target.value) || undefined })} />
                        </div>
                        <div className="form-group">
                          <label>Soil Type</label>
                          <input type="text" value={editForm.soilType || ''} onChange={(e) => setEditForm({ ...editForm, soilType: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Placement Notes</label>
                        <textarea value={editForm.placementNotes || ''} onChange={(e) => setEditForm({ ...editForm, placementNotes: e.target.value })} rows={2} placeholder="Notes about probe placement location..." />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="detail-info">
                    <div className="detail-row">
                      <span className="detail-label">Operation</span>
                      <span className="detail-value">{selectedField.operation}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Season</span>
                      <span className="detail-value">{selectedField.season || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Acres</span>
                      <span className="detail-value">{selectedField.acres}</span>
                    </div>
                    {selectedField.pivotAcres && (
                      <div className="detail-row">
                        <span className="detail-label">Pivot Acres</span>
                        <span className="detail-value">{selectedField.pivotAcres}</span>
                      </div>
                    )}
                    <div className="detail-row">
                      <span className="detail-label">Crop</span>
                      <span className="detail-value">{getCropBadge(selectedField.crop)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Service Type</span>
                      <span className="detail-value">{selectedField.serviceType || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Antenna Type</span>
                      <span className="detail-value">{selectedField.antennaType || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Probe</span>
                      <span className="detail-value">{selectedField.probe || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Status</span>
                      <span className="detail-value">{getStatusBadge(selectedField.probeStatus)}</span>
                    </div>
                    {selectedField.lat && selectedField.lng && (
                      <div className="detail-row">
                        <span className="detail-label">Location</span>
                        <span className="detail-value">{Number(selectedField.lat).toFixed(4)}, {Number(selectedField.lng).toFixed(4)}</span>
                      </div>
                    )}
                    {selectedField.waterSource && (
                      <div className="detail-row">
                        <span className="detail-label">Water Source</span>
                        <span className="detail-value">{selectedField.waterSource}</span>
                      </div>
                    )}
                    {selectedField.fuelSource && (
                      <div className="detail-row">
                        <span className="detail-label">Fuel Source</span>
                        <span className="detail-value">{selectedField.fuelSource}</span>
                      </div>
                    )}
                    {selectedField.notes && (
                      <div className="detail-row">
                        <span className="detail-label">Notes</span>
                        <span className="detail-value">{selectedField.notes}</span>
                      </div>
                    )}

                    {/* Irrigation Details Section */}
                    {(selectedField.irrigationType || selectedField.rowDirection || selectedField.fieldDirections) && (
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
                        <div className="detail-row" style={{ marginBottom: '8px' }}>
                          <span className="detail-label" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Irrigation Details</span>
                        </div>
                        {selectedField.fieldDirections && (
                          <div className="detail-row">
                            <span className="detail-label">Field Directions</span>
                            <span className="detail-value">{selectedField.fieldDirections}</span>
                          </div>
                        )}
                        {selectedField.irrigationType && (
                          <div className="detail-row">
                            <span className="detail-label">Irrigation Type</span>
                            <span className="detail-value">{selectedField.irrigationType}</span>
                          </div>
                        )}
                        {selectedField.rowDirection && (
                          <div className="detail-row">
                            <span className="detail-label">Row Direction</span>
                            <span className="detail-value">{selectedField.rowDirection}</span>
                          </div>
                        )}
                        {/* Drip-specific fields - only show when irrigation type is Drip */}
                        {selectedField.irrigationType === 'Drip' && (
                          <>
                            {selectedField.dripTubingDirection && (
                              <div className="detail-row">
                                <span className="detail-label">Tubing Direction</span>
                                <span className="detail-value">{selectedField.dripTubingDirection}</span>
                              </div>
                            )}
                            {selectedField.dripTubingSpacing && (
                              <div className="detail-row">
                                <span className="detail-label">Tubing Spacing</span>
                                <span className="detail-value">{selectedField.dripTubingSpacing}"</span>
                              </div>
                            )}
                            {selectedField.dripEmitterSpacing && (
                              <div className="detail-row">
                                <span className="detail-label">Emitter Spacing</span>
                                <span className="detail-value">{selectedField.dripEmitterSpacing}"</span>
                              </div>
                            )}
                            {selectedField.dripZones && (
                              <div className="detail-row">
                                <span className="detail-label">Zones</span>
                                <span className="detail-value">{selectedField.dripZones}</span>
                              </div>
                            )}
                            {selectedField.dripGpm && (
                              <div className="detail-row">
                                <span className="detail-label">GPM</span>
                                <span className="detail-value">{selectedField.dripGpm}</span>
                              </div>
                            )}
                            {selectedField.dripDepth && (
                              <div className="detail-row">
                                <span className="detail-label">Tubing Depth</span>
                                <span className="detail-value">{selectedField.dripDepth}"</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Location Data Section */}
                    {(selectedField.elevation || selectedField.soilType || selectedField.placementNotes) && (
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
                        <div className="detail-row" style={{ marginBottom: '8px' }}>
                          <span className="detail-label" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Location Data</span>
                        </div>
                        {selectedField.elevation && (
                          <div className="detail-row">
                            <span className="detail-label">Elevation</span>
                            <span className="detail-value">{selectedField.elevation} ft</span>
                          </div>
                        )}
                        {selectedField.soilType && (
                          <div className="detail-row">
                            <span className="detail-label">Soil Type</span>
                            <span className="detail-value">{selectedField.soilType}</span>
                          </div>
                        )}
                        {selectedField.placementNotes && (
                          <div className="detail-row">
                            <span className="detail-label">Placement Notes</span>
                            <span className="detail-value">{selectedField.placementNotes}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Install Planning Section */}
                    {(selectedField.routeOrder || selectedField.plannedInstaller || selectedField.readyToInstall || selectedField.plantingDate) && (
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
                        <div className="detail-row" style={{ marginBottom: '8px' }}>
                          <span className="detail-label" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Install Planning</span>
                        </div>
                        {selectedField.plantingDate && (
                          <div className="detail-row">
                            <span className="detail-label">Days Since Planting</span>
                            <span className="detail-value" style={{ fontWeight: 500, color: 'var(--accent-green)' }}>
                              {Math.floor((Date.now() - new Date(selectedField.plantingDate).getTime()) / 86400000)} days
                              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>
                                (planted {selectedField.plantingDate})
                              </span>
                            </span>
                          </div>
                        )}
                        {selectedField.routeOrder && (
                          <div className="detail-row">
                            <span className="detail-label">Route Order</span>
                            <span className="detail-value">#{selectedField.routeOrder}</span>
                          </div>
                        )}
                        {selectedField.plannedInstaller && (
                          <div className="detail-row">
                            <span className="detail-label">Planned Installer</span>
                            <span className="detail-value">{selectedField.plannedInstaller}</span>
                          </div>
                        )}
                        <div className="detail-row">
                          <span className="detail-label">Ready to Install</span>
                          <span className="detail-value">
                            {selectedField.readyToInstall ? (
                              <span style={{ color: 'var(--accent-green)' }}>Yes</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>No</span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Install Details Section - shown when installed */}
                    {selectedField.probeStatus === 'Installed' && (selectedField.installer || selectedField.installDate || selectedField.installLat) && (
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
                        <div className="detail-row" style={{ marginBottom: '8px' }}>
                          <span className="detail-label" style={{ fontWeight: 600, color: 'var(--accent-green)' }}>Install Details</span>
                        </div>
                        {selectedField.installer && (
                          <div className="detail-row">
                            <span className="detail-label">Installer</span>
                            <span className="detail-value">{selectedField.installer}</span>
                          </div>
                        )}
                        {selectedField.installDate && (
                          <div className="detail-row">
                            <span className="detail-label">Install Date</span>
                            <span className="detail-value">{selectedField.installDate}</span>
                          </div>
                        )}
                        {selectedField.installLat && selectedField.installLng && (
                          <div className="detail-row">
                            <span className="detail-label">Install Location</span>
                            <span className="detail-value">
                              <a
                                href={`https://www.google.com/maps?q=${selectedField.installLat},${selectedField.installLng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'var(--accent-blue)' }}
                              >
                                {Number(selectedField.installLat).toFixed(5)}, {Number(selectedField.installLng).toFixed(5)}
                              </a>
                            </span>
                          </div>
                        )}
                        {selectedField.installNotes && (
                          <div className="detail-row">
                            <span className="detail-label">Install Notes</span>
                            <span className="detail-value">{selectedField.installNotes}</span>
                          </div>
                        )}
                        {(selectedField.installPhotoFieldEndUrl || selectedField.installPhotoExtraUrl) && (
                          <div style={{ marginTop: '12px' }}>
                            <span className="detail-label" style={{ display: 'block', marginBottom: '8px' }}>Install Photos</span>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {selectedField.installPhotoFieldEndUrl && (
                                <a href={selectedField.installPhotoFieldEndUrl} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={selectedField.installPhotoFieldEndUrl}
                                    alt="Field End"
                                    style={{
                                      width: '120px',
                                      height: '90px',
                                      objectFit: 'cover',
                                      borderRadius: '8px',
                                      border: '1px solid var(--border)',
                                    }}
                                  />
                                </a>
                              )}
                              {selectedField.installPhotoExtraUrl && (
                                <a href={selectedField.installPhotoExtraUrl} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={selectedField.installPhotoExtraUrl}
                                    alt="Extra"
                                    style={{
                                      width: '120px',
                                      height: '90px',
                                      objectFit: 'cover',
                                      borderRadius: '8px',
                                      border: '1px solid var(--border)',
                                    }}
                                  />
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="detail-panel-footer">
                {isEditing ? (
                  <>
                    <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={handleDelete}>Delete</button>
                    {selectedField.fieldSeasonId && (
                      <>
                        <button className="btn btn-secondary" onClick={() => setShowSeasonFieldsEdit(true)}>
                          Edit Season
                        </button>
                        <button className="btn btn-secondary" onClick={() => {
                          setRemovalForm({ removal_date: new Date().toISOString().split('T')[0], removal_notes: '', log_to_probe: false });
                          setShowRemovalModal(true);
                        }}>
                          Log Removal
                        </button>
                      </>
                    )}
                    <button className="btn btn-primary" onClick={handleEdit}>Edit Field</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit Season Modal */}
        {showSeasonFieldsEdit && selectedField && (
          <EditSeasonModal
            field={selectedField}
            initialForm={createEditSeasonForm(selectedField, getRateForServiceType)}
            selectedProbeId={selectedProbeId}
            selectedProbe2Id={selectedProbe2Id}
            onProbeIdChange={setSelectedProbeId}
            onProbe2IdChange={setSelectedProbe2Id}
            serviceTypeOptions={serviceTypeOptions}
            getRateForServiceType={getRateForServiceType}
            getProbesForField={getProbesForField}
            onClose={() => setShowSeasonFieldsEdit(false)}
            onSaved={() => {
              setShowSeasonFieldsEdit(false);
              window.location.reload();
            }}
            onFieldsUpdate={setFields}
            onOpenCreateProbe={(target, operationName) => {
              setCreateProbeTarget(target);
              setCreateProbeAssignmentId(null);
              setCreateProbeOperationName(operationName);
              setShowCreateProbeModal(true);
            }}
          />
        )}

        {/* Create New Probe Modal */}
        {showCreateProbeModal && (
          <CreateProbeModal
            operationName={createProbeOperationName}
            billingEntities={billingEntities}
            onClose={() => setShowCreateProbeModal(false)}
            onCreated={handleProbeCreated}
          />
        )}

        {/* Add Field Modal */}
        {showAddModal && (
          <AddFieldModal
            currentSeason={currentSeason}
            billingEntities={billingEntities}
            serviceTypeOptions={serviceTypeOptions}
            getRateForServiceType={getRateForServiceType}
            onClose={() => {
              setShowAddModal(false);
              setAddFieldLatLng(null);
            }}
            onSaved={() => {
              setShowAddModal(false);
              setAddFieldLatLng(null);
              window.location.reload();
            }}
            onOpenLocationPicker={() => {
              setLocationPickerTarget('add');
              setShowLocationPicker(true);
            }}
            latLng={addFieldLatLng}
          />
        )}

        {/* Add Season Modal */}
        {showAddSeasonModal && selectedField && (
          <AddSeasonModal
            fieldId={selectedField.id}
            fieldName={selectedField.name}
            billingEntityId={selectedField.billingEntityId}
            missingSeasons={missingSeasonsForField}
            serviceTypeOptions={serviceTypeOptions}
            getRateForServiceType={getRateForServiceType}
            onClose={() => setShowAddSeasonModal(false)}
            onSaved={() => {
              setShowAddSeasonModal(false);
              window.location.reload();
            }}
          />
        )}

        {/* Removal Logging Modal */}
        {showRemovalModal && selectedField && (
          <div className="detail-panel-overlay" onClick={() => setShowRemovalModal(false)}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>Log Removal for {selectedField.name}</h3>
                <button className="close-btn" onClick={() => setShowRemovalModal(false)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                <div className="edit-form">
                  <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    Log when a probe was removed from this field. Optionally log any issues to the probe&apos;s history.
                  </p>
                  <div className="form-group">
                    <label>Removal Date *</label>
                    <input
                      type="date"
                      value={removalForm.removal_date}
                      onChange={(e) => setRemovalForm({ ...removalForm, removal_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Removal Notes</label>
                    <textarea
                      value={removalForm.removal_notes}
                      onChange={(e) => setRemovalForm({ ...removalForm, removal_notes: e.target.value })}
                      placeholder="Any notes about the removal or issues found..."
                      rows={4}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                  {selectedField.probeId && (
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={removalForm.log_to_probe}
                          onChange={(e) => setRemovalForm({ ...removalForm, log_to_probe: e.target.checked })}
                          style={{ width: '18px', height: '18px' }}
                        />
                        Log issue to probe
                      </label>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        If checked, the removal notes will be appended to probe {selectedField.probe}&apos;s notes with a timestamp.
                        This helps track damage history as the probe moves between fields.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="detail-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowRemovalModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleLogRemoval} disabled={savingRemoval}>
                  {savingRemoval ? 'Saving...' : 'Log Removal'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rollover Modal */}
        {showRolloverModal && (
          <div className="detail-panel-overlay" onClick={() => setShowRolloverModal(false)}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>Copy Fields to New Season</h3>
                <button className="close-btn" onClick={() => setShowRolloverModal(false)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                <div className="edit-form">
                  <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    Copy all fields from one season to another. This will create new season entries for fields that don&apos;t already exist in the target season.
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>From Season</label>
                      <select
                        value={rolloverForm.fromSeason}
                        onChange={(e) => setRolloverForm({ ...rolloverForm, fromSeason: e.target.value })}
                      >
                        {allSeasons.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>To Season</label>
                      <select
                        value={rolloverForm.toSeason}
                        onChange={(e) => {
                          if (e.target.value === '__add_year__') {
                            const customYear = prompt('Enter year (e.g., 2030):');
                            if (customYear && /^\d{4}$/.test(customYear.trim())) {
                              const newYear = customYear.trim();
                              if (!allSeasons.includes(newYear)) {
                                setCustomYears(prev => [...prev, newYear]);
                              }
                              setRolloverForm({ ...rolloverForm, toSeason: newYear });
                            }
                          } else {
                            setRolloverForm({ ...rolloverForm, toSeason: e.target.value });
                          }
                        }}
                      >
                        {allSeasons.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="__add_year__">+ Add Year...</option>
                      </select>
                    </div>
                  </div>

                  <div style={{
                    background: 'var(--bg-tertiary)',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span>Fields in {rolloverForm.fromSeason}:</span>
                      <strong>{rolloverStats.fromCount}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span>Already in {rolloverForm.toSeason}:</span>
                      <strong>{rolloverStats.toCount}</strong>
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--border)',
                      color: 'var(--accent-green)'
                    }}>
                      <span>Will be copied:</span>
                      <strong>{rolloverStats.canRollover}</strong>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={rolloverForm.copyProbes}
                        onChange={(e) => setRolloverForm({ ...rolloverForm, copyProbes: e.target.checked })}
                        style={{ width: '18px', height: '18px' }}
                      />
                      Also copy probe assignments
                    </label>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      If checked, probes from the source season will be assigned to the same fields in the new season.
                    </p>
                  </div>
                </div>
              </div>
              <div className="detail-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowRolloverModal(false)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleRollover}
                  disabled={rollingOver || rolloverStats.canRollover === 0}
                >
                  {rollingOver ? 'Copying...' : `Copy ${rolloverStats.canRollover} Fields`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Batch Enroll/Unenroll Modal */}
        {showBatchModal && (
          <div className="detail-panel-overlay" onClick={() => setShowBatchModal(false)}>
            <div className="detail-panel" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>Batch {batchMode === 'enroll' ? 'Enroll' : 'Unenroll'} Fields</h3>
                <button className="close-btn" onClick={() => setShowBatchModal(false)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                {/* Mode toggle */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button
                    className={`btn ${batchMode === 'enroll' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setBatchMode('enroll'); setSelectedBatchFieldIds(new Set()); }}
                    style={{ flex: 1 }}
                  >
                    Enroll
                  </button>
                  <button
                    className={`btn ${batchMode === 'unenroll' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setBatchMode('unenroll'); setSelectedBatchFieldIds(new Set()); }}
                    style={{ flex: 1 }}
                  >
                    Unenroll
                  </button>
                </div>

                <div className="edit-form">
                  <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    {batchMode === 'enroll'
                      ? 'Select fields to add to a season. Fields already in the selected season are not shown.'
                      : 'Select fields to remove from a season. Only fields currently in the selected season are shown.'}
                  </p>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Season</label>
                      <select
                        value={batchSeason}
                        onChange={(e) => {
                          setBatchSeason(e.target.value);
                          setSelectedBatchFieldIds(new Set());
                        }}
                      >
                        {allSeasons.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    {batchMode === 'enroll' && (
                      <div className="form-group">
                        <label>Service Type (optional)</label>
                        <select
                          value={batchServiceType}
                          onChange={(e) => setBatchServiceType(e.target.value)}
                        >
                          <option value="">— Select service —</option>
                          {serviceRates.map((sr) => (
                            <option key={sr.id} value={sr.serviceType}>{sr.serviceType}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Field selection list */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontWeight: 600 }}>
                        {batchMode === 'enroll' ? 'Fields to Enroll' : 'Fields to Unenroll'} ({batchFieldsList.length} available)
                      </label>
                      {batchFieldsList.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => {
                            if (selectedBatchFieldIds.size === batchFieldsList.length) {
                              setSelectedBatchFieldIds(new Set());
                            } else {
                              setSelectedBatchFieldIds(new Set(batchFieldsList.map((f) => f.id)));
                            }
                          }}
                        >
                          {selectedBatchFieldIds.size === batchFieldsList.length ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                    </div>

                    <div style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      background: 'var(--bg-tertiary)',
                    }}>
                      {batchFieldsList.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {batchMode === 'enroll'
                            ? `All fields are already enrolled in ${batchSeason}`
                            : `No fields are enrolled in ${batchSeason}`}
                        </div>
                      ) : (
                        batchFieldsList.map((field) => (
                          <label
                            key={field.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '10px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--border)',
                              background: selectedBatchFieldIds.has(field.id) ? 'var(--accent-blue-dim)' : 'transparent',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedBatchFieldIds.has(field.id)}
                              onChange={(e) => {
                                const newSet = new Set(selectedBatchFieldIds);
                                if (e.target.checked) {
                                  newSet.add(field.id);
                                } else {
                                  newSet.delete(field.id);
                                }
                                setSelectedBatchFieldIds(newSet);
                              }}
                              style={{ width: '18px', height: '18px' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 500 }}>{field.name}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {field.operation || 'Unknown Operation'}
                                {field.serviceType && ` • ${field.serviceType}`}
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  {selectedBatchFieldIds.size > 0 && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px',
                      background: batchMode === 'enroll' ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)',
                      borderRadius: '8px',
                      color: batchMode === 'enroll' ? 'var(--accent-green)' : 'var(--accent-red)',
                      fontWeight: 500,
                    }}>
                      {selectedBatchFieldIds.size} field(s) selected to {batchMode === 'enroll' ? 'enroll in' : 'remove from'} {batchSeason}
                    </div>
                  )}
                </div>
              </div>
              <div className="detail-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowBatchModal(false)}>Cancel</button>
                <button
                  className={`btn ${batchMode === 'enroll' ? 'btn-primary' : 'btn-primary'}`}
                  style={batchMode === 'unenroll' ? { background: 'var(--accent-red)', borderColor: 'var(--accent-red)' } : {}}
                  onClick={batchMode === 'enroll' ? handleBatchEnroll : handleBatchUnenroll}
                  disabled={batchSaving || selectedBatchFieldIds.size === 0}
                >
                  {batchSaving
                    ? (batchMode === 'enroll' ? 'Enrolling...' : 'Removing...')
                    : (batchMode === 'enroll'
                        ? `Enroll ${selectedBatchFieldIds.size} Field(s)`
                        : `Remove ${selectedBatchFieldIds.size} Field(s)`)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Location Picker */}
        {showLocationPicker && (
          <LocationPicker
            lat={
              locationPickerTarget === 'edit'
                ? (editForm.lat ? Number(editForm.lat) : null)
                : locationPickerTarget === 'probeAssignment'
                  ? (editingProbeAssignmentLocation?.placementLat ?? null)
                  : (addFieldLatLng?.lat ? parseFloat(addFieldLatLng.lat) : null)
            }
            lng={
              locationPickerTarget === 'edit'
                ? (editForm.lng ? Number(editForm.lng) : null)
                : locationPickerTarget === 'probeAssignment'
                  ? (editingProbeAssignmentLocation?.placementLng ?? null)
                  : (addFieldLatLng?.lng ? parseFloat(addFieldLatLng.lng) : null)
            }
            onLocationChange={async (lat, lng, elevation, soilType) => {
              if (locationPickerTarget === 'edit') {
                setEditForm({
                  ...editForm,
                  lat,
                  lng,
                  elevation: elevation ?? editForm.elevation,
                  soilType: soilType ?? editForm.soilType,
                });
              } else if (locationPickerTarget === 'probeAssignment' && editingProbeAssignmentLocation) {
                // Save location directly to probe assignment (single API call)
                await handleProbeAssignmentLocationSave(
                  editingProbeAssignmentLocation.id,
                  lat,
                  lng,
                  elevation,
                  soilType
                );
              } else {
                setAddFieldLatLng({ lat: lat.toString(), lng: lng.toString() });
              }
            }}
            onClose={() => {
              setShowLocationPicker(false);
              setEditingProbeAssignmentLocation(null);
            }}
          />
        )}
      </div>
    </>
  );
}
