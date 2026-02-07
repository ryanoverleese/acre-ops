'use client';

import { useState, useMemo, useCallback } from 'react';
import type { OperationGroup, WaterRecRecord } from './page';

interface WaterRecsClientProps {
  operations: OperationGroup[];
  waterRecs: WaterRecRecord[];
  currentSeason: number;
  fsToOperation: Record<number, number>;
  fsToFieldName: Record<number, string>;
  waterDayOptions: string[];
}

interface FieldForm {
  waterDay: string;
  priority: boolean;
  recommendation: string;
  expanded: boolean;
  // Update mode
  updateStatus: 'continue' | 'updated';
  originalDay: string;
}

function getWeekRange(dateStr: string): { start: string; end: string } {
  const date = new Date(dateStr + 'T12:00:00');
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
}

export default function WaterRecsClient({
  operations,
  waterRecs,
  currentSeason,
  fsToOperation,
  fsToFieldName,
  waterDayOptions: rawDayOptions,
}: WaterRecsClientProps) {
  // Smart-order day options: start from report date's day, wrap around, non-days at end
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const [selectedOperationId, setSelectedOperationId] = useState<number | null>(
    operations.length > 0 ? operations[0].id : null
  );
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  // Smart-order: start from report date's day of week, then wrap around
  const waterDayOptions = useMemo(() => {
    const date = new Date(reportDate + 'T12:00:00');
    const jsDay = date.getDay(); // 0=Sun, 1=Mon, ...
    const startIndex = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0 index

    // Separate actual days from special options (like ASAP)
    const days: string[] = [];
    const special: string[] = [];
    rawDayOptions.forEach(opt => {
      if (DAY_NAMES.includes(opt)) {
        days.push(opt);
      } else {
        special.push(opt);
      }
    });

    // Reorder days starting from report date's day
    const ordered = DAY_NAMES.slice(startIndex).concat(DAY_NAMES.slice(0, startIndex));
    // Only include days that exist in Baserow options
    const daySet = new Set(days);
    const filteredOrdered = ordered.filter(d => daySet.has(d));

    return [...filteredOrdered, ...special];
  }, [reportDate, rawDayOptions]);

  const [mode, setMode] = useState<'full' | 'update'>('full');
  const [overview, setOverview] = useState('');
  const [fieldForms, setFieldForms] = useState<Record<number, FieldForm>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(true);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const currentOperation = useMemo(
    () => operations.find(o => o.id === selectedOperationId) || null,
    [operations, selectedOperationId]
  );

  const currentFieldSeasonIds = useMemo(
    () => new Set(currentOperation?.fields.map(f => f.fieldSeasonId) || []),
    [currentOperation]
  );

  // Get water recs for current operation this week
  const weekRange = useMemo(() => getWeekRange(reportDate), [reportDate]);

  const thisWeekRecs = useMemo(() => {
    return waterRecs.filter(wr =>
      currentFieldSeasonIds.has(wr.fieldSeasonId) &&
      wr.date >= weekRange.start &&
      wr.date <= weekRange.end
    );
  }, [waterRecs, currentFieldSeasonIds, weekRange]);

  // Find the full report (earliest date this week with recs)
  const fullReportRecs = useMemo(() => {
    if (thisWeekRecs.length === 0) return [];
    const dates = [...new Set(thisWeekRecs.map(r => r.date))].sort();
    const earliestDate = dates[0];
    return thisWeekRecs.filter(r => r.date === earliestDate);
  }, [thisWeekRecs]);

  // Existing recs for the selected date (for overwrite detection)
  const existingRecsForDate = useMemo(() => {
    return waterRecs.filter(wr =>
      currentFieldSeasonIds.has(wr.fieldSeasonId) &&
      wr.date === reportDate
    );
  }, [waterRecs, currentFieldSeasonIds, reportDate]);

  // Operations that need reports this week
  const opsNeedingReports = useMemo(() => {
    const opsWithRecs = new Set<number>();
    waterRecs.forEach(wr => {
      if (wr.date >= weekRange.start && wr.date <= weekRange.end) {
        const opId = fsToOperation[wr.fieldSeasonId];
        if (opId) opsWithRecs.add(opId);
      }
    });
    return operations.filter(op => !opsWithRecs.has(op.id));
  }, [operations, waterRecs, weekRange, fsToOperation]);

  // Re-init forms when operation/mode/date changes
  const [lastInitKey, setLastInitKey] = useState('');
  const initKey = `${selectedOperationId}-${mode}-${reportDate}`;
  if (initKey !== lastInitKey) {
    setLastInitKey(initKey);
    if (currentOperation) {
      const forms: Record<number, FieldForm> = {};
      currentOperation.fields.forEach(field => {
        if (mode === 'update') {
          const fullRec = fullReportRecs.find(r => r.fieldSeasonId === field.fieldSeasonId);
          forms[field.fieldSeasonId] = {
            waterDay: fullRec?.suggestedWaterDay || '',
            priority: false,
            recommendation: '',
            expanded: false,
            updateStatus: 'continue',
            originalDay: fullRec?.suggestedWaterDay || '',
          };
        } else {
          const existing = existingRecsForDate.find(r => r.fieldSeasonId === field.fieldSeasonId);
          forms[field.fieldSeasonId] = {
            waterDay: existing?.suggestedWaterDay || '',
            priority: existing?.priority || false,
            recommendation: existing?.recommendation || '',
            expanded: !!(existing?.recommendation),
            updateStatus: 'continue',
            originalDay: '',
          };
        }
      });
      setFieldForms(forms);
      if (!existingRecsForDate.length) setOverview('');
    }
  }

  const updateField = (fsId: number, updates: Partial<FieldForm>) => {
    setFieldForms(prev => ({
      ...prev,
      [fsId]: { ...prev[fsId], ...updates },
    }));
  };

  // Navigate between operations
  const currentOpIndex = operations.findIndex(o => o.id === selectedOperationId);
  const goToPrevOp = () => {
    if (currentOpIndex > 0) setSelectedOperationId(operations[currentOpIndex - 1].id);
  };
  const goToNextOp = () => {
    if (currentOpIndex < operations.length - 1) setSelectedOperationId(operations[currentOpIndex + 1].id);
  };

  // Save report
  const handleSave = async () => {
    if (!currentOperation) return;

    // Validate priority fields have recommendations
    if (mode === 'full') {
      const missingRecs = currentOperation.fields.filter(f => {
        const form = fieldForms[f.fieldSeasonId];
        return form?.priority && !form.recommendation.trim();
      });
      if (missingRecs.length > 0) {
        showToast(`${missingRecs.length} priority field${missingRecs.length > 1 ? 's' : ''} missing recommendations`);
        return;
      }
    }

    setSaving(true);

    try {
      const records: { field_season: number; date: string; recommendation: string; suggested_water_day: string; priority: boolean; report_type: string }[] = [];

      currentOperation.fields.forEach(field => {
        const form = fieldForms[field.fieldSeasonId];
        if (!form) return;

        if (mode === 'full') {
          if (form.waterDay || form.recommendation.trim()) {
            records.push({
              field_season: field.fieldSeasonId,
              date: reportDate,
              recommendation: form.recommendation.trim(),
              suggested_water_day: form.waterDay,
              priority: form.priority,
              report_type: 'full',
            });
          }
        } else {
          const day = form.updateStatus === 'updated' ? form.waterDay : form.originalDay;
          if (day) {
            records.push({
              field_season: field.fieldSeasonId,
              date: reportDate,
              recommendation: form.updateStatus === 'updated' ? `Updated to ${day}` : '',
              suggested_water_day: day,
              priority: false,
              report_type: 'update',
            });
          }
        }
      });

      if (records.length === 0) {
        showToast('Nothing to save - set water days or write recommendations first');
        setSaving(false);
        return;
      }

      const deleteIds = existingRecsForDate.map(r => r.id);

      const response = await fetch('/api/water-recs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteIds, records }),
      });

      const data = await response.json();
      if (response.ok && data.created > 0) {
        showToast(`Saved ${data.created} water recommendations`);
      } else if (response.ok && data.created === 0) {
        console.error('Bulk save errors:', data.errors);
        showToast(`Failed to save - ${data.errors?.[0]?.substring(0, 80) || 'Baserow rejected records'}`);
      } else {
        showToast('Failed to save - please try again');
      }
    } catch {
      showToast('Failed to save - please try again');
    } finally {
      setSaving(false);
    }
  };

  // Build copy text for Full Report
  const buildFullReportText = (): string => {
    if (!currentOperation) return '';
    const lines: string[] = [];

    // Title: Soil Moisture Reports - date
    const dateObj = new Date(reportDate + 'T12:00:00');
    const formatted = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    lines.push(`Soil Moisture Reports - ${formatted}`, '');

    if (overview.trim()) {
      lines.push(overview.trim(), '');
    }

    const priorityFields: { name: string; rec: string }[] = [];
    const normalFields: { name: string; rec: string }[] = [];
    const waterSchedule: Record<string, string[]> = {};

    currentOperation.fields.forEach(field => {
      const form = fieldForms[field.fieldSeasonId];
      if (!form) return;

      if (form.waterDay) {
        if (!waterSchedule[form.waterDay]) waterSchedule[form.waterDay] = [];
        waterSchedule[form.waterDay].push(field.fieldName);
      }

      if (form.recommendation.trim()) {
        if (form.priority) {
          priorityFields.push({ name: field.fieldName, rec: form.recommendation.trim() });
        } else {
          normalFields.push({ name: field.fieldName, rec: form.recommendation.trim() });
        }
      }
    });

    if (priorityFields.length > 0) {
      lines.push('⚠️ HIGH PRIORITY:', '');
      priorityFields.forEach(f => {
        lines.push(f.name.toUpperCase());
        lines.push(f.rec, '');
      });
    }

    if (normalFields.length > 0) {
      lines.push('NORMAL PRIORITY:', '');
      normalFields.forEach(f => {
        lines.push(f.name.toUpperCase());
        lines.push(f.rec, '');
      });
    }

    const scheduleDays = waterDayOptions.filter(d => waterSchedule[d]?.length);
    if (scheduleDays.length > 0) {
      lines.push('💧 Water Schedule:');
      scheduleDays.forEach(day => {
        lines.push(`${day}: ${waterSchedule[day].join(', ')}`);
      });
    }

    return lines.join('\n').trim();
  };

  // Build copy text for Update
  const buildUpdateText = (): string => {
    if (!currentOperation) return '';
    const lines: string[] = [];

    // Title: Soil Moisture Reports - date
    const dateObj = new Date(reportDate + 'T12:00:00');
    const formatted = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    lines.push(`Soil Moisture Reports - ${formatted}`, '');

    const continueFields: { name: string; day: string }[] = [];
    const updatedFields: { name: string; day: string }[] = [];

    currentOperation.fields.forEach(field => {
      const form = fieldForms[field.fieldSeasonId];
      if (!form) return;

      if (form.updateStatus === 'updated' && form.waterDay) {
        updatedFields.push({ name: field.fieldName, day: form.waterDay });
      } else if (form.originalDay) {
        continueFields.push({ name: field.fieldName, day: form.originalDay });
      }
    });

    if (continueFields.length > 0) {
      lines.push('Continue as scheduled:');
      continueFields.forEach(f => lines.push(`${f.name} - ${f.day}`));
      lines.push('');
    }

    if (updatedFields.length > 0) {
      lines.push('Updated water days:');
      updatedFields.forEach(f => lines.push(`${f.name} - moved to ${f.day}`));
    }

    return lines.join('\n').trim();
  };

  const handleCopyAll = async () => {
    const text = mode === 'full' ? buildFullReportText() : buildUpdateText();
    if (!text) {
      showToast('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied to clipboard');
    }
  };

  const priorityCount = Object.values(fieldForms).filter(f => f.priority).length;
  const recsCount = Object.values(fieldForms).filter(f => f.recommendation.trim()).length;
  const waterDayCount = Object.values(fieldForms).filter(f => f.waterDay).length;

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Reports</h2>
        {opsNeedingReports.length > 0 && (
          <span style={{ fontSize: '13px', color: 'var(--status-yellow)', background: 'rgba(251, 191, 36, 0.1)', padding: '4px 12px', borderRadius: '12px', fontWeight: 600 }}>
            {opsNeedingReports.length} operation{opsNeedingReports.length !== 1 ? 's' : ''} need reports this week
          </span>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedOperationId || ''}
          onChange={(e) => setSelectedOperationId(parseInt(e.target.value) || null)}
          style={{ padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', minWidth: '200px' }}
        >
          {operations.length === 0 && <option value="">No operations with active probes</option>}
          {operations.map(op => (
            <option key={op.id} value={op.id}>
              {op.name} ({op.fields.length} fields)
              {opsNeedingReports.some(o => o.id === op.id) ? ' *' : ''}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          style={{ padding: '8px 12px', fontSize: '14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
        />

        <div style={{ display: 'flex', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setMode('full')}
            style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none',
              background: mode === 'full' ? 'var(--accent-green)' : 'var(--bg-card)',
              color: mode === 'full' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            Full Report
          </button>
          <button
            onClick={() => setMode('update')}
            style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none',
              borderLeft: '1px solid var(--border)',
              background: mode === 'update' ? 'var(--accent-green)' : 'var(--bg-card)',
              color: mode === 'update' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            Water Day Update
          </button>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <button
            onClick={goToPrevOp}
            disabled={currentOpIndex <= 0}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-card)', cursor: currentOpIndex > 0 ? 'pointer' : 'default', opacity: currentOpIndex > 0 ? 1 : 0.4, color: 'var(--text-primary)' }}
          >
            &larr; Prev
          </button>
          <button
            onClick={goToNextOp}
            disabled={currentOpIndex >= operations.length - 1}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-card)', cursor: currentOpIndex < operations.length - 1 ? 'pointer' : 'default', opacity: currentOpIndex < operations.length - 1 ? 1 : 0.4, color: 'var(--text-primary)' }}
          >
            Next &rarr;
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {currentOperation && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span>{currentOperation.fields.length} fields</span>
          {mode === 'full' && (
            <>
              <span>{waterDayCount} water days set</span>
              <span>{recsCount} recommendation{recsCount !== 1 ? 's' : ''}</span>
              {priorityCount > 0 && (
                <span style={{ color: 'var(--status-red)', fontWeight: 600 }}>
                  {priorityCount} priority
                </span>
              )}
            </>
          )}
          {mode === 'update' && (
            <span>
              {Object.values(fieldForms).filter(f => f.updateStatus === 'updated').length} updated
            </span>
          )}
        </div>
      )}

      {!currentOperation && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '16px' }}>No operations with active (installed) probes for {currentSeason}.</p>
        </div>
      )}

      {/* ============ FULL REPORT MODE ============ */}
      {currentOperation && mode === 'full' && (
        <div>
          {/* Overview */}
          <div style={{ marginBottom: '16px' }}>
            <textarea
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="General overview message for this operation (optional)..."
              rows={3}
              style={{
                width: '100%', padding: '12px', fontSize: '14px', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)',
                resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Field cards */}
          {currentOperation.fields.map(field => {
            const form = fieldForms[field.fieldSeasonId];
            if (!form) return null;
            const isPriority = form.priority;

            return (
              <div
                key={field.fieldSeasonId}
                style={{
                  marginBottom: '8px',
                  border: isPriority ? '2px solid var(--status-red)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: isPriority ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-card)',
                  overflow: 'hidden',
                }}
              >
                {/* Field header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', flexWrap: 'wrap' }}>
                  {/* Priority toggle */}
                  <button
                    onClick={() => {
                      const newPriority = !form.priority;
                      updateField(field.fieldSeasonId, {
                        priority: newPriority,
                        expanded: newPriority ? true : form.expanded,
                      });
                    }}
                    title={isPriority ? 'Remove priority' : 'Mark as priority'}
                    style={{
                      width: '28px', height: '28px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      background: isPriority ? 'var(--status-red)' : 'var(--bg-tertiary)',
                      color: isPriority ? '#fff' : 'var(--text-muted)',
                      fontSize: '14px', fontWeight: 700, transition: 'all 0.15s',
                    }}
                  >
                    !
                  </button>

                  {/* Field name + crop */}
                  <div
                    style={{ flex: 1, cursor: 'pointer', minWidth: '120px' }}
                    onClick={() => updateField(field.fieldSeasonId, { expanded: !form.expanded })}
                  >
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{field.fieldName}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      {field.crop} &middot; {field.acres} ac
                    </span>
                  </div>

                  {/* Water day dropdown */}
                  <select
                    value={form.waterDay}
                    onChange={(e) => updateField(field.fieldSeasonId, { waterDay: e.target.value })}
                    style={{
                      padding: '6px 10px', fontSize: '13px', borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                      minWidth: '120px',
                    }}
                  >
                    <option value="">Water day...</option>
                    {waterDayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>

                  {/* Expand chevron */}
                  <button
                    onClick={() => updateField(field.fieldSeasonId, { expanded: !form.expanded })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"
                      style={{ transform: form.expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Expanded recommendation area */}
                {form.expanded && (
                  <div style={{ padding: '0 14px 12px' }}>
                    <textarea
                      value={form.recommendation}
                      onChange={(e) => updateField(field.fieldSeasonId, { recommendation: e.target.value })}
                      placeholder={isPriority ? 'Priority field - recommendation required...' : 'Write a recommendation (or leave blank for status quo)...'}
                      rows={3}
                      style={{
                        width: '100%', padding: '10px', fontSize: '14px', borderRadius: 'var(--radius)',
                        border: isPriority && !form.recommendation.trim() ? '2px solid var(--status-red)' : '1px solid var(--border)',
                        background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                        resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                      }}
                    />
                    {isPriority && !form.recommendation.trim() && (
                      <div style={{ fontSize: '12px', color: 'var(--status-red)', marginTop: '4px' }}>
                        Priority fields must have a written recommendation
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ============ UPDATE MODE ============ */}
      {currentOperation && mode === 'update' && (
        <div>
          {/* Reference panel */}
          {fullReportRecs.length > 0 && (
            <div style={{ marginBottom: '16px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <div
                onClick={() => setShowReference(!showReference)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: 'var(--bg-tertiary)', cursor: 'pointer',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '14px' }}>
                  Full Report Reference ({fullReportRecs[0]?.date})
                </span>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"
                  style={{ transform: showReference ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text-muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {showReference && (
                <div style={{ padding: '12px 14px', background: 'var(--bg-card)', maxHeight: '300px', overflowY: 'auto' }}>
                  {fullReportRecs.map(rec => {
                    const name = fsToFieldName[rec.fieldSeasonId] || 'Unknown';
                    return (
                      <div key={rec.id} style={{ marginBottom: '8px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>{name}</span>
                          {rec.suggestedWaterDay && (
                            <span style={{ fontSize: '12px', padding: '1px 8px', borderRadius: '10px', background: 'var(--accent-green-dim)', color: 'var(--accent-green)', fontWeight: 500 }}>
                              {rec.suggestedWaterDay}
                            </span>
                          )}
                          {rec.priority && (
                            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-red)', fontWeight: 600 }}>
                              PRIORITY
                            </span>
                          )}
                        </div>
                        {rec.recommendation && (
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                            {rec.recommendation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {fullReportRecs.length === 0 && (
            <div style={{ padding: '20px', marginBottom: '16px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(251, 191, 36, 0.3)', fontSize: '14px', color: 'var(--text-primary)' }}>
              No full report found for this week. Water days will start empty.
            </div>
          )}

          {/* Update field cards */}
          {currentOperation.fields.map(field => {
            const form = fieldForms[field.fieldSeasonId];
            if (!form) return null;
            const isUpdated = form.updateStatus === 'updated';

            return (
              <div
                key={field.fieldSeasonId}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                  marginBottom: '6px', borderRadius: 'var(--radius)', flexWrap: 'wrap',
                  border: isUpdated ? '2px solid var(--accent-green)' : '1px solid var(--border)',
                  background: isUpdated ? 'rgba(76, 175, 80, 0.05)' : 'var(--bg-card)',
                }}
              >
                <div style={{ flex: 1, minWidth: '120px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{field.fieldName}</span>
                  {form.originalDay && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      was {form.originalDay}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <button
                    onClick={() => updateField(field.fieldSeasonId, { updateStatus: 'continue', waterDay: form.originalDay })}
                    style={{
                      padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: !isUpdated ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                      color: !isUpdated ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => updateField(field.fieldSeasonId, { updateStatus: 'updated' })}
                    style={{
                      padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: 'none',
                      borderLeft: '1px solid var(--border)',
                      background: isUpdated ? 'var(--accent-green)' : 'var(--bg-card)',
                      color: isUpdated ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    Updated
                  </button>
                </div>

                {isUpdated && (
                  <select
                    value={form.waterDay}
                    onChange={(e) => updateField(field.fieldSeasonId, { waterDay: e.target.value })}
                    style={{
                      padding: '6px 10px', fontSize: '13px', borderRadius: 'var(--radius)',
                      border: '1px solid var(--accent-green)', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">New day...</option>
                    {waterDayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      {currentOperation && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingBottom: '40px', flexWrap: 'wrap' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '12px 32px', fontSize: '15px', fontWeight: 600, borderRadius: 'var(--radius)',
              border: 'none', cursor: saving ? 'default' : 'pointer',
              background: 'var(--accent-green)', color: '#fff',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : (mode === 'full' ? 'Save Report' : 'Save Update')}
          </button>
          <button
            onClick={handleCopyAll}
            style={{
              padding: '12px 32px', fontSize: '15px', fontWeight: 600, borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', cursor: 'pointer',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
            }}
          >
            Copy All
          </button>
          {existingRecsForDate.length > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'center' }}>
              {existingRecsForDate.length} existing rec{existingRecsForDate.length !== 1 ? 's' : ''} for this date will be replaced
            </span>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000,
          padding: '12px 24px', borderRadius: 'var(--radius)',
          background: 'var(--bg-primary)', border: '1px solid var(--accent-green)',
          color: 'var(--text-primary)', fontSize: '14px', fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <svg fill="none" stroke="var(--accent-green)" viewBox="0 0 24 24" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
    </>
  );
}
