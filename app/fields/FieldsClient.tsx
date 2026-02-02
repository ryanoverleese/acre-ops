'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import EmptyState from '@/components/EmptyState';
import type { ProcessedField, ProcessedProbeAssignment, OperationOption, BillingEntityOption, ProbeOption } from './page';

const FieldsMap = dynamic(() => import('@/components/FieldsMap'), {
  ssr: false,
  loading: () => <div className="fields-map" style={{ display: 'block' }}><div className="loading"><div className="loading-spinner"></div>Loading map...</div></div>,
});

const LocationPicker = dynamic(() => import('@/components/LocationPicker'), {
  ssr: false,
  loading: () => <div className="location-picker-overlay"><div className="location-picker-modal"><div className="loading">Loading map...</div></div></div>,
});

type ViewMode = 'seasonal' | 'permanent';

interface FieldsClientProps {
  initialFields: ProcessedField[];
  operations: OperationOption[];
  billingEntities: BillingEntityOption[];
  probes: ProbeOption[];
  availableSeasons: string[];
  initialProbeAssignments: ProcessedProbeAssignment[];
}

// Inline editable cell component for seasonal data
interface InlineCellProps {
  fieldSeasonId: number | null;
  field: string;
  value: string | number | boolean | null | undefined;
  type: 'text' | 'select' | 'number' | 'checkbox';
  options?: { value: string; label: string }[];
  onSave: (fieldSeasonId: number, field: string, value: unknown) => Promise<void>;
  savingFields: Set<string>;
  savedFields: Set<string>;
}

