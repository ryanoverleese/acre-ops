'use client';

import React from 'react';
import InlineCell from '@/components/InlineCell';
import type { ProcessedField } from '@/app/fields/page';

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
            options={[{ value: 'Standard', label: 'Standard' }, { value: 'Extended', label: 'Extended' }]}
            onSave={onInlineSave} savingFields={savingFields} savedFields={savedFields} />
        </td>
      );
    case 'battery':
      return (
        <td key={colKey} onClick={(e) => e.stopPropagation()}>
          <InlineCell fieldSeasonId={field.fieldSeasonId} field="batteryType" value={field.batteryType} type="select"
            options={[{ value: 'Standard', label: 'Standard' }, { value: 'Extended', label: 'Extended' }]}
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
      return <td key={colKey}>{field.acres || '—'}</td>;
    case 'pivotAcres':
      return <td key={colKey}>{field.pivotAcres || '—'}</td>;
    case 'irrigationType':
      return <td key={colKey}>{field.irrigationType || '—'}</td>;
    case 'rowDirection':
      return <td key={colKey}>{field.rowDirection || '—'}</td>;
    case 'waterSource':
      return <td key={colKey}>{field.waterSource || '—'}</td>;
    case 'fuelSource':
      return <td key={colKey}>{field.fuelSource || '—'}</td>;
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
