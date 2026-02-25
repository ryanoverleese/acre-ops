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
  // Days that wrap into next week get "Next" prefix in label
  const waterDayOptions = useMemo(() => {
    const date = new Date(reportDate + 'T12:00:00');
    const jsDay = date.getDay(); // 0=Sun, 1=Mon, ...
    const startIndex = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0 index

    // Separate actual days from special options (like ASAP, Wait til next report)
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

    // Build label with day count; days that wrapped = "Next [Day]"
    const result = filteredOrdered.map((d, i) => {
      const dayIndex = DAY_NAMES.indexOf(d);
      const isNextWeek = dayIndex < startIndex; // wrapped past Sunday
      const prefix = isNextWeek ? 'Next ' : '';
      const count = i === 0 ? '(today)' : i === 1 ? '(1 day)' : `(${i} days)`;
      return { value: d, label: `${prefix}${d} ${count}` };
    });

    // Add special options without day counts
    special.forEach(s => result.push({ value: s, label: s }));

    return result;
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

    const scheduleDays = waterDayOptions.filter(d => waterSchedule[d.value]?.length);
    if (scheduleDays.length > 0) {
      lines.push('💧 Water Schedule:', '');
      scheduleDays.forEach(d => {
        const sorted = [...waterSchedule[d.value]].sort((a, b) => a.localeCompare(b));
        lines.push(`${d.value}:`);
        sorted.forEach(name => lines.push(name));
        lines.push('');
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
      <header className="header">
        <div className="header-left">
          <h2>Reports</h2>
          {opsNeedingReports.length > 0 && (
            <span className="wr-needs-reports-badge">
              {opsNeedingReports.length} operation{opsNeedingReports.length !== 1 ? 's' : ''} need reports this week
            </span>
          )}
        </div>
      </header>
      <div className="content">
      {/* Controls */}
      <div className="wr-controls">
        <select
          className="wr-select"
          value={selectedOperationId || ''}
          onChange={(e) => setSelectedOperationId(parseInt(e.target.value) || null)}
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
          className="wr-date-input"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
        />

        <div className="wr-toggle-group">
          <button
            className={`wr-toggle-btn${mode === 'full' ? ' active' : ''}`}
            onClick={() => setMode('full')}
          >
            Full Report
          </button>
          <button
            className={`wr-toggle-btn${mode === 'update' ? ' active' : ''}`}
            onClick={() => setMode('update')}
          >
            Water Day Update
          </button>
        </div>

        <div className="wr-pagination">
          <button
            className="wr-page-btn"
            onClick={goToPrevOp}
            disabled={currentOpIndex <= 0}
          >
            &larr; Prev
          </button>
          <button
            className="wr-page-btn"
            onClick={goToNextOp}
            disabled={currentOpIndex >= operations.length - 1}
          >
            Next &rarr;
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {currentOperation && (
        <div className="wr-stats-bar">
          <span>{currentOperation.fields.length} fields</span>
          {mode === 'full' && (
            <>
              <span>{waterDayCount} water days set</span>
              <span>{recsCount} recommendation{recsCount !== 1 ? 's' : ''}</span>
              {priorityCount > 0 && (
                <span className="wr-priority-stat">
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
        <div className="wr-empty-state">
          <p>No operations with active (installed) probes for {currentSeason}.</p>
        </div>
      )}

      {/* ============ FULL REPORT MODE ============ */}
      {currentOperation && mode === 'full' && (
        <div>
          {/* Overview */}
          <div className="wr-overview-wrap">
            <textarea
              className="wr-textarea"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="General overview message for this operation (optional)..."
              rows={3}
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
                className={`wr-field-card${isPriority ? ' priority' : ''}`}
              >
                {/* Field header row */}
                <div className="wr-field-header">
                  {/* Priority toggle */}
                  <button
                    className={`wr-priority-btn${isPriority ? ' active' : ''}`}
                    onClick={() => {
                      const newPriority = !form.priority;
                      updateField(field.fieldSeasonId, {
                        priority: newPriority,
                        expanded: newPriority ? true : form.expanded,
                      });
                    }}
                    title={isPriority ? 'Remove priority' : 'Mark as priority'}
                  >
                    !
                  </button>

                  {/* Field name + crop */}
                  <div
                    className="wr-field-info"
                    onClick={() => updateField(field.fieldSeasonId, { expanded: !form.expanded })}
                  >
                    <span className="wr-field-name">{field.fieldName}</span>
                    <span className="wr-field-meta">
                      {field.crop} &middot; {field.acres} ac
                    </span>
                  </div>

                  {/* Water day dropdown */}
                  <select
                    className="wr-field-select"
                    value={form.waterDay}
                    onChange={(e) => updateField(field.fieldSeasonId, { waterDay: e.target.value })}
                  >
                    <option value="">Water day...</option>
                    {waterDayOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>

                  {/* Expand chevron */}
                  <button
                    className="wr-chevron-btn"
                    onClick={() => updateField(field.fieldSeasonId, { expanded: !form.expanded })}
                  >
                    <svg className="wr-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"
                      style={{ transform: form.expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Expanded recommendation area */}
                {form.expanded && (
                  <div className="wr-expanded-area">
                    <textarea
                      className={`wr-rec-textarea${isPriority && !form.recommendation.trim() ? ' error' : ''}`}
                      value={form.recommendation}
                      onChange={(e) => updateField(field.fieldSeasonId, { recommendation: e.target.value })}
                      placeholder={isPriority ? 'Priority field - recommendation required...' : 'Write a recommendation (or leave blank for status quo)...'}
                      rows={3}
                    />
                    {isPriority && !form.recommendation.trim() && (
                      <div className="wr-rec-error">
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
            <div className="wr-ref-panel">
              <div
                className="wr-ref-header"
                onClick={() => setShowReference(!showReference)}
              >
                <span className="wr-ref-title">
                  Full Report Reference ({fullReportRecs[0]?.date})
                </span>
                <svg className="wr-ref-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18"
                  style={{ transform: showReference ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {showReference && (
                <div className="wr-ref-body">
                  {fullReportRecs.map(rec => {
                    const name = fsToFieldName[rec.fieldSeasonId] || 'Unknown';
                    return (
                      <div key={rec.id} className="wr-ref-item">
                        <div className="wr-ref-item-header">
                          <span className="wr-ref-field-name">{name}</span>
                          {rec.suggestedWaterDay && (
                            <span className="wr-ref-day-badge">
                              {rec.suggestedWaterDay}
                            </span>
                          )}
                          {rec.priority && (
                            <span className="wr-ref-priority-badge">
                              PRIORITY
                            </span>
                          )}
                        </div>
                        {rec.recommendation && (
                          <div className="wr-ref-rec-text">
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
            <div className="wr-warning-banner">
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
                className={`wr-update-card${isUpdated ? ' updated' : ''}`}
              >
                <div className="wr-update-field-info">
                  <span className="wr-field-name">{field.fieldName}</span>
                  {form.originalDay && (
                    <span className="wr-field-meta">
                      was {form.originalDay}
                    </span>
                  )}
                </div>

                <div className="wr-toggle-group">
                  <button
                    className={`wr-update-toggle-btn${!isUpdated ? ' active-continue' : ''}`}
                    onClick={() => updateField(field.fieldSeasonId, { updateStatus: 'continue', waterDay: form.originalDay })}
                  >
                    Continue
                  </button>
                  <button
                    className={`wr-update-toggle-btn${isUpdated ? ' active-updated' : ''}`}
                    onClick={() => updateField(field.fieldSeasonId, { updateStatus: 'updated' })}
                  >
                    Updated
                  </button>
                </div>

                {isUpdated && (
                  <select
                    className="wr-update-select"
                    value={form.waterDay}
                    onChange={(e) => updateField(field.fieldSeasonId, { waterDay: e.target.value })}
                  >
                    <option value="">New day...</option>
                    {waterDayOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      {currentOperation && (
        <div className="wr-actions">
          <button
            className="wr-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : (mode === 'full' ? 'Save Report' : 'Save Update')}
          </button>
          <button
            className="wr-copy-btn"
            onClick={handleCopyAll}
          >
            Copy All
          </button>
          {existingRecsForDate.length > 0 && (
            <span className="wr-existing-hint">
              {existingRecsForDate.length} existing rec{existingRecsForDate.length !== 1 ? 's' : ''} for this date will be replaced
            </span>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="wr-toast">
          <svg fill="none" stroke="var(--accent-primary)" viewBox="0 0 24 24" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
      </div>
    </>
  );
}
