'use client';

import React, { useState, useEffect } from 'react';
import InlineCell from '@/components/InlineCell';
import type { ProcessedField } from '@/app/fields/page';

// Inline editable cell for field-level (not season-level) data
function InlineFieldSelect({ fieldId, apiField, value, options, savingFields, savedFields, onSave }: {
  fieldId: number; apiField: string; value: string | null | undefined;
  options: { value: string; label: string }[];
  savingFields: Set<string>; savedFields: Set<string>;
  onSave: (fieldId: number, field: string, value: unknown) => void;
}) {
  const cellKey = `field-${fieldId}-${apiField}`;
  const isSaving = savingFields.has(cellKey);
  const justSaved = savedFields.has(cellKey);
  return (
    <div style={{ position: 'relative' }}>
      <select value={value || ''} onChange={(e) => onSave(fieldId, apiField, e.target.value || null)} disabled={isSaving}
        style={{ width: '100%', padding: '4px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px',
          background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)', transition: 'background 0.3s' }}>
        <option value="">—</option>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      {isSaving && <span style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>}
    </div>
  );
}

function InlineFieldNumber({ fieldId, apiField, value, savingFields, savedFields, onSave, step }: {
  fieldId: number; apiField: string; value: number | string | null | undefined;
  savingFields: Set<string>; savedFields: Set<string>;
  onSave: (fieldId: number, field: string, value: unknown) => void;
  step?: string;
}) {
  const cellKey = `field-${fieldId}-${apiField}`;
  const isSaving = savingFields.has(cellKey);
  const justSaved = savedFields.has(cellKey);
  const [local, setLocal] = useState(value?.toString() || '');
  useEffect(() => { setLocal(value?.toString() || ''); }, [value]);
  return (
    <div style={{ position: 'relative' }}>
      <input type="number" step={step || 'any'} value={local} onChange={(e) => setLocal(e.target.value)} disabled={isSaving}
        onBlur={() => {
          const num = local ? parseFloat(local) : null;
          if (num !== (value ?? null)) onSave(fieldId, apiField, num);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ width: '100%', padding: '4px 6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '4px',
          background: justSaved ? 'var(--accent-green-dim)' : 'var(--bg-secondary)', transition: 'background 0.3s' }} />
      {isSaving && <span style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)' }}>...</span>}
    </div>
  );
}

type FieldColumnKey =
  | 'field' | 'operation' | 'billingEntity' | 'crop' | 'service' | 'cropConfirmed'
  | 'hybrid' | 'antenna' | 'battery' | 'sideDress' | 'loggerId' | 'probes'
  | 'routeOrder' | 'plannedInstaller' | 'readyToInstall' | 'nrcsField'
  | 'probeStatus' | 'installDate' | 'installer' | 'approvalStatus'
  | 'removalDate' | 'removalNotes' | 'readyToRemove' | 'earlyRemoval'
  | 'acres' | 'pivotAcres' | 'irrigationType' | 'rowDirection'
  | 'waterSource' | 'fuelSource' | 'elevation' | 'soilType' | 'fieldDirections';

export const COLUMN_MIN_WIDTHS: Record<FieldColumnKey, string> = {
  field: '140px', operation: '100px', billingEntity: '120px', crop: '90px',
  service: '90px', cropConfirmed: '60px', hybrid: '100px', antenna: '90px',
  battery: '90px', sideDress: '80px', loggerId: '80px', probes: '100px',
  routeOrder: '60px', plannedInstaller: '110px', readyToInstall: '60px', nrcsField: '60px',
  probeStatus: '100px', installDate: '100px', installer: '100px',
  approvalStatus: '100px', removalDate: '100px', removalNotes: '150px',
  readyToRemove: '60px', earlyRemoval: '60px',
  acres: '80px', pivotAcres: '90px', irrigationType: '110px', rowDirection: '100px',
  waterSource: '100px', fuelSource: '100px', elevation: '80px', soilType: '100px',
  fieldDirections: '150px',
};

interface RenderCellProps {
  colKey: FieldColumnKey;
  field: ProcessedField;
  hasProbeAssignments: boolean;
  probeAssignmentCount: number;
  hasDuplicateProbeLocation: boolean;
  isExpanded: boolean;
  serviceTypeOptions: { value: string; label: string }[];
  savingFields: Set<string>;
  savedFields: Set<string>;
  onRowClick: (field: ProcessedField) => void;
  onInlineSave: (fieldSeasonId: number, field: string, value: unknown) => Promise<void>;
  onInlineFieldSave: (fieldId: number, field: string, value: unknown) => void;
  onToggleExpand: (fieldSeasonId: number) => void;
}

export function FieldCell({
  colKey,
  field,
  hasProbeAssignments,
  probeAssignmentCount,
  hasDuplicateProbeLocation,
  isExpanded,
  serviceTypeOptions,
  savingFields,
  savedFields,
  onRowClick,
  onInlineSave,
  onInlineFieldSave,
  onToggleExpand,
}: RenderCellProps) {
  switch (colKey) {
    case 'field':
      return (
        <td key={colKey} style={{ fontWeight: 500, cursor: 'pointer' }} title="Click to view details" onClick={() => onRowClick(field)}>
          {field.name}
        </td>
      );
    case 'operation':
      return <td key={colKey} style={{ color: 'var(--text-secondary)' }}>{field.operation}</td>;
    case 'billingEntity':
      return <td key={colKey} style={{ color: 'var(--text-secondary)' }}>{field.billingEntityName || '—'}</td>;
    case 'crop':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="crop" value={field.crop} type="select"
            options={[{ value: 'Corn', label: 'Corn' }, { value: 'Soybeans', label: 'Soybeans' }, { value: 'Wheat', label: 'Wheat' }, { value: 'Seed Corn', label: 'Seed Corn' }, { value: 'Other', label: 'Other' }]}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'service':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="serviceType" value={field.serviceType} type="select" options={serviceTypeOptions}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'cropConfirmed':
      return <td key={colKey}>{field.crop && field.crop !== 'Unknown' ? '✓' : '—'}</td>;
    case 'hybrid':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="hybridVariety" value={field.hybridVariety} type="text"
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'antenna':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="antennaType" value={field.antennaType} type="select"
            options={[{ value: 'Sentek Stub', label: 'Sentek Stub' }, { value: 'CropX Stub', label: 'CropX Stub' }, { value: "Sentek 10'", label: "Sentek 10'" }, { value: "CropX 10'", label: "CropX 10'" }, { value: "CropX 6'", label: "CropX 6'" }, { value: 'ASK', label: 'ASK' }]}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'battery':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="batteryType" value={field.batteryType} type="select"
            options={[{ value: 'CropX', label: 'CropX' }, { value: 'Sentek New', label: 'Sentek New' }, { value: 'Sentek Used', label: 'Sentek Used' }]}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'sideDress':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="sideDress" value={field.sideDress} type="select"
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'loggerId':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="loggerId" value={field.loggerId} type="text"
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'probes':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          {field.fieldSeasonId ? (
            <button onClick={() => onToggleExpand(field.fieldSeasonId!)}
              style={{ background: 'none', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px',
                color: (hasProbeAssignments || field.probe) ? 'var(--accent-green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {hasDuplicateProbeLocation && <span title="Same location" style={{ color: '#f59e0b', fontSize: '13px', lineHeight: 1 }}>&#9888;</span>}
                {hasProbeAssignments ? <>{probeAssignmentCount} probe{probeAssignmentCount !== 1 ? 's' : ''}</> : field.probe ? <>{field.probe}{field.probe2 ? `, ${field.probe2}` : ''}</> : <>+ Add</>}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        </td>
      );
    case 'routeOrder':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="routeOrder" value={field.routeOrder} type="number"
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'plannedInstaller':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="plannedInstaller" value={field.plannedInstaller} type="select"
            options={[{ value: 'Brian', label: 'Brian' }, { value: 'Daine', label: 'Daine' }, { value: 'Ryan', label: 'Ryan' }, { value: 'Ryan and Kasen', label: 'Ryan and Kasen' }]}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'readyToInstall':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="readyToInstall" value={field.readyToInstall} type="checkbox"
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'nrcsField': {
      const nrcsCellKey = `field-${field.id}-nrcs_field`;
      const nrcsSaving = savingFields.has(nrcsCellKey);
      const nrcsSaved = savedFields.has(nrcsCellKey);
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              checked={!!field.nrcsField}
              onChange={(e) => onInlineFieldSave(field.id, 'nrcs_field', e.target.checked)}
              disabled={nrcsSaving}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            {nrcsSaving && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...</span>}
            {nrcsSaved && <span style={{ fontSize: '10px', color: 'var(--accent-green)' }}>✓</span>}
          </div>
        </td>
      );
    }
    case 'probeStatus':
      return <td key={colKey}><span style={{ color: field.probeStatus === 'Installed' ? 'var(--accent-green)' : 'var(--text-muted)' }}>{field.probeStatus || '—'}</span></td>;
    case 'installDate':
      return <td key={colKey}>{field.installDate || '—'}</td>;
    case 'installer':
      return <td key={colKey}>{field.installer || '—'}</td>;
    case 'approvalStatus':
      return <td key={colKey}><span style={{ color: field.approvalStatus === 'Approved' ? 'var(--accent-green)' : field.approvalStatus === 'Rejected' ? 'var(--accent-red)' : 'var(--text-muted)' }}>{field.approvalStatus || 'Pending'}</span></td>;
    case 'removalDate':
      return <td key={colKey}>{field.removalDate || '—'}</td>;
    case 'removalNotes':
      return <td key={colKey} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={field.removalNotes || ''}>{field.removalNotes || '—'}</td>;
    case 'readyToRemove':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="readyToRemove" value={field.readyToRemove} type="select"
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'earlyRemoval':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="earlyRemoval" value={field.earlyRemoval} type="select"
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'acres':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineFieldNumber fieldId={field.id} apiField="acres" value={field.acres} step="0.01"
            savingFields={savingFields} savedFields={savedFields} onSave={onInlineFieldSave} />
        </td>
      );
    case 'pivotAcres':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineFieldNumber fieldId={field.id} apiField="pivot_acres" value={field.pivotAcres} step="0.01"
            savingFields={savingFields} savedFields={savedFields} onSave={onInlineFieldSave} />
        </td>
      );
    case 'irrigationType':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineFieldSelect fieldId={field.id} apiField="irrigation_type" value={field.irrigationType}
            options={[{ value: 'Drip', label: 'Drip' }, { value: 'Dryland', label: 'Dryland' }, { value: 'Gravity', label: 'Gravity' }, { value: 'Pivot', label: 'Pivot' }, { value: 'Pivot - Corner System', label: 'Pivot - Corner System' }, { value: 'Pivot - Wiper', label: 'Pivot - Wiper' }]}
            savingFields={savingFields} savedFields={savedFields} onSave={onInlineFieldSave} />
        </td>
      );
    case 'rowDirection':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineFieldSelect fieldId={field.id} apiField="row_direction" value={field.rowDirection}
            options={[{ value: 'N-S', label: 'N-S' }, { value: 'E-W', label: 'E-W' }, { value: 'N-S and E-W', label: 'N-S and E-W' }, { value: 'NW-SE', label: 'NW-SE' }, { value: 'SE-SW', label: 'SE-SW' }]}
            savingFields={savingFields} savedFields={savedFields} onSave={onInlineFieldSave} />
        </td>
      );
    case 'waterSource':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineFieldSelect fieldId={field.id} apiField="water_source" value={field.waterSource}
            options={[{ value: 'Well', label: 'Well' }, { value: 'Canal', label: 'Canal' }, { value: 'Other', label: 'Other' }]}
            savingFields={savingFields} savedFields={savedFields} onSave={onInlineFieldSave} />
        </td>
      );
    case 'fuelSource':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineFieldSelect fieldId={field.id} apiField="fuel_source" value={field.fuelSource}
            options={[{ value: 'Electric', label: 'Electric' }, { value: 'Natural Gas', label: 'Natural Gas' }, { value: 'Diesel', label: 'Diesel' }, { value: 'Other', label: 'Other' }]}
            savingFields={savingFields} savedFields={savedFields} onSave={onInlineFieldSave} />
        </td>
      );
    case 'elevation':
      return <td key={colKey}>{field.elevation || '—'}</td>;
    case 'soilType':
      return <td key={colKey}>{field.soilType || '—'}</td>;
    case 'fieldDirections':
      return <td key={colKey} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={field.fieldDirections || ''}>{field.fieldDirections || '—'}</td>;
    default:
      return <td key={colKey}>—</td>;
  }
}