function InlineCell({ fieldSeasonId, field, value, type, options, onSave, savingFields, savedFields }: InlineCellProps) {
  const cellKey = `${fieldSeasonId}-${field}`;
  const isSaving = savingFields.has(cellKey);
  const justSaved = savedFields.has(cellKey);

  const handleChange = async (newValue: unknown) => {
    if (!fieldSeasonId) return;
    await onSave(fieldSeasonId, field, newValue);
  };

  if (type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => handleChange(e.target.checked)}
          disabled={isSaving}
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
        />
        {isSaving && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...</span>}
        {justSaved && <span style={{ fontSize: '10px', color: 'var(--accent-green)' }}>✓</span>}
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div style={{ position: 'relative' }}>
        <select
          value={value as string || ''}
          onChange={(e) => handleChange(e.target.value || null)}
          disabled={isSaving}
          style={{
            width: '100%',
            padding: '4px 6px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)',
            transition: 'background 0.3s',
          }}
        >
          <option value="">—</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {isSaving && (
          <span style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          value={value as number || ''}
          onChange={(e) => handleChange(e.target.value ? parseInt(e.target.value, 10) : null)}
          disabled={isSaving}
          min="1"
          style={{
            width: '60px',
            padding: '4px 6px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)',
            transition: 'background 0.3s',
          }}
        />
        {isSaving && (
          <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  return <span>{value?.toString() || '—'}</span>;
}

// Inline editable cell component for probe assignments
interface InlineProbeCellProps {
  probeAssignmentId: number;
  field: string;
  value: string | number | boolean | null | undefined;
  type: 'text' | 'select' | 'number' | 'checkbox';
  options?: { value: string; label: string }[];
  onSave: (probeAssignmentId: number, field: string, value: unknown) => Promise<void>;
  savingFields: Set<string>;
  savedFields: Set<string>;
}

function InlineProbeCell({ probeAssignmentId, field, value, type, options, onSave, savingFields, savedFields }: InlineProbeCellProps) {
  const cellKey = `pa-${probeAssignmentId}-${field}`;
  const isSaving = savingFields.has(cellKey);
  const justSaved = savedFields.has(cellKey);

  const handleChange = async (newValue: unknown) => {
    await onSave(probeAssignmentId, field, newValue);
  };

  if (type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => handleChange(e.target.checked)}
          disabled={isSaving}
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
        />
        {isSaving && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...</span>}
        {justSaved && <span style={{ fontSize: '10px', color: 'var(--accent-green)' }}>✓</span>}
      </div>
    );
  }

  if (type === 'select') {
    return (
      <div style={{ position: 'relative' }}>
        <select
          value={value as string || ''}
          onChange={(e) => handleChange(e.target.value || null)}
          disabled={isSaving}
          style={{
            width: '100%',
            padding: '4px 6px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)',
            transition: 'background 0.3s',
          }}
        >
          <option value="">—</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {isSaving && (
          <span style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          value={value as number || ''}
          onChange={(e) => handleChange(e.target.value ? parseFloat(e.target.value) : null)}
          disabled={isSaving}
          step="any"
          style={{
            width: '80px',
            padding: '4px 6px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)',
            transition: 'background 0.3s',
          }}
        />
        {isSaving && (
          <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={value as string || ''}
          onChange={(e) => handleChange(e.target.value || null)}
          disabled={isSaving}
          style={{
            width: '100%',
            padding: '4px 6px',
            fontSize: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)',
            transition: 'background 0.3s',
          }}
        />
        {isSaving && (
          <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
        )}
      </div>
    );
  }

  return <span>{value?.toString() || '—'}</span>;
}

const initialAddForm = {
  billing_entity: '',
  name: '',
  acres: '',
  pivot_acres: '',
  lat: '',
  lng: '',
  water_source: '',
  fuel_source: '',
  notes: '',
  season: '2026',
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
};

export default function FieldsClient({
  initialFields,
  operations,
  billingEntities,
  probes,
  availableSeasons,
  initialProbeAssignments,
}: FieldsClientProps) {
  const [fields, setFields] = useState(initialFields);
  const [probeAssignments, setProbeAssignments] = useState(initialProbeAssignments);
  const [expandedFieldSeasons, setExpandedFieldSeasons] = useState<Set<number>>(new Set());
  const [addingProbeForFieldSeason, setAddingProbeForFieldSeason] = useState<number | null>(null);
  const [savingProbeAssignment, setSavingProbeAssignment] = useState(false);
  const [currentSeason, setCurrentSeason] = useState(availableSeasons[0] || '2026');
  const [customYears, setCustomYears] = useState<string[]>([]);
  const [currentFilter, setCurrentFilter] = useState<string>('all');
  const [currentOperation, setCurrentOperation] = useState<string>('all');
  const [currentIrrigationType, setCurrentIrrigationType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapVisible, setMapVisible] = useState(false);
  const [colorBy, setColorBy] = useState<'none' | 'crop' | 'status' | 'operation'>('none');
  const [selectedField, setSelectedField] = useState<ProcessedField | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ProcessedField>>({});
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Restore view mode from sessionStorage if available
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('fieldsViewMode');
      if (saved === 'permanent' || saved === 'seasonal') {
        return saved;
      }
    }
    return 'seasonal';
  });
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set());
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ ...initialAddForm, season: currentSeason });
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showProbeAssign, setShowProbeAssign] = useState(false);
  const [selectedProbeId, setSelectedProbeId] = useState<string>('');
  const [selectedProbe2Id, setSelectedProbe2Id] = useState<string>('');
  const [savingProbe, setSavingProbe] = useState(false);
  const [showSeasonFieldsEdit, setShowSeasonFieldsEdit] = useState(false);
  const [seasonFieldsForm, setSeasonFieldsForm] = useState({
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
    route_order: '',
    planned_installer: '',
    ready_to_install: false,
  });
  const [savingSeasonFields, setSavingSeasonFields] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState<'edit' | 'add' | 'probeAssignment'>('edit');
  const [editingProbeAssignmentLocation, setEditingProbeAssignmentLocation] = useState<ProcessedProbeAssignment | null>(null);
  const [showAddSeasonModal, setShowAddSeasonModal] = useState(false);
  const [addSeasonForm, setAddSeasonForm] = useState({
    season: '2026',
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
  });
  const [savingSeason, setSavingSeason] = useState(false);
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

  // Persist viewMode to sessionStorage so it survives page reloads
  useEffect(() => {
    sessionStorage.setItem('fieldsViewMode', viewMode);
  }, [viewMode]);

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

  // Calculate status counts for current season
  const statusCounts = useMemo(() => {
    const normalizeStatus = (status: string | undefined | null) => (status || 'unassigned').toLowerCase().replace(' ', '-');
    return {
      all: seasonFields.length,
      'unassigned': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'unassigned').length,
      'assigned': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'assigned').length,
      'installed': seasonFields.filter((f) => normalizeStatus(f.probeStatus) === 'installed').length,
    };
  }, [seasonFields]);

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

    if (currentFilter !== 'all') {
      const normalizeStatus = (status: string | undefined | null) => (status || 'unassigned').toLowerCase().replace(' ', '-');
      filtered = filtered.filter((f) => normalizeStatus(f.probeStatus) === currentFilter);
    }

    if (currentOperation !== 'all') {
      filtered = filtered.filter((f) => f.operationId?.toString() === currentOperation);
    }

    if (currentIrrigationType !== 'all') {
      filtered = filtered.filter((f) => (f.irrigationType || 'Unknown') === currentIrrigationType);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortColumn) {
        case 'name': aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase(); break;
        case 'operation': aVal = (a.operation || '').toLowerCase(); bVal = (b.operation || '').toLowerCase(); break;
        case 'acres': aVal = a.acres || 0; bVal = b.acres || 0; break;
        case 'crop': aVal = (a.crop || '').toLowerCase(); bVal = (b.crop || '').toLowerCase(); break;
        case 'status': aVal = (a.probeStatus || '').toLowerCase(); bVal = (b.probeStatus || '').toLowerCase(); break;
        default: aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [seasonFields, searchQuery, currentFilter, currentOperation, currentIrrigationType, sortColumn, sortDirection]);

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

  // Sort probes by owner operation for the dropdown, with assignment status
  const sortedProbes = useMemo(() => {
    return [...probes]
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
  }, [probes, assignedProbeIds]);

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
        antennaType: 'antenna_type',
        probeId: 'probe',
        probeStatus: 'probe_status',
        routeOrder: 'route_order',
        plannedInstaller: 'planned_installer',
        readyToInstall: 'ready_to_install',
        approvalStatus: 'approval_status',
      };

      const apiField = apiFieldMap[field] || field;
      const body: Record<string, unknown> = {};

      // Handle probe assignment specially
      if (field === 'probeId') {
        body.probe = value ? parseInt(value as string, 10) : null;
        body.probe_status = value ? 'Assigned' : 'Unassigned';
      } else {
        body[apiField] = value;
      }

      const response = await fetch(`/api/field-seasons/${fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        // Update local state
        setFields(prev => prev.map(f => {
          if (f.fieldSeasonId === fieldSeasonId) {
            const updated = { ...f };
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
    setSeasonFieldsForm({
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
    });
    // Auto-enter edit mode when in permanent data view
    setIsEditing(viewMode === 'permanent');
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
        // Update local state instead of reloading to preserve viewMode
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
      const probeId = selectedProbeId ? parseInt(selectedProbeId, 10) : null;
      const response = await fetch(`/api/field-seasons/${selectedField.fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          probe: probeId,
          probe_status: probeId ? 'Assigned' : 'Unassigned',
        }),
      });
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

  const handleSaveSeasonFields = async () => {
    if (!selectedField || !selectedField.fieldSeasonId) {
      alert('Cannot update: No field season found');
      return;
    }
    setSavingSeasonFields(true);
    try {
      const response = await fetch(`/api/field-seasons/${selectedField.fieldSeasonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crop: seasonFieldsForm.crop || null,
          service_type: seasonFieldsForm.service_type || null,
          antenna_type: seasonFieldsForm.antenna_type || null,
          battery_type: seasonFieldsForm.battery_type || null,
          side_dress: seasonFieldsForm.side_dress || null,
          logger_id: seasonFieldsForm.logger_id || null,
          early_removal: seasonFieldsForm.early_removal || null,
          hybrid_variety: seasonFieldsForm.hybrid_variety || null,
          ready_to_remove: seasonFieldsForm.ready_to_remove || null,
          planting_date: seasonFieldsForm.planting_date || null,
        }),
      });
      if (response.ok) {
        setShowSeasonFieldsEdit(false);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update season fields');
      }
    } catch (error) {
      console.error('Save season fields error:', error);
      alert('Failed to update season fields');
    } finally {
      setSavingSeasonFields(false);
    }
  };

  const handleAddSeason = async () => {
    if (!selectedField) return;
    if (!addSeasonForm.season) {
      alert('Season is required');
      return;
    }
    setSavingSeason(true);
    try {
      const response = await fetch('/api/field-seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: selectedField.id,
          season: addSeasonForm.season,
          crop: addSeasonForm.crop || undefined,
          service_type: addSeasonForm.service_type || undefined,
          antenna_type: addSeasonForm.antenna_type || undefined,
          battery_type: addSeasonForm.battery_type || undefined,
          side_dress: addSeasonForm.side_dress || undefined,
          logger_id: addSeasonForm.logger_id || undefined,
          early_removal: addSeasonForm.early_removal || undefined,
          hybrid_variety: addSeasonForm.hybrid_variety || undefined,
          ready_to_remove: addSeasonForm.ready_to_remove || undefined,
          planting_date: addSeasonForm.planting_date || undefined,
        }),
      });
      if (response.ok) {
        setShowAddSeasonModal(false);
        setAddSeasonForm({ season: '2026', crop: '', service_type: '', antenna_type: '', battery_type: '', side_dress: '', logger_id: '', early_removal: '', hybrid_variety: '', ready_to_remove: '', planting_date: '' });
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create season');
      }
    } catch (error) {
      console.error('Add season error:', error);
      alert('Failed to create season');
    } finally {
      setSavingSeason(false);
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
        window.location.reload();
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
      const items = rolloverStats.fieldsToRollover.map((f) => ({
        field: f.id,
        season: rolloverForm.toSeason,
        service_type: f.serviceType || undefined,
        antenna_type: f.antennaType || undefined,
        probe: f.probeId || undefined,
        copy_probe: rolloverForm.copyProbes,
        source_field_season_id: f.fieldSeasonId, // Track source for probe_assignment copying
      }));

      const response = await fetch('/api/field-seasons/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        const result = await response.json();

        // Copy probe_assignments for each new field_season
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

          // For each created field_season, find probe_assignments from the source
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

          // Create the new probe_assignments
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

      // Handle probe assignment specially
      if (field === 'probeId') {
        body.probe = value ? parseInt(value as string, 10) : null;
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

  const handleAddField = async () => {
    if (!addForm.billing_entity) {
      alert('Billing Entity is required');
      return;
    }
    if (!addForm.name.trim()) {
      alert('Field name is required');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billing_entity: parseInt(addForm.billing_entity, 10),
          name: addForm.name,
          acres: addForm.acres ? parseFloat(addForm.acres) : undefined,
          pivot_acres: addForm.pivot_acres ? parseFloat(addForm.pivot_acres) : undefined,
          lat: addForm.lat ? parseFloat(addForm.lat) : undefined,
          lng: addForm.lng ? parseFloat(addForm.lng) : undefined,
          water_source: addForm.water_source || undefined,
          fuel_source: addForm.fuel_source || undefined,
          notes: addForm.notes || undefined,
          season: addForm.season,
          crop: addForm.crop || undefined,
          service_type: addForm.service_type || undefined,
          antenna_type: addForm.antenna_type || undefined,
          battery_type: addForm.battery_type || undefined,
          side_dress: addForm.side_dress || undefined,
          logger_id: addForm.logger_id || undefined,
          early_removal: addForm.early_removal || undefined,
          hybrid_variety: addForm.hybrid_variety || undefined,
          ready_to_remove: addForm.ready_to_remove || undefined,
          planting_date: addForm.planting_date || undefined,
        }),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm({ ...initialAddForm, season: currentSeason });
        window.location.reload();
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

  const getStatusBadge = (status: string | undefined | null) => {
    const safeStatus = status || 'Unassigned';
    const normalized = safeStatus.toLowerCase().replace(' ', '-');
    const statusMap: Record<string, { class: string; label: string }> = {
      installed: { class: 'installed', label: 'Installed' },
      assigned: { class: 'pending', label: 'Assigned' },
      unassigned: { class: 'needs-probe', label: 'Unassigned' },
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
          <button className="btn btn-secondary" onClick={() => setShowRolloverModal(true)}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Copy to New Season
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
        {/* View Mode Toggle */}
        <div className="fields-filter-row">
          <div className="view-mode-toggle">
            <button
              onClick={() => setViewMode('permanent')}
              className={viewMode === 'permanent' ? 'active' : ''}
            >
              Permanent Data
            </button>
            <button
              onClick={() => setViewMode('seasonal')}
              className={viewMode === 'seasonal' ? 'active' : ''}
            >
              Seasonal Data
            </button>
          </div>
          <div className="tabs">
            <button className={`tab ${currentFilter === 'all' ? 'active' : ''}`} onClick={() => setCurrentFilter('all')}>
              All Fields ({statusCounts.all})
            </button>
            <button className={`tab ${currentFilter === 'unassigned' ? 'active' : ''}`} onClick={() => setCurrentFilter('unassigned')}>
              Unassigned ({statusCounts['unassigned']})
            </button>
            <button className={`tab ${currentFilter === 'assigned' ? 'active' : ''}`} onClick={() => setCurrentFilter('assigned')}>
              Assigned ({statusCounts['assigned']})
            </button>
            <button className={`tab ${currentFilter === 'installed' ? 'active' : ''}`} onClick={() => setCurrentFilter('installed')}>
              Installed ({statusCounts['installed']})
            </button>
          </div>
        </div>

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
                    {operations.map((op) => (
                      <option key={op.id} value={op.id.toString()}>{op.name}</option>
                    ))}
                  </select>
                  <select value={currentIrrigationType} onChange={(e) => setCurrentIrrigationType(e.target.value)}>
                    <option value="all">All Irrigation</option>
                    <option value="Pivot">Pivot</option>
                    <option value="Gravity">Gravity</option>
                    <option value="Drip">Drip</option>
                    <option value="Dryland">Dryland</option>
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
              {/* Seasonal Data View - Inline Editable */}
              {viewMode === 'seasonal' && (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="desktop-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: '140px' }}>Field</th>
                          <th style={{ minWidth: '100px' }}>Operation</th>
                          <th style={{ minWidth: '90px' }}>Crop</th>
                          <th style={{ minWidth: '90px' }}>Service</th>
                          <th style={{ minWidth: '100px' }}>Probes</th>
                          <th style={{ minWidth: '60px' }}>Route #</th>
                          <th style={{ minWidth: '110px' }}>Installer</th>
                          <th style={{ minWidth: '60px' }}>Ready</th>
                          <th style={{ minWidth: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFields.length === 0 ? (
                          <tr>
                            <td colSpan={9}>
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

                            return (
                              <React.Fragment key={`${field.id}-${field.fieldSeasonId || 'no-season'}`}>
                                <tr>
                                  <td
                                    style={{ fontWeight: 500, cursor: 'pointer' }}
                                    title="Click to view details"
                                    onClick={() => handleRowClick(field)}
                                  >
                                    {field.name}
                                  </td>
                              {needsSeasonStart ? (
                                <>
                                  <td colSpan={7} style={{ textAlign: 'left' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                                        No {currentSeason} season configured
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleQuickStartSeason(field.id, currentSeason);
                                        }}
                                        style={{
                                          padding: '6px 12px',
                                          fontSize: '12px',
                                          fontWeight: 500,
                                          borderRadius: '4px',
                                          border: 'none',
                                          background: 'var(--accent-green)',
                                          color: 'white',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        Start {currentSeason} Season
                                      </button>
                                    </div>
                                  </td>
                                  <td></td>
                                </>
                              ) : (
                                <>
                              <td style={{ color: 'var(--text-secondary)' }}>{field.operation}</td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <InlineCell
                                  fieldSeasonId={field.fieldSeasonId}
                                  field="crop"
                                  value={field.crop}
                                  type="select"
                                  options={[
                                    { value: 'Corn', label: 'Corn' },
                                    { value: 'Soybeans', label: 'Soybeans' },
                                    { value: 'Wheat', label: 'Wheat' },
                                    { value: 'Seed Corn', label: 'Seed Corn' },
                                    { value: 'Other', label: 'Other' },
                                  ]}
                                  onSave={handleInlineSave}
                                  savingFields={savingFields}
                                  savedFields={savedFields}
                                />
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <InlineCell
                                  fieldSeasonId={field.fieldSeasonId}
                                  field="serviceType"
                                  value={field.serviceType}
                                  type="select"
                                  options={[
                                    { value: 'Full Service', label: 'Full Service' },
                                    { value: 'DIY', label: 'DIY' },
                                    { value: 'VRS', label: 'VRS' },
                                  ]}
                                  onSave={handleInlineSave}
                                  savingFields={savingFields}
                                  savedFields={savedFields}
                                />
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                {field.fieldSeasonId ? (
                                  <button
                                    onClick={() => toggleFieldSeasonExpand(field.fieldSeasonId!)}
                                    style={{
                                      background: 'none',
                                      border: '1px solid var(--border)',
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      color: hasProbeAssignments ? 'var(--accent-green)' : 'var(--text-muted)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    {hasProbeAssignments ? (
                                      <>{fieldSeasonProbeAssignments.length} probe{fieldSeasonProbeAssignments.length !== 1 ? 's' : ''}</>
                                    ) : (
                                      <>+ Add</>
                                    )}
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                                )}
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <InlineCell
                                  fieldSeasonId={field.fieldSeasonId}
                                  field="routeOrder"
                                  value={field.routeOrder}
                                  type="number"
                                  onSave={handleInlineSave}
                                  savingFields={savingFields}
                                  savedFields={savedFields}
                                />
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <InlineCell
                                  fieldSeasonId={field.fieldSeasonId}
                                  field="plannedInstaller"
                                  value={field.plannedInstaller}
                                  type="select"
                                  options={[
                                    { value: 'Brian', label: 'Brian' },
                                    { value: 'Daine', label: 'Daine' },
                                    { value: 'Ryan', label: 'Ryan' },
                                    { value: 'Ryan and Kasen', label: 'Ryan and Kasen' },
                                  ]}
                                  onSave={handleInlineSave}
                                  savingFields={savingFields}
                                  savedFields={savedFields}
                                />
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <InlineCell
                                  fieldSeasonId={field.fieldSeasonId}
                                  field="readyToInstall"
                                  value={field.readyToInstall}
                                  type="checkbox"
                                  onSave={handleInlineSave}
                                  savingFields={savingFields}
                                  savedFields={savedFields}
                                />
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="action-btn"
                                  title="View details"
                                  onClick={() => handleRowClick(field)}
                                  style={{ marginRight: '4px' }}
                                >
                                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                {field.fieldSeasonId && (
                                  <button
                                    className="action-btn"
                                    title="Delete season entry"
                                    onClick={() => handleDeleteFieldSeason(field.fieldSeasonId!, field.name, field.season)}
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
                              </td>
                                </>
                              )}
                                </tr>
                                {/* Expanded probe assignment sub-rows */}
                                {isExpanded && field.fieldSeasonId && (
                                  <>
                                    {fieldSeasonProbeAssignments.map((pa) => (
                                      <tr key={`pa-${pa.id}`} style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                        <td style={{ paddingLeft: '32px' }}>
                                          <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>
                                            Probe {pa.probeNumber}
                                          </span>
                                        </td>
                                        <td
                                          colSpan={2}
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
                                              {Number(pa.placementLat).toFixed(4)}, {Number(pa.placementLng).toFixed(4)}
                                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12" style={{ opacity: 0.6 }}>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                              </svg>
                                            </span>
                                          ) : (
                                            <span style={{ color: 'var(--accent-blue)' }}>Set location</span>
                                          )}
                                        </td>
                                        <td colSpan={2} onClick={(e) => e.stopPropagation()}>
                                          <InlineProbeCell
                                            probeAssignmentId={pa.id}
                                            field="probeId"
                                            value={pa.probeId?.toString() || ''}
                                            type="select"
                                            options={sortedProbes.map(p => ({
                                              value: p.id.toString(),
                                              label: `#${p.serialNumber} (${p.isAssigned && p.id !== pa.probeId ? 'Assigned' : p.ownerBillingEntity})`,
                                            }))}
                                            onSave={handleProbeAssignmentSave}
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
                                              { value: 'Installed', label: 'Installed' },
                                              { value: 'RMA', label: 'RMA' },
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
                                              { value: 'Short', label: 'Short' },
                                              { value: 'Tall', label: 'Tall' },
                                            ]}
                                            onSave={handleProbeAssignmentSave}
                                            savingFields={savingFields}
                                            savedFields={savedFields}
                                          />
                                        </td>
                                        <td colSpan={2} onClick={(e) => e.stopPropagation()}>
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
                                    ))}
                                    {/* Add probe assignment row */}
                                    <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                      <td colSpan={11} style={{ paddingLeft: '32px' }}>
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
                                  </>
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
                            <div className="mobile-card-row"><span>Operation:</span> {field.operation}</div>
                            <div className="mobile-card-row"><span>Crop:</span> {field.crop}</div>
                            <div className="mobile-card-row"><span>Probe:</span> {field.probe || '—'}</div>
                            <div className="mobile-card-row"><span>Route #:</span> {field.routeOrder || '—'}</div>
                            <div className="mobile-card-row"><span>Installer:</span> {field.plannedInstaller || '—'}</div>
                            <div className="mobile-card-row"><span>Ready:</span> {field.readyToInstall ? 'Yes' : 'No'}</div>
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
                </>
              )}

              {/* Permanent Data View - Read-only with click to edit */}
              {viewMode === 'permanent' && (
                <>
                  <table className="desktop-table">
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => handleSort('name')}>
                          Field Name
                          {sortColumn === 'name' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                        </th>
                        <th className="sortable" onClick={() => handleSort('operation')}>
                          Operation
                          {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                        </th>
                        <th>Seasons</th>
                        <th className="sortable" onClick={() => handleSort('acres')}>
                          Acres
                          {sortColumn === 'acres' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                        </th>
                        <th>Irrigation</th>
                        <th>Row Dir</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFields.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <EmptyState
                              icon={searchQuery ? 'search' : 'fields'}
                              title={searchQuery ? 'No matching fields' : 'No fields yet'}
                              description={searchQuery ? 'Try a different search term' : 'Add your first field to get started'}
                              action={!searchQuery ? { label: 'Add Field', onClick: () => setShowAddModal(true) } : undefined}
                            />
                          </td>
                        </tr>
                      ) : (
                        filteredFields.map((field) => {
                          const seasonInfo = fieldSeasonsMap.get(field.id);
                          // existingSeasons is now a Map<season, fieldSeasonId>
                          const existingSeasonsMap = seasonInfo?.existing || new Map();
                          const existingSeasonsList = Array.from(existingSeasonsMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
                          const missingSeasons = seasonInfo?.missing || [];

                          return (
                            <tr key={`${field.id}-${field.fieldSeasonId}`} onClick={() => handleRowClick(field)} style={{ cursor: 'pointer' }}>
                              <td className="operation-name">{field.name}</td>
                              <td style={{ fontSize: '13px' }}>{field.operation}</td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  {existingSeasonsList.map(([season, fieldSeasonId]) => (
                                    <span key={season} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                      {season}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteSeason(fieldSeasonId, season); }}
                                        title={`Delete ${season} season`}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: 'var(--text-muted)',
                                          cursor: 'pointer',
                                          padding: '0 2px',
                                          fontSize: '14px',
                                          lineHeight: 1,
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                  <select
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      borderRadius: '4px',
                                      border: '1px solid var(--accent-green)',
                                      background: 'var(--bg-secondary)',
                                      color: 'var(--accent-green)',
                                      cursor: 'pointer',
                                    }}
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value === 'custom') {
                                        const customYear = prompt('Enter year (e.g., 2030):');
                                        if (customYear && /^\d{4}$/.test(customYear.trim())) {
                                          handleQuickStartSeason(field.id, customYear.trim());
                                        } else if (customYear) {
                                          alert('Please enter a valid 4-digit year');
                                        }
                                      } else if (e.target.value) {
                                        handleQuickStartSeason(field.id, e.target.value);
                                      }
                                    }}
                                  >
                                    <option value="">+ Start Season</option>
                                    {missingSeasons.map((s) => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                    <option value="custom">New Year</option>
                                  </select>
                                </div>
                              </td>
                              <td className="field-count">{field.acres}</td>
                              <td>{field.irrigationType || '—'}</td>
                              <td>{field.rowDirection || '—'}</td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <button className="action-btn" title="Edit" onClick={() => handleRowClick(field)}>
                                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  <div className="mobile-cards">
                    {filteredFields.length === 0 ? (
                      <EmptyState
                        icon={searchQuery ? 'search' : 'fields'}
                        title={searchQuery ? 'No matching fields' : 'No fields yet'}
                        description={searchQuery ? 'Try a different search term' : 'Add your first field to get started'}
                        action={!searchQuery ? { label: 'Add Field', onClick: () => setShowAddModal(true) } : undefined}
                      />
                    ) : (
                      filteredFields.map((field) => (
                        <div key={`${field.id}-${field.fieldSeasonId}`} className="mobile-card" onClick={() => handleRowClick(field)}>
                          <div className="mobile-card-header">
                            <span className="mobile-card-title">{field.name}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{field.irrigationType || 'Unknown'}</span>
                          </div>
                          <div className="mobile-card-body">
                            <div className="mobile-card-row"><span>Operation:</span> {field.operation}</div>
                            <div className="mobile-card-row"><span>Acres:</span> {field.acres}</div>
                            <div className="mobile-card-row"><span>Row Direction:</span> {field.rowDirection || '—'}</div>
                            <div className="mobile-card-row"><span>Elevation:</span> {field.elevation ? `${field.elevation} ft` : '—'}</div>
                            <div className="mobile-card-row"><span>Soil Type:</span> {field.soilType || '—'}</div>
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
                </>
              )}
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
                            <option value="Pivot">Pivot</option>
                            <option value="Gravity">Gravity</option>
                            <option value="Drip">Drip</option>
                            <option value="Dryland">Dryland</option>
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
          <div className="detail-panel-overlay" onClick={() => setShowSeasonFieldsEdit(false)}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>Edit {selectedField.season} Season</h3>
                <button className="close-btn" onClick={() => setShowSeasonFieldsEdit(false)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                <div className="edit-form">
                  <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    Edit seasonal data for <strong>{selectedField.name}</strong> in the {selectedField.season} season.
                  </p>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Crop</label>
                      <select value={seasonFieldsForm.crop} onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, crop: e.target.value })}>
                        <option value="">Select crop...</option>
                        <option value="Corn">Corn</option>
                        <option value="Soybeans">Soybeans</option>
                        <option value="Wheat">Wheat</option>
                        <option value="Seed Corn">Seed Corn</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Service Type</label>
                      <select value={seasonFieldsForm.service_type} onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, service_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="CropX Complete DIY">CropX Complete DIY</option>
                        <option value="CropX DIY">CropX DIY</option>
                        <option value="CropX DIY 2x Field">CropX DIY 2x Field</option>
                        <option value="CropX DIY 2x Field Bulk">CropX DIY 2x Field Bulk</option>
                        <option value="CropX DIY Bulk">CropX DIY Bulk</option>
                        <option value="CropX DIY + $100 Roeder">CropX DIY + $100 Roeder</option>
                        <option value="CropX Regular">CropX Regular</option>
                        <option value="CropX Regular 2x Field">CropX Regular 2x Field</option>
                        <option value="CropX Regular 2x Field Bulk">CropX Regular 2x Field Bulk</option>
                        <option value="CropX Regular Bulk">CropX Regular Bulk</option>
                        <option value="CropX Regular Family Rate">CropX Regular Family Rate</option>
                        <option value="CropX Regular Olsen Rate">CropX Regular Olsen Rate</option>
                        <option value="CropX Regular Small Field">CropX Regular Small Field</option>
                        <option value="CropX Regular Dryland">CropX Regular Dryland</option>
                        <option value="IrriMax Live">IrriMax Live</option>
                        <option value="IrriMax Live – Ryan Cost">IrriMax Live – Ryan Cost</option>
                        <option value="Overview Field">Overview Field</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Antenna Type</label>
                      <select value={seasonFieldsForm.antenna_type} onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, antenna_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="10' CropX Antenna">10' CropX Antenna</option>
                        <option value="10' Sentek Antenna">10' Sentek Antenna</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Battery Type</label>
                      <select value={seasonFieldsForm.battery_type} onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, battery_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="CropX">CropX</option>
                        <option value="Sentek Used">Sentek Used</option>
                        <option value="Sentek New">Sentek New</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Side Dress</label>
                      <select value={seasonFieldsForm.side_dress} onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, side_dress: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="None">None</option>
                        <option value="Cultivate">Cultivate</option>
                        <option value="Coulter 7&quot; off Row">Coulter 7&quot; off Row</option>
                        <option value="Cultivation Likely">Cultivation Likely</option>
                        <option value="High Y-Drop">High Y-Drop</option>
                        <option value="Coulter">Coulter</option>
                        <option value="Sprayer Drops">Sprayer Drops</option>
                        <option value="Pivot">Pivot</option>
                        <option value="Low Y-Drop">Low Y-Drop</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Logger ID</label>
                      <input
                        type="text"
                        value={seasonFieldsForm.logger_id}
                        onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, logger_id: e.target.value })}
                        placeholder="e.g., 7080859"
                      />
                    </div>
                    <div className="form-group">
                      <label>Early Removal</label>
                      <select value={seasonFieldsForm.early_removal} onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, early_removal: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Regular">Regular</option>
                        <option value="Silage">Silage</option>
                        <option value="Soybeans">Soybeans</option>
                        <option value="HMC">HMC</option>
                        <option value="HMC – Oct 1">HMC – Oct 1</option>
                        <option value="Dummy Probe – Drip">Dummy Probe – Drip</option>
                        <option value="Popcorn">Popcorn</option>
                        <option value="HMC Maybe">HMC Maybe</option>
                        <option value="Early Incentive Corn">Early Incentive Corn</option>
                        <option value="Seed Corn">Seed Corn</option>
                        <option value="Sorghum">Sorghum</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Hybrid/Variety</label>
                      <input
                        type="text"
                        value={seasonFieldsForm.hybrid_variety}
                        onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, hybrid_variety: e.target.value })}
                        placeholder="e.g., P1185AM"
                      />
                    </div>
                    <div className="form-group">
                      <label>Ready to Remove</label>
                      <select value={seasonFieldsForm.ready_to_remove} onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, ready_to_remove: e.target.value })}>
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
                        value={seasonFieldsForm.planting_date}
                        onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, planting_date: e.target.value })}
                      />
                    </div>
                    <div className="form-group"></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Probe 1</label>
                      <select value={selectedProbeId} onChange={(e) => setSelectedProbeId(e.target.value)}>
                        <option value="">— No Probe —</option>
                        {sortedProbes.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.serialNumber} ({p.isAssigned && p.id.toString() !== selectedProbeId ? 'Assigned' : p.ownerBillingEntity})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Probe 2 (Optional)</label>
                      <select value={selectedProbe2Id} onChange={(e) => setSelectedProbe2Id(e.target.value)}>
                        <option value="">— No Probe —</option>
                        {sortedProbes.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.serialNumber} ({p.isAssigned && p.id.toString() !== selectedProbe2Id ? 'Assigned' : p.ownerBillingEntity})
                          </option>
                        ))}
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
                          value={seasonFieldsForm.route_order}
                          onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, route_order: e.target.value })}
                          placeholder="e.g., 1, 2, 3..."
                          min="1"
                        />
                      </div>
                      <div className="form-group">
                        <label>Planned Installer</label>
                        <select value={seasonFieldsForm.planned_installer} onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, planned_installer: e.target.value })}>
                          <option value="">Select...</option>
                          <option value="Brian">Brian</option>
                          <option value="Daine">Daine</option>
                          <option value="Ryan">Ryan</option>
                          <option value="Ryan and Kasen">Ryan and Kasen</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={seasonFieldsForm.ready_to_install}
                          onChange={(e) => setSeasonFieldsForm({ ...seasonFieldsForm, ready_to_install: e.target.checked })}
                          style={{ width: '18px', height: '18px' }}
                        />
                        Ready to Install
                      </label>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Check this when the field is confirmed and ready for the installer to visit.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="detail-panel-footer">
                <button className="btn btn-secondary" onClick={() => {
                  setShowSeasonFieldsEdit(false);
                  setSeasonFieldsForm({
                    crop: selectedField.crop || '',
                    service_type: selectedField.serviceType || '',
                    antenna_type: selectedField.antennaType || '',
                    battery_type: selectedField.batteryType || '',
                    side_dress: selectedField.sideDress || '',
                    logger_id: selectedField.loggerId || '',
                    early_removal: selectedField.earlyRemoval || '',
                    hybrid_variety: selectedField.hybridVariety || '',
                    ready_to_remove: selectedField.readyToRemove || '',
                    planting_date: selectedField.plantingDate || '',
                    route_order: selectedField.routeOrder?.toString() || '',
                    planned_installer: selectedField.plannedInstaller || '',
                    ready_to_install: selectedField.readyToInstall || false,
                  });
                  setSelectedProbeId(selectedField.probeId?.toString() || '');
                  setSelectedProbe2Id(selectedField.probe2Id?.toString() || '');
                }}>Cancel</button>
                <button className="btn btn-primary" onClick={async () => {
                  if (!selectedField.fieldSeasonId) return;
                  setSavingSeasonFields(true);
                  try {
                    const probeId = selectedProbeId ? parseInt(selectedProbeId, 10) : null;
                    const probe2Id = selectedProbe2Id ? parseInt(selectedProbe2Id, 10) : null;
                    const response = await fetch(`/api/field-seasons/${selectedField.fieldSeasonId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        crop: seasonFieldsForm.crop || null,
                        service_type: seasonFieldsForm.service_type || null,
                        antenna_type: seasonFieldsForm.antenna_type || null,
                        battery_type: seasonFieldsForm.battery_type || null,
                        side_dress: seasonFieldsForm.side_dress || null,
                        logger_id: seasonFieldsForm.logger_id || null,
                        early_removal: seasonFieldsForm.early_removal || null,
                        hybrid_variety: seasonFieldsForm.hybrid_variety || null,
                        ready_to_remove: seasonFieldsForm.ready_to_remove || null,
                        planting_date: seasonFieldsForm.planting_date || null,
                        probe: probeId,
                        probe_status: probeId ? 'Assigned' : 'Unassigned',
                        probe_2: probe2Id,
                        probe_2_status: probe2Id ? 'Assigned' : 'Unassigned',
                        route_order: seasonFieldsForm.route_order ? parseInt(seasonFieldsForm.route_order, 10) : null,
                        planned_installer: seasonFieldsForm.planned_installer || null,
                        ready_to_install: seasonFieldsForm.ready_to_install,
                      }),
                    });
                    if (response.ok) {
                      setShowSeasonFieldsEdit(false);
                      window.location.reload();
                    } else {
                      const error = await response.json();
                      alert(error.error || 'Failed to update season');
                    }
                  } catch (error) {
                    console.error('Save error:', error);
                    alert('Failed to update season');
                  } finally {
                    setSavingSeasonFields(false);
                  }
                }} disabled={savingSeasonFields}>
                  {savingSeasonFields ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Field Modal */}
        {showAddModal && (
          <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>Add New Field</h3>
                <button className="close-btn" onClick={() => setShowAddModal(false)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="detail-panel-content">
                <div className="edit-form">
                  <div className="form-group">
                    <label>Billing Entity *</label>
                    <select value={addForm.billing_entity} onChange={(e) => setAddForm({ ...addForm, billing_entity: e.target.value })}>
                      <option value="">Select billing entity...</option>
                      {billingEntities.map((be) => (
                        <option key={be.id} value={be.id}>{be.name} ({be.operationName})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Field Name *</label>
                    <input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Enter field name" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Acres</label>
                      <input type="number" value={addForm.acres} onChange={(e) => setAddForm({ ...addForm, acres: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Pivot Acres</label>
                      <input type="number" value={addForm.pivot_acres} onChange={(e) => setAddForm({ ...addForm, pivot_acres: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Latitude</label>
                      <input type="number" step="any" value={addForm.lat} onChange={(e) => setAddForm({ ...addForm, lat: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Longitude</label>
                      <input type="number" step="any" value={addForm.lng} onChange={(e) => setAddForm({ ...addForm, lng: e.target.value })} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="location-btn"
                    onClick={() => {
                      setLocationPickerTarget('add');
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
                      <select value={addForm.water_source} onChange={(e) => setAddForm({ ...addForm, water_source: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Well">Well</option>
                        <option value="Canal">Canal</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Fuel Source</label>
                      <select value={addForm.fuel_source} onChange={(e) => setAddForm({ ...addForm, fuel_source: e.target.value })}>
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
                    <textarea value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} rows={2} />
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
                  <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>Season Info ({addForm.season})</h4>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Season</label>
                      <select value={addForm.season} onChange={(e) => setAddForm({ ...addForm, season: e.target.value })}>
                        <option value="2027">2027</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Crop</label>
                      <select value={addForm.crop} onChange={(e) => setAddForm({ ...addForm, crop: e.target.value })}>
                        <option value="">Select crop...</option>
                        <option value="Corn">Corn</option>
                        <option value="Soybeans">Soybeans</option>
                        <option value="Wheat">Wheat</option>
                        <option value="Seed Corn">Seed Corn</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Service Type</label>
                      <select value={addForm.service_type} onChange={(e) => setAddForm({ ...addForm, service_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="CropX Complete DIY">CropX Complete DIY</option>
                        <option value="CropX DIY">CropX DIY</option>
                        <option value="CropX DIY 2x Field">CropX DIY 2x Field</option>
                        <option value="CropX DIY 2x Field Bulk">CropX DIY 2x Field Bulk</option>
                        <option value="CropX DIY Bulk">CropX DIY Bulk</option>
                        <option value="CropX DIY + $100 Roeder">CropX DIY + $100 Roeder</option>
                        <option value="CropX Regular">CropX Regular</option>
                        <option value="CropX Regular 2x Field">CropX Regular 2x Field</option>
                        <option value="CropX Regular 2x Field Bulk">CropX Regular 2x Field Bulk</option>
                        <option value="CropX Regular Bulk">CropX Regular Bulk</option>
                        <option value="CropX Regular Family Rate">CropX Regular Family Rate</option>
                        <option value="CropX Regular Olsen Rate">CropX Regular Olsen Rate</option>
                        <option value="CropX Regular Small Field">CropX Regular Small Field</option>
                        <option value="CropX Regular Dryland">CropX Regular Dryland</option>
                        <option value="IrriMax Live">IrriMax Live</option>
                        <option value="IrriMax Live – Ryan Cost">IrriMax Live – Ryan Cost</option>
                        <option value="Overview Field">Overview Field</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Antenna Type</label>
                      <select value={addForm.antenna_type} onChange={(e) => setAddForm({ ...addForm, antenna_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Short">Short</option>
                        <option value="Tall">Tall</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Battery Type</label>
                      <select value={addForm.battery_type} onChange={(e) => setAddForm({ ...addForm, battery_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="CropX">CropX</option>
                        <option value="Sentek Used">Sentek Used</option>
                        <option value="Sentek New">Sentek New</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Side Dress</label>
                      <select value={addForm.side_dress} onChange={(e) => setAddForm({ ...addForm, side_dress: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="None">None</option>
                        <option value="Cultivate">Cultivate</option>
                        <option value="Coulter 7&quot; off Row">Coulter 7&quot; off Row</option>
                        <option value="Cultivation Likely">Cultivation Likely</option>
                        <option value="High Y-Drop">High Y-Drop</option>
                        <option value="Coulter">Coulter</option>
                        <option value="Sprayer Drops">Sprayer Drops</option>
                        <option value="Pivot">Pivot</option>
                        <option value="Low Y-Drop">Low Y-Drop</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Logger ID</label>
                      <input
                        type="text"
                        value={addForm.logger_id}
                        onChange={(e) => setAddForm({ ...addForm, logger_id: e.target.value })}
                        placeholder="e.g., 7080859"
                      />
                    </div>
                    <div className="form-group">
                      <label>Early Removal</label>
                      <select value={addForm.early_removal} onChange={(e) => setAddForm({ ...addForm, early_removal: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Regular">Regular</option>
                        <option value="Silage">Silage</option>
                        <option value="Soybeans">Soybeans</option>
                        <option value="HMC">HMC</option>
                        <option value="HMC – Oct 1">HMC – Oct 1</option>
                        <option value="Dummy Probe – Drip">Dummy Probe – Drip</option>
                        <option value="Popcorn">Popcorn</option>
                        <option value="HMC Maybe">HMC Maybe</option>
                        <option value="Early Incentive Corn">Early Incentive Corn</option>
                        <option value="Seed Corn">Seed Corn</option>
                        <option value="Sorghum">Sorghum</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Hybrid/Variety</label>
                      <input
                        type="text"
                        value={addForm.hybrid_variety}
                        onChange={(e) => setAddForm({ ...addForm, hybrid_variety: e.target.value })}
                        placeholder="e.g., P1185AM"
                      />
                    </div>
                    <div className="form-group">
                      <label>Ready to Remove</label>
                      <select value={addForm.ready_to_remove} onChange={(e) => setAddForm({ ...addForm, ready_to_remove: e.target.value })}>
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
                        value={addForm.planting_date}
                        onChange={(e) => setAddForm({ ...addForm, planting_date: e.target.value })}
                      />
                    </div>
                    <div className="form-group"></div>
                  </div>
                </div>
              </div>
              <div className="detail-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddField} disabled={saving}>
                  {saving ? 'Creating...' : 'Create Field'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Season Modal */}
        {showAddSeasonModal && selectedField && (
          <div className="detail-panel-overlay" onClick={() => setShowAddSeasonModal(false)}>
            <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="detail-panel-header">
                <h3>Add Season for {selectedField.name}</h3>
                <button className="close-btn" onClick={() => setShowAddSeasonModal(false)}>
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
                      <select value={addSeasonForm.season} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, season: e.target.value })}>
                        {missingSeasonsForField.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Crop</label>
                      <select value={addSeasonForm.crop} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, crop: e.target.value })}>
                        <option value="">Select crop...</option>
                        <option value="Corn">Corn</option>
                        <option value="Soybeans">Soybeans</option>
                        <option value="Wheat">Wheat</option>
                        <option value="Seed Corn">Seed Corn</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Service Type</label>
                      <select value={addSeasonForm.service_type} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, service_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="CropX Complete DIY">CropX Complete DIY</option>
                        <option value="CropX DIY">CropX DIY</option>
                        <option value="CropX DIY 2x Field">CropX DIY 2x Field</option>
                        <option value="CropX DIY 2x Field Bulk">CropX DIY 2x Field Bulk</option>
                        <option value="CropX DIY Bulk">CropX DIY Bulk</option>
                        <option value="CropX DIY + $100 Roeder">CropX DIY + $100 Roeder</option>
                        <option value="CropX Regular">CropX Regular</option>
                        <option value="CropX Regular 2x Field">CropX Regular 2x Field</option>
                        <option value="CropX Regular 2x Field Bulk">CropX Regular 2x Field Bulk</option>
                        <option value="CropX Regular Bulk">CropX Regular Bulk</option>
                        <option value="CropX Regular Family Rate">CropX Regular Family Rate</option>
                        <option value="CropX Regular Olsen Rate">CropX Regular Olsen Rate</option>
                        <option value="CropX Regular Small Field">CropX Regular Small Field</option>
                        <option value="CropX Regular Dryland">CropX Regular Dryland</option>
                        <option value="IrriMax Live">IrriMax Live</option>
                        <option value="IrriMax Live – Ryan Cost">IrriMax Live – Ryan Cost</option>
                        <option value="Overview Field">Overview Field</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Antenna Type</label>
                      <select value={addSeasonForm.antenna_type} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, antenna_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Short">Short</option>
                        <option value="Tall">Tall</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Battery Type</label>
                      <select value={addSeasonForm.battery_type} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, battery_type: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="CropX">CropX</option>
                        <option value="Sentek Used">Sentek Used</option>
                        <option value="Sentek New">Sentek New</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Side Dress</label>
                      <select value={addSeasonForm.side_dress} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, side_dress: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="None">None</option>
                        <option value="Cultivate">Cultivate</option>
                        <option value="Coulter 7&quot; off Row">Coulter 7&quot; off Row</option>
                        <option value="Cultivation Likely">Cultivation Likely</option>
                        <option value="High Y-Drop">High Y-Drop</option>
                        <option value="Coulter">Coulter</option>
                        <option value="Sprayer Drops">Sprayer Drops</option>
                        <option value="Pivot">Pivot</option>
                        <option value="Low Y-Drop">Low Y-Drop</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Logger ID</label>
                      <input
                        type="text"
                        value={addSeasonForm.logger_id}
                        onChange={(e) => setAddSeasonForm({ ...addSeasonForm, logger_id: e.target.value })}
                        placeholder="e.g., 7080859"
                      />
                    </div>
                    <div className="form-group">
                      <label>Early Removal</label>
                      <select value={addSeasonForm.early_removal} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, early_removal: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Regular">Regular</option>
                        <option value="Silage">Silage</option>
                        <option value="Soybeans">Soybeans</option>
                        <option value="HMC">HMC</option>
                        <option value="HMC – Oct 1">HMC – Oct 1</option>
                        <option value="Dummy Probe – Drip">Dummy Probe – Drip</option>
                        <option value="Popcorn">Popcorn</option>
                        <option value="HMC Maybe">HMC Maybe</option>
                        <option value="Early Incentive Corn">Early Incentive Corn</option>
                        <option value="Seed Corn">Seed Corn</option>
                        <option value="Sorghum">Sorghum</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Hybrid/Variety</label>
                      <input
                        type="text"
                        value={addSeasonForm.hybrid_variety}
                        onChange={(e) => setAddSeasonForm({ ...addSeasonForm, hybrid_variety: e.target.value })}
                        placeholder="e.g., P1185AM"
                      />
                    </div>
                    <div className="form-group">
                      <label>Ready to Remove</label>
                      <select value={addSeasonForm.ready_to_remove} onChange={(e) => setAddSeasonForm({ ...addSeasonForm, ready_to_remove: e.target.value })}>
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
                        value={addSeasonForm.planting_date}
                        onChange={(e) => setAddSeasonForm({ ...addSeasonForm, planting_date: e.target.value })}
                      />
                    </div>
                    <div className="form-group"></div>
                  </div>
                </div>
              </div>
              <div className="detail-panel-footer">
                <button className="btn btn-secondary" onClick={() => setShowAddSeasonModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddSeason} disabled={savingSeason}>
                  {savingSeason ? 'Creating...' : 'Create Season'}
                </button>
              </div>
            </div>
          </div>
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

        {/* Location Picker */}
        {showLocationPicker && (
          <LocationPicker
            lat={
              locationPickerTarget === 'edit'
                ? (editForm.lat ? Number(editForm.lat) : null)
                : locationPickerTarget === 'probeAssignment'
                  ? (editingProbeAssignmentLocation?.placementLat ?? null)
                  : (addForm.lat ? parseFloat(addForm.lat) : null)
            }
            lng={
              locationPickerTarget === 'edit'
                ? (editForm.lng ? Number(editForm.lng) : null)
                : locationPickerTarget === 'probeAssignment'
                  ? (editingProbeAssignmentLocation?.placementLng ?? null)
                  : (addForm.lng ? parseFloat(addForm.lng) : null)
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
                setAddForm({ ...addForm, lat: lat.toString(), lng: lng.toString() });
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
