'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
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
  const [overviewPersisted, setOverviewPersisted] = useState('');
  const [overviewStatus, setOverviewStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [fieldForms, setFieldForms] = useState<Record<number, FieldForm>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Small status pill next to the Save button (saving / saved / error).
  const [savedStatus, setSavedStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Per-recommendation save tracking. `recPersisted` holds the rec text currently
  // in Baserow for each field; `recSaveStatus` drives the little pill. When you
  // click out of a recommendation it saves just that field through the (now
  // idempotent) bulk route, so it can't duplicate or wipe anything else.
  const [recPersisted, setRecPersisted] = useState<Record<number, string>>({});
  const [recSaveStatus, setRecSaveStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});

  // Per-field water-day save tracking
  const [dayPersisted, setDayPersisted] = useState<Record<number, string>>({});
  const [daySaveStatus, setDaySaveStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});
  // In update mode, the id of the saved 'update' row per field for this date, so
  // clicking a day creates/replaces it and un-clicking removes it.
  const [updateRowId, setUpdateRowId] = useState<Record<number, number | null>>({});

  // Report timer — tracks how long you spend per operation
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const [dayTotal, setDayTotal] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const stored = localStorage.getItem('wr-timer-today');
    if (!stored) return 0;
    const parsed = JSON.parse(stored);
    const today = new Date().toISOString().split('T')[0];
    return parsed.date === today ? parsed.total : 0;
  });
  const [opsCompleted, setOpsCompleted] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const stored = localStorage.getItem('wr-timer-today');
    if (!stored) return 0;
    const parsed = JSON.parse(stored);
    const today = new Date().toISOString().split('T')[0];
    return parsed.date === today ? (parsed.ops || 0) : 0;
  });

  // Permanent per-field season note (lives on field_season, persists all year,
  // resets next season). Seeded once from the loaded data; edits save on blur.
  const [fieldNotes, setFieldNotes] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    operations.forEach(op => op.fields.forEach(f => { m[f.fieldSeasonId] = f.fieldNote || ''; }));
    return m;
  });
  const [noteStatus, setNoteStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});

  const saveFieldNote = useCallback(async (fsId: number, note: string) => {
    setNoteStatus(s => ({ ...s, [fsId]: 'saving' }));
    try {
      const res = await fetch('/api/water-recs/field-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldSeasonId: fsId, note }),
      });
      setNoteStatus(s => ({ ...s, [fsId]: res.ok ? 'saved' : 'error' }));
    } catch {
      setNoteStatus(s => ({ ...s, [fsId]: 'error' }));
    }
  }, []);

  // Timer: tick every second when running
  useEffect(() => {
    if (!timerStart) return;
    const interval = setInterval(() => {
      setTimerElapsed(Math.floor((Date.now() - timerStart) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerStart]);

  // Start timer when an operation is selected
  useEffect(() => {
    if (selectedOperationId) {
      setTimerStart(Date.now());
      setTimerElapsed(0);
    }
  }, [selectedOperationId]);

  // Past week history from localStorage
  const pastHistory = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('wr-timer-history');
    if (!raw) return null;
    const history: { date: string; total: number; ops: number; finishedAt: string }[] = JSON.parse(raw);
    // Find last Monday's entry (same day of week)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().split('T')[0];
    return history.find(h => h.date === lastWeekStr) || (history.length > 0 ? history[history.length - 1] : null);
  }, []);

  // Save water day immediately when dropdown changes
  const saveWaterDay = useCallback(async (fsId: number, day: string) => {
    if (mode !== 'full') return;
    const form = fieldForms[fsId];
    if (!form) return;
    if (day === (dayPersisted[fsId] ?? '')) return;

    setDaySaveStatus(s => ({ ...s, [fsId]: 'saving' }));
    try {
      const res = await fetch('/api/water-recs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            field_season: fsId,
            date: reportDate,
            recommendation: form.recommendation || '',
            suggested_water_day: day,
            priority: form.priority,
            report_type: 'full',
          }],
          scopeFieldSeasons: [fsId],
          reportType: 'full',
        }),
      });
      if (res.ok) {
        setDayPersisted(p => ({ ...p, [fsId]: day }));
        setDaySaveStatus(s => ({ ...s, [fsId]: 'saved' }));
      } else {
        setDaySaveStatus(s => ({ ...s, [fsId]: 'error' }));
      }
    } catch {
      setDaySaveStatus(s => ({ ...s, [fsId]: 'error' }));
    }
  }, [mode, fieldForms, dayPersisted, reportDate]);

  // Update mode: clicking a day immediately creates (or replaces) a late-week
  // 'update' record for that field; un-clicking deletes it. No batch save needed.
  const saveUpdateDay = useCallback(async (fsId: number, day: string) => {
    if (mode !== 'update') return;
    setDaySaveStatus(s => ({ ...s, [fsId]: 'saving' }));
    try {
      if (!day) {
        // Deselected — remove the record we created for this field+date, if any.
        const rowId = updateRowId[fsId];
        if (rowId) {
          const res = await fetch(`/api/water-recs/${rowId}`, { method: 'DELETE' });
          if (!res.ok) { setDaySaveStatus(s => ({ ...s, [fsId]: 'error' })); return; }
        }
        setUpdateRowId(m => ({ ...m, [fsId]: null }));
        setDaySaveStatus(s => ({ ...s, [fsId]: 'saved' }));
        return;
      }
      const res = await fetch('/api/water-recs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            field_season: fsId,
            date: reportDate,
            recommendation: `Updated to ${day}`,
            suggested_water_day: day,
            priority: false,
            report_type: 'update',
          }],
          scopeFieldSeasons: [fsId],
          reportType: 'update',
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const newId = data?.createdIds?.[0] ?? null;
        setUpdateRowId(m => ({ ...m, [fsId]: newId }));
        setDaySaveStatus(s => ({ ...s, [fsId]: 'saved' }));
      } else {
        setDaySaveStatus(s => ({ ...s, [fsId]: 'error' }));
      }
    } catch {
      setDaySaveStatus(s => ({ ...s, [fsId]: 'error' }));
    }
  }, [mode, reportDate, updateRowId]);

  const [showReference, setShowReference] = useState(true);
  // Which past-week rec is showing per field (0 = most recent prior week)
  const [pastIdx, setPastIdx] = useState<Record<number, number>>({});

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const currentOperation = useMemo(
    () => operations.find(o => o.id === selectedOperationId) || null,
    [operations, selectedOperationId]
  );

  // Save the overview note as a special "overview" row in water_recs.
  // Uses the first field_season of the operation as an anchor so the
  // existing cleanup logic can scope it properly.
  const saveOverview = useCallback(async () => {
    if (!currentOperation || overview.trim() === overviewPersisted.trim()) return;
    const anchorFs = currentOperation.fields[0]?.fieldSeasonId;
    if (!anchorFs) return;
    setOverviewStatus('saving');
    try {
      const res = await fetch('/api/water-recs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            field_season: anchorFs,
            date: reportDate,
            recommendation: overview.trim(),
            report_type: 'overview',
          }],
          scopeFieldSeasons: [anchorFs],
          reportType: 'overview',
        }),
      });
      if (res.ok) {
        setOverviewPersisted(overview.trim());
        setOverviewStatus('saved');
      } else {
        setOverviewStatus('error');
      }
    } catch {
      setOverviewStatus('error');
    }
  }, [currentOperation, overview, overviewPersisted, reportDate]);

  const currentFieldSeasonIds = useMemo(
    () => new Set(currentOperation?.fields.map(f => f.fieldSeasonId) || []),
    [currentOperation]
  );

  // Get water recs for current operation this week
  const weekRange = useMemo(() => getWeekRange(reportDate), [reportDate]);

  // Auto-written SUGGESTIONS are tagged with these report types (the engine writes
  // them; the app's own saves use 'full'/'update'). They must NEVER be treated as
  // saved recs — they only feed the opt-in "Use this..." banner below.
  const SUGGESTION_TAGS = ['full_report', 'water_day_update'];
  const EXCLUDE_FROM_FIELD_RECS = new Set([...SUGGESTION_TAGS, 'overview', 'farm_insight']);
  const savedRecs = useMemo(
    () => waterRecs.filter(wr => !EXCLUDE_FROM_FIELD_RECS.has(wr.reportType)),
    [waterRecs]
  );

  // Past weeks' SAVED full recs per field, newest-first. Powers the read-only
  // "step back through prior weeks" history shown above each rec box. Only
  // 'full' recs with actual text, and only from weeks before the one being
  // written (so the in-progress report never shows up as its own history).
  const pastRecsByFs = useMemo(() => {
    const m = new Map<number, WaterRecRecord[]>();
    savedRecs.forEach(wr => {
      if (wr.reportType === 'full' && wr.recommendation.trim() && wr.date < weekRange.start) {
        if (!m.has(wr.fieldSeasonId)) m.set(wr.fieldSeasonId, []);
        m.get(wr.fieldSeasonId)!.push(wr);
      }
    });
    m.forEach(list => list.sort((a, b) => b.date.localeCompare(a.date)));
    return m;
  }, [savedRecs, weekRange]);

  const thisWeekRecs = useMemo(() => {
    return savedRecs.filter(wr =>
      currentFieldSeasonIds.has(wr.fieldSeasonId) &&
      wr.date >= weekRange.start &&
      wr.date <= weekRange.end
    );
  }, [savedRecs, currentFieldSeasonIds, weekRange]);

  // Today's suggestions for the current operation, keyed by field season
  const suggestionByFs = useMemo(() => {
    const m = new Map<number, WaterRecRecord>();
    waterRecs.forEach(wr => {
      if (
        SUGGESTION_TAGS.includes(wr.reportType) &&
        wr.date === reportDate &&
        currentFieldSeasonIds.has(wr.fieldSeasonId)
      ) {
        m.set(wr.fieldSeasonId, wr);
      }
    });
    return m;
  }, [waterRecs, reportDate, currentFieldSeasonIds]);

  // Farm-level read: sort this operation's fields into reference buckets from
  // today's per-field suggestions — high priority, pulling a lot (due soon),
  // not taking much water (no near-term day), and the steady rest. Just a
  // grouped at-a-glance reference for Ryan, NOT a customer message.
  const farmInsight = useMemo(() => {
    if (!currentOperation) return null;

    const date = new Date(reportDate + 'T12:00:00');
    const jsDay = date.getDay();
    const startIndex = jsDay === 0 ? 6 : jsDay - 1; // Mon=0 index of report date
    const daysOut = (weekday: string): number | null => {
      const t = DAY_NAMES.indexOf(weekday);
      if (t < 0) return null;
      return (t - startIndex + 7) % 7; // 0 = report date's day
    };

    const highPriority: string[] = [];
    const pullingALot: string[] = [];
    const notTakingWater: string[] = [];
    const steady: string[] = [];

    currentOperation.fields.forEach(f => {
      const form = fieldForms[f.fieldSeasonId];
      const name = f.fieldName;
      if (form?.priority) { highPriority.push(name); return; }
      const dayName = form?.waterDay ? DAY_NAMES.find(dn => form.waterDay.includes(dn)) : undefined;
      const d = dayName ? daysOut(dayName) : null;
      if (d !== null && d <= 2) pullingALot.push(name);
      else if (!form?.waterDay) notTakingWater.push(name);
      else steady.push(name);
    });

    const groups = [
      { key: 'priority', label: 'High priority', names: highPriority, cls: 'priority' },
      { key: 'pulling', label: 'Pulling a lot — due soon', names: pullingALot, cls: 'pulling' },
      { key: 'slow', label: 'Not taking much water', names: notTakingWater, cls: 'slow' },
      { key: 'steady', label: 'Steady / on schedule', names: steady, cls: 'steady' },
    ].filter(g => g.names.length > 0);

    if (!groups.length) return null;

    // "Acting unlike its neighbors": the lone outlier(s) within this farm —
    // pulling hard while the rest is calm, or sitting flat while the rest pulls.
    // Only flag when there's a clear majority and a small minority going against it.
    const active = [...highPriority, ...pullingALot]; // wants water now-ish
    const calm = [...notTakingWater, ...steady];      // riding along
    const total = active.length + calm.length;
    let standsApart: string[] = [];
    if (total >= 3 && active.length && calm.length) {
      const minor = Math.max(1, Math.floor(total * 0.34));
      if (active.length <= calm.length && active.length <= minor) standsApart = active;
      else if (calm.length < active.length && calm.length <= minor) standsApart = calm;
    }

    return { groups, standsApart, standoutNames: new Set(standsApart) };
  }, [currentOperation, suggestionByFs, reportDate]);

  // Find the full report (earliest date this week with recs)
  const fullReportRecs = useMemo(() => {
    if (thisWeekRecs.length === 0) return [];
    const dates = [...new Set(thisWeekRecs.map(r => r.date))].sort();
    const earliestDate = dates[0];
    return thisWeekRecs.filter(r => r.date === earliestDate);
  }, [thisWeekRecs]);

  // Existing recs for the selected date (for overwrite detection)
  const existingRecsForDate = useMemo(() => {
    return savedRecs.filter(wr =>
      currentFieldSeasonIds.has(wr.fieldSeasonId) &&
      wr.date === reportDate
    );
  }, [savedRecs, currentFieldSeasonIds, reportDate]);

  // Operations that need reports this week (suggestions don't count as a report)
  const opsNeedingReports = useMemo(() => {
    const opsWithRecs = new Set<number>();
    savedRecs.forEach(wr => {
      if (wr.date >= weekRange.start && wr.date <= weekRange.end) {
        const opId = fsToOperation[wr.fieldSeasonId];
        if (opId) opsWithRecs.add(opId);
      }
    });
    return operations.filter(op => !opsWithRecs.has(op.id));
  }, [operations, savedRecs, weekRange, fsToOperation]);

  // Re-init forms when operation/mode/date changes
  const [lastInitKey, setLastInitKey] = useState('');
  const initKey = `${selectedOperationId}-${mode}-${reportDate}`;
  if (initKey !== lastInitKey) {
    setLastInitKey(initKey);
    if (currentOperation) {
      const forms: Record<number, FieldForm> = {};
      currentOperation.fields.forEach(field => {
        const suggestion = suggestionByFs.get(field.fieldSeasonId);
        if (mode === 'update') {
          const fullRec = fullReportRecs.find(r => r.fieldSeasonId === field.fieldSeasonId);
          const earlyDay = fullRec?.suggestedWaterDay || suggestion?.suggestedWaterDay || '';
          // A late-week 'update' row already saved for this date wins — those are
          // the days Ryan clicked. Otherwise start unselected (early-week day just
          // shows as a shaded reference until he clicks to create the record).
          const savedUpdate = existingRecsForDate.find(
            r => r.fieldSeasonId === field.fieldSeasonId && r.reportType === 'update'
          );
          const clickedDay = savedUpdate?.suggestedWaterDay || '';
          forms[field.fieldSeasonId] = {
            waterDay: clickedDay,
            priority: false,
            recommendation: '',
            expanded: true,
            updateStatus: clickedDay && clickedDay !== earlyDay ? 'updated' : 'continue',
            originalDay: earlyDay,
          };
        } else {
          const existing = existingRecsForDate.find(r => r.fieldSeasonId === field.fieldSeasonId);
          forms[field.fieldSeasonId] = {
            waterDay: existing?.suggestedWaterDay || '',
            priority: existing?.priority || false,
            recommendation: existing?.recommendation || '',
            expanded: true,
            updateStatus: 'continue',
            originalDay: '',
          };
        }
      });
      setFieldForms(forms);
      // Seed the per-rec "persisted" baseline from what's already saved for this
      // date, and clear any stale save pills from the previous view.
      const persisted: Record<number, string> = {};
      currentOperation.fields.forEach(field => {
        const existing = existingRecsForDate.find(r => r.fieldSeasonId === field.fieldSeasonId);
        persisted[field.fieldSeasonId] = (existing?.recommendation || '').trim();
      });
      setRecPersisted(persisted);
      setRecSaveStatus({});
      // Seed water-day persisted baseline
      const dayBaseline: Record<number, string> = {};
      currentOperation.fields.forEach(field => {
        const existing = existingRecsForDate.find(r => r.fieldSeasonId === field.fieldSeasonId);
        dayBaseline[field.fieldSeasonId] = existing?.suggestedWaterDay || '';
      });
      setDayPersisted(dayBaseline);
      setDaySaveStatus({});
      // Seed the update-row id map so an un-click can delete the right row
      const rowIds: Record<number, number | null> = {};
      currentOperation.fields.forEach(field => {
        const savedUpdate = existingRecsForDate.find(
          r => r.fieldSeasonId === field.fieldSeasonId && r.reportType === 'update'
        );
        rowIds[field.fieldSeasonId] = savedUpdate ? savedUpdate.id : null;
      });
      setUpdateRowId(rowIds);
      // Load saved overview for this operation+date (report_type "overview",
      // anchored to the first field_season of the operation)
      const anchorFs = currentOperation.fields[0]?.fieldSeasonId;
      const overviewRec = anchorFs
        ? waterRecs.find(wr => wr.fieldSeasonId === anchorFs && wr.date === reportDate && wr.reportType === 'overview')
        : undefined;
      setOverview(overviewRec?.recommendation || '');
      setOverviewPersisted(overviewRec?.recommendation?.trim() || '');
      setOverviewStatus('idle');
    }
  }

  const updateField = (fsId: number, updates: Partial<FieldForm>) => {
    setFieldForms(prev => ({
      ...prev,
      [fsId]: { ...prev[fsId], ...updates },
    }));
  };

  // Save a SINGLE field's recommendation (full mode) when you click out of it.
  // Goes through the idempotent bulk route scoped to just this field, so it can
  // create/replace this one row without ever touching the rest of the operation.
  const saveOneRec = useCallback(async (fsId: number) => {
    if (mode !== 'full') return;
    const form = fieldForms[fsId];
    if (!form) return;
    const rec = form.recommendation.trim();
    // Nothing to persist (no day, no text) — skip without clearing anything.
    if (!form.waterDay && !rec) return;
    // No change since last save — don't re-hit Baserow.
    if (rec === (recPersisted[fsId] ?? '')) return;

    setRecSaveStatus(s => ({ ...s, [fsId]: 'saving' }));
    try {
      const res = await fetch('/api/water-recs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            field_season: fsId,
            date: reportDate,
            recommendation: rec,
            suggested_water_day: form.waterDay,
            priority: form.priority,
            report_type: 'full',
          }],
          scopeFieldSeasons: [fsId],
          reportType: 'full',
        }),
      });
      const data = await res.json();
      if (res.ok && data.created > 0) {
        setRecPersisted(p => ({ ...p, [fsId]: rec }));
        setRecSaveStatus(s => ({ ...s, [fsId]: 'saved' }));
      } else {
        setRecSaveStatus(s => ({ ...s, [fsId]: 'error' }));
      }
    } catch {
      setRecSaveStatus(s => ({ ...s, [fsId]: 'error' }));
    }
  }, [mode, fieldForms, reportDate, recPersisted]);

  // Navigate between operations
  const currentOpIndex = operations.findIndex(o => o.id === selectedOperationId);
  const goToPrevOp = () => {
    if (currentOpIndex > 0) setSelectedOperationId(operations[currentOpIndex - 1].id);
  };
  const goToNextOp = () => {
    if (currentOpIndex < operations.length - 1) setSelectedOperationId(operations[currentOpIndex + 1].id);
  };

  // Save report
  // Build the records array from the current forms (shared by manual + auto save)
  const collectRecords = useCallback(() => {
    const records: { field_season: number; date: string; recommendation: string; suggested_water_day: string; priority: boolean; report_type: string }[] = [];
    if (!currentOperation) return records;
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
        // Only fields marked "updated" get a new update record;
        // "continue" fields keep their full-report record untouched.
        if (form.updateStatus === 'updated' && form.waterDay) {
          records.push({
            field_season: field.fieldSeasonId,
            date: reportDate,
            recommendation: `Updated to ${form.waterDay}`,
            suggested_water_day: form.waterDay,
            priority: false,
            report_type: 'update',
          });
        }
      }
    });
    return records;
  }, [currentOperation, fieldForms, mode, reportDate]);

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

    // Always save overview first, even if no field recs
    const overviewChanged = overview.trim() !== overviewPersisted.trim();
    await saveOverview();

    try {
      const records = collectRecords();

      if (records.length === 0) {
        if (overviewChanged) {
          showToast('Overview saved');
        } else {
          showToast('Nothing to save - set water days or write recommendations first');
        }
        setSaving(false);
        return;
      }

      const response = await fetch('/api/water-recs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records,
          // Self-cleaning scope: the whole operation's fields + this mode's type.
          // The server decides what to delete from live data, so a stale tab can
          // never pile up duplicates (it used to send frozen page-load ids).
          scopeFieldSeasons: currentOperation.fields.map(f => f.fieldSeasonId),
          reportType: mode === 'full' ? 'full' : 'update',
        }),
      });

      const data = await response.json();
      if (response.ok && data.created > 0) {
        setSavedStatus('saved');
        // Refresh the per-field saved baseline so every rec pill turns green.
        const persisted: Record<number, string> = {};
        records.forEach(r => { persisted[r.field_season] = (r.recommendation || '').trim(); });
        setRecPersisted(prev => ({ ...prev, ...persisted }));
        setRecSaveStatus(prev => {
          const next = { ...prev };
          records.forEach(r => { next[r.field_season] = 'saved'; });
          return next;
        });
        // Bank this operation's time
        if (timerStart) {
          const elapsed = Math.floor((Date.now() - timerStart) / 1000);
          const newTotal = dayTotal + elapsed;
          const newOps = opsCompleted + 1;
          setDayTotal(newTotal);
          setOpsCompleted(newOps);
          setTimerStart(null);
          setTimerElapsed(0);
          const today = new Date().toISOString().split('T')[0];
          localStorage.setItem('wr-timer-today', JSON.stringify({
            date: today, total: newTotal, ops: newOps,
            finishedAt: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          }));
          // Append to history (keep last 30 days)
          const raw = localStorage.getItem('wr-timer-history');
          const history: { date: string; total: number; ops: number; finishedAt: string }[] = raw ? JSON.parse(raw) : [];
          const idx = history.findIndex(h => h.date === today);
          const entry = { date: today, total: newTotal, ops: newOps, finishedAt: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) };
          if (idx >= 0) history[idx] = entry; else history.push(entry);
          localStorage.setItem('wr-timer-history', JSON.stringify(history.slice(-30)));
        }
        showToast(`Saved ${data.created} water recommendations`);
      } else if (response.ok && data.created === 0) {
        console.error('Bulk save errors:', data.errors);
        setSavedStatus('error');
        showToast(`Failed to save - ${data.errors?.[0]?.substring(0, 80) || 'Baserow rejected records'}`);
      } else {
        setSavedStatus('error');
        showToast('Failed to save - please try again');
      }
    } catch {
      setSavedStatus('error');
      showToast('Failed to save - please try again');
    } finally {
      setSaving(false);
    }
  };

  // AUTO-SAVE REMOVED. A debounced auto-save once ran away on a stale tab —
  // every fire batch-created ~42 rows but deleted frozen page-load ids that were
  // already gone, so duplicates piled up endlessly. Saving is manual via the
  // Save button, and the bulk route now self-cleans server-side so even repeated
  // manual saves can't duplicate.

  // Switching operation/mode/date loads a different set of rows — reset the
  // status pill so it doesn't show a stale "saved".
  useEffect(() => {
    setSavedStatus('idle');
  }, [selectedOperationId, mode, reportDate]);

  // Build copy text for Full Report
  // Replace a day name with "Today (Thursday)" when it matches today
  const todayLabel = (dayStr: string): string => {
    const todayName = DAY_NAMES[(new Date().getDay() + 6) % 7]; // JS Sun=0 → DAY_NAMES Mon=0
    if (dayStr === todayName) return `Today (${todayName})`;
    // Handle modifier prefixes like "Morn Thursday"
    if (dayStr.endsWith(todayName) && dayStr !== todayName) {
      return dayStr.replace(todayName, `Today (${todayName})`);
    }
    return dayStr;
  };

  // Sort key: soonest first. ASAP on top, then today, then forward through the
  // week; "Next <day>" is a week out; Hold (and anything unscheduled) sinks last.
  const daySortKey = (dayStr: string): number => {
    if (dayStr === 'ASAP') return -1;
    if (dayStr === 'Hold') return 999;
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const base = dayOrder.find(d => dayStr.includes(d));
    if (!base) return 998;
    const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0
    let away = (dayOrder.indexOf(base) - todayIdx + 7) % 7; // 0=today … 6
    if (dayStr.startsWith('Next')) away += 7;
    return away;
  };

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
      lines.push('HIGH PRIORITY:', '');
      priorityFields.forEach(f => {
        lines.push(f.name);
        lines.push(f.rec, '');
      });
    }

    if (normalFields.length > 0) {
      lines.push('NORMAL PRIORITY:', '');
      normalFields.forEach(f => {
        lines.push(f.name);
        lines.push(f.rec, '');
      });
    }

    // Soonest first: ASAP/today on top → forward through the week → Hold last.
    const scheduleDays = Object.keys(waterSchedule).sort((a, b) => daySortKey(a) - daySortKey(b));
    if (scheduleDays.length > 0) {
      lines.push('Water Schedule:', '');
      scheduleDays.forEach(day => {
        const sorted = [...waterSchedule[day]].sort((a, b) => a.localeCompare(b));
        lines.push(`${todayLabel(day)}:`);
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

      const day = form.waterDay || form.originalDay;
      if (!day) return;

      if (form.updateStatus === 'updated') {
        updatedFields.push({ name: field.fieldName, day });
      } else {
        continueFields.push({ name: field.fieldName, day });
      }
    });

    // One line per field with its water day next to the name, soonest first
    // (ASAP/today on top → forward through the week → Hold last).
    const buildSchedule = (fields: { name: string; day: string }[]): string[] => {
      const sorted = [...fields].sort((a, b) => {
        const byDayDiff = daySortKey(a.day) - daySortKey(b.day);
        return byDayDiff !== 0 ? byDayDiff : a.name.localeCompare(b.name);
      });
      const out = sorted.map(f => `${f.name} - ${todayLabel(f.day)}`);
      out.push('');
      return out;
    };

    if (updatedFields.length > 0) {
      lines.push('Updated day to water near probe:', '');
      lines.push(...buildSchedule(updatedFields));
    }

    if (continueFields.length > 0) {
      lines.push('Continue as scheduled:', '');
      lines.push(...buildSchedule(continueFields));
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
        <SearchableSelect
          value={selectedOperationId ? String(selectedOperationId) : ''}
          onChange={(v) => setSelectedOperationId(parseInt(v) || null)}
          options={operations.length === 0
            ? [{ value: '', label: 'No operations with active probes' }]
            : operations.map(op => ({
                value: String(op.id),
                label: `${op.name} (${op.fields.length} fields)${opsNeedingReports.some(o => o.id === op.id) ? ' *' : ''}`,
              }))
          }
          placeholder="Select operation..."
        />

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
          <span className="wr-timer-section">
            {timerStart && (
              <span className="wr-timer">
                {Math.floor(timerElapsed / 60)}:{String(timerElapsed % 60).padStart(2, '0')}
              </span>
            )}
            {dayTotal > 0 && (
              <span className="wr-timer-total">
                Today: {Math.floor(dayTotal / 60)}m across {opsCompleted} op{opsCompleted !== 1 ? 's' : ''}
              </span>
            )}
            {pastHistory && (
              <span className="wr-timer-past">
                Last time: {Math.floor(pastHistory.total / 60)}m — done by {pastHistory.finishedAt}
              </span>
            )}
          </span>
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
          {/* Claude's farm insight — generated Mon/Tue morning */}
          {(() => {
            const anchorFs = currentOperation.fields[0]?.fieldSeasonId;
            const insight = anchorFs
              ? waterRecs.find(wr => wr.fieldSeasonId === anchorFs && wr.date >= weekRange.start && wr.date <= weekRange.end && wr.reportType === 'farm_insight')
              : undefined;
            if (!insight?.recommendation) return null;
            return (
              <div className="wr-farm-insight">
                <div className="wr-farm-insight-title">What to watch this week</div>
                <div className="wr-farm-insight-text">{insight.recommendation}</div>
              </div>
            );
          })()}

          {/* Farm-level reference: fields sorted into buckets (for Ryan, not the customer) */}
          {farmInsight && (
            <div className="wr-farm-groups">
              <div className="wr-farm-groups-title">Field groups &middot; for your reference</div>
              {farmInsight.standsApart.length > 0 && (
                <div className="wr-farm-note">
                  Acting unlike the rest of this farm: <strong>{farmInsight.standsApart.join(', ')}</strong> — worth a closer look.
                </div>
              )}
              {farmInsight.groups.map(g => (
                <div key={g.key} className={`wr-farm-group ${g.cls}`}>
                  <span className="wr-farm-group-label">{g.label} ({g.names.length})</span>
                  <span className="wr-farm-group-names">{g.names.join(', ')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Overview */}
          <div className="wr-overview-wrap">
            <textarea
              className="wr-textarea"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              onBlur={() => saveOverview()}
              placeholder="General overview message for this operation (optional)..."
              rows={3}
            />
            {overviewStatus === 'saving' && <span className="wr-overview-status">saving…</span>}
            {overviewStatus === 'saved' && <span className="wr-overview-status wr-overview-saved">saved</span>}
            {overviewStatus === 'error' && <span className="wr-overview-status wr-overview-error">not saved</span>}
          </div>

          {/* Field cards */}
          {currentOperation.fields.map(field => {
            const form = fieldForms[field.fieldSeasonId];
            if (!form) return null;
            const isPriority = form.priority;
            const suggestion = suggestionByFs.get(field.fieldSeasonId);
            const isStandout = !!farmInsight?.standoutNames.has(field.fieldName);

            return (
              <div
                key={field.fieldSeasonId}
                className={`wr-field-card${isPriority ? ' priority' : ''}${isStandout ? ' standout' : ''}`}
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
                  <div className="wr-field-info">
                    <span className="wr-field-name">
                      {field.fieldName}
                      {suggestion && (suggestion.recommendation || suggestion.suggestedWaterDay) && (
                        <span className="wr-suggestion-dot" title="Suggestion available">&bull;</span>
                      )}
                      {isStandout && (
                        <span className="wr-standout-chip" title="Acting unlike the rest of this farm">stands out</span>
                      )}
                    </span>
                    <span className="wr-field-meta">
                      {field.crop} &middot; {field.acres} ac
                    </span>
                    {isStandout && (
                      <span className="wr-just-for-you">
                        Just for you — acting different from the rest of this farm, worth a look.
                      </span>
                    )}
                  </div>

                  {/* Water day pills */}
                  <div className="wr-water-day-wrap">
                    <div className="wr-day-pills">
                      {(() => {
                        // Parse current value into modifier + day
                        const val = form.waterDay || '';
                        const parts = val.split(' ');
                        let mod = '';
                        let day = '';
                        if (['Next', 'Morn', 'Eve'].includes(parts[0]) && parts.length > 1) {
                          mod = parts[0];
                          day = parts.slice(1).join(' ');
                        } else {
                          day = val;
                        }

                        const allDays = [
                          { key: 'M', label: 'Monday' },
                          { key: 'T', label: 'Tuesday' },
                          { key: 'W', label: 'Wednesday' },
                          { key: 'R', label: 'Thursday' },
                          { key: 'F', label: 'Friday' },
                          { key: 'Sa', label: 'Saturday' },
                          { key: 'Su', label: 'Sunday' },
                        ];
                        // Rotate so today's day is first
                        const todayJsDay = new Date().getDay(); // 0=Sun
                        const todayIdx = todayJsDay === 0 ? 6 : todayJsDay - 1; // 0=Mon
                        const days = [...allDays.slice(todayIdx), ...allDays.slice(0, todayIdx)];
                        const mods = ['Morn', 'Eve', 'Next', 'ASAP', 'Hold'];

                        const setDay = (label: string) => {
                          const newDay = day === label ? '' : label;
                          const combined = mod && newDay ? `${mod} ${newDay}` : newDay;
                          updateField(field.fieldSeasonId, { waterDay: combined });
                          saveWaterDay(field.fieldSeasonId, combined);
                        };
                        const setMod = (m: string) => {
                          // ASAP and Hold are standalone states, not day modifiers.
                          if (m === 'ASAP' || m === 'Hold') {
                            const newVal = val === m ? '' : m;
                            updateField(field.fieldSeasonId, { waterDay: newVal });
                            saveWaterDay(field.fieldSeasonId, newVal);
                            return;
                          }
                          const newMod = mod === m ? '' : m;
                          const combined = newMod && day ? `${newMod} ${day}` : day;
                          updateField(field.fieldSeasonId, { waterDay: combined });
                          saveWaterDay(field.fieldSeasonId, combined);
                        };

                        const sugDay = suggestion?.suggestedWaterDay || '';
                        const sugDayName = DAY_NAMES.find(dn => sugDay.includes(dn)) || '';

                        return (
                          <>
                            {days.map(d => {
                              const todayIdx = new Date().getDay(); // 0=Sun
                              const dayIdx = DAY_NAMES.indexOf(d.label);
                              // DAY_NAMES is Mon=0, but JS getDay is Mon=1, Sun=0
                              const jsIdx = dayIdx === 6 ? 0 : dayIdx + 1;
                              const away = (jsIdx - todayIdx + 7) % 7;
                              return (
                                <button
                                  key={d.key}
                                  type="button"
                                  className={`wr-pill${day === d.label ? ' active' : ''}${sugDayName === d.label && day !== d.label ? ' suggested' : ''}`}
                                  onClick={() => setDay(d.label)}
                                  title={sugDayName === d.label ? `Suggested: ${sugDay}` : d.label}
                                >
                                  {d.key}
                                  <span className="wr-pill-days">{away === 0 ? '·' : away}</span>
                                </button>
                              );
                            })}
                            <span className="wr-pill-divider" />
                            {mods.map(m => (
                              <button
                                key={m}
                                type="button"
                                className={`wr-pill wr-pill-mod${(m === 'ASAP' || m === 'Hold') ? (val === m ? ' active' : '') : (mod === m ? ' active' : '')}`}
                                onClick={() => setMod(m)}
                              >{m}</button>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                    {/* Fixed-width slot so the pills don't shift when status appears */}
                    <span className={`wr-day-status${daySaveStatus[field.fieldSeasonId] === 'saved' ? ' wr-day-saved' : ''}${daySaveStatus[field.fieldSeasonId] === 'error' ? ' wr-day-error' : ''}`}>
                      {daySaveStatus[field.fieldSeasonId] === 'saving' ? 'saving…'
                        : daySaveStatus[field.fieldSeasonId] === 'saved' ? 'saved'
                        : daySaveStatus[field.fieldSeasonId] === 'error' ? 'error' : ''}
                    </span>
                  </div>
                </div>

                {/* Permanent season note — always visible, saves on blur */}
                <div className="wr-fieldnote">
                  <textarea
                    className="wr-fieldnote-input"
                    value={fieldNotes[field.fieldSeasonId] ?? ''}
                    onChange={(e) => setFieldNotes(n => ({ ...n, [field.fieldSeasonId]: e.target.value }))}
                    onBlur={(e) => saveFieldNote(field.fieldSeasonId, e.target.value)}
                    placeholder="Season note for this field (saved all year)…"
                    rows={1}
                  />
                  {noteStatus[field.fieldSeasonId] && (
                    <span className={`wr-fieldnote-status wr-fieldnote-${noteStatus[field.fieldSeasonId]}`}>
                      {noteStatus[field.fieldSeasonId] === 'saving' && 'saving…'}
                      {noteStatus[field.fieldSeasonId] === 'saved' && 'saved'}
                      {noteStatus[field.fieldSeasonId] === 'error' && 'not saved'}
                    </span>
                  )}
                </div>

                {/* Expanded recommendation area */}
                {form.expanded && (
                  <div className="wr-expanded-area">
                    {(() => {
                      const past = pastRecsByFs.get(field.fieldSeasonId);
                      if (!past || !past.length) return null;
                      const idx = Math.min(pastIdx[field.fieldSeasonId] || 0, past.length - 1);
                      const rec = past[idx];
                      const when = new Date(rec.date + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      });
                      return (
                        <div className="wr-pastrec">
                          <div className="wr-pastrec-head">
                            <span className="wr-pastrec-when">
                              Past week · {when}{rec.priority ? ' · priority' : ''}
                            </span>
                            {past.length > 1 && (
                              <span className="wr-pastrec-nav">
                                <button
                                  type="button"
                                  className="wr-pastrec-btn"
                                  disabled={idx >= past.length - 1}
                                  onClick={() => setPastIdx(p => ({ ...p, [field.fieldSeasonId]: idx + 1 }))}
                                  title="Older week"
                                >
                                  &lsaquo;
                                </button>
                                <span className="wr-pastrec-count">{idx + 1} of {past.length}</span>
                                <button
                                  type="button"
                                  className="wr-pastrec-btn"
                                  disabled={idx <= 0}
                                  onClick={() => setPastIdx(p => ({ ...p, [field.fieldSeasonId]: idx - 1 }))}
                                  title="Newer week"
                                >
                                  &rsaquo;
                                </button>
                              </span>
                            )}
                          </div>
                          <div className="wr-pastrec-text">{rec.recommendation}</div>
                          {rec.suggestedWaterDay && (
                            <div className="wr-pastrec-day">Water day: {rec.suggestedWaterDay}</div>
                          )}
                        </div>
                      );
                    })()}
                    {suggestion && (suggestion.recommendation || suggestion.suggestedWaterDay) && (
                      <div className="wr-suggestion">
                        <div className="wr-suggestion-label">Suggested</div>
                        {suggestion.recommendation && (
                          <div className="wr-suggestion-row">
                            <div className="wr-suggestion-text">{suggestion.recommendation}</div>
                            <button
                              type="button"
                              className="wr-suggestion-use"
                              disabled={form.recommendation === suggestion.recommendation}
                              onClick={() => updateField(field.fieldSeasonId, { recommendation: suggestion.recommendation })}
                            >
                              {form.recommendation === suggestion.recommendation ? 'Used' : 'Use this rec'}
                            </button>
                          </div>
                        )}
                        {suggestion.suggestedWaterDay && (
                          <div className="wr-suggestion-row">
                            <div className="wr-suggestion-day">Water day: {suggestion.suggestedWaterDay}</div>
                            <button
                              type="button"
                              className="wr-suggestion-use"
                              disabled={form.waterDay === suggestion.suggestedWaterDay}
                              onClick={() => updateField(field.fieldSeasonId, { waterDay: suggestion.suggestedWaterDay })}
                            >
                              {form.waterDay === suggestion.suggestedWaterDay ? 'Used' : 'Use this day'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <textarea
                      className={`wr-rec-textarea${isPriority && !form.recommendation.trim() ? ' error' : ''}`}
                      value={form.recommendation}
                      onChange={(e) => updateField(field.fieldSeasonId, { recommendation: e.target.value })}
                      onBlur={() => saveOneRec(field.fieldSeasonId)}
                      placeholder={isPriority ? 'Priority field - recommendation required...' : 'Write a recommendation (or leave blank for status quo)...'}
                      rows={3}
                    />
                    {(() => {
                      const st = recSaveStatus[field.fieldSeasonId];
                      const dirty = form.recommendation.trim() !== (recPersisted[field.fieldSeasonId] ?? '');
                      let label = '';
                      let cls = '';
                      if (st === 'saving') { label = 'Saving…'; cls = 'saving'; }
                      else if (st === 'error') { label = 'Not saved — click Save'; cls = 'error'; }
                      else if (dirty && form.recommendation.trim()) { label = 'Unsaved'; cls = 'dirty'; }
                      else if (!dirty && form.recommendation.trim()) { label = 'Saved'; cls = 'saved'; }
                      return label ? <span className={`wr-recpill wr-recpill-${cls}`}>{label}</span> : null;
                    })()}
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
            const suggestion = suggestionByFs.get(field.fieldSeasonId);

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

                {/* Click a day to create the late-week record; the early-week
                    day shows shaded as a reference until you do. */}
                <div className="wr-water-day-wrap">
                  <div className="wr-day-pills">
                    {(() => {
                      const val = form.waterDay || '';
                      const parts = val.split(' ');
                      let mod = '';
                      let day = '';
                      if (['Next', 'Morn', 'Eve'].includes(parts[0]) && parts.length > 1) {
                        mod = parts[0];
                        day = parts.slice(1).join(' ');
                      } else {
                        day = val;
                      }

                      const allDays = [
                        { key: 'M', label: 'Monday' },
                        { key: 'T', label: 'Tuesday' },
                        { key: 'W', label: 'Wednesday' },
                        { key: 'R', label: 'Thursday' },
                        { key: 'F', label: 'Friday' },
                        { key: 'Sa', label: 'Saturday' },
                        { key: 'Su', label: 'Sunday' },
                      ];
                      const todayJsDay = new Date().getDay();
                      const todayIdx = todayJsDay === 0 ? 6 : todayJsDay - 1;
                      const days = [...allDays.slice(todayIdx), ...allDays.slice(0, todayIdx)];
                      const mods = ['Morn', 'Eve', 'Next', 'ASAP', 'Hold'];

                      // Clicking a day creates the late-week record right away
                      // (or removes it when cleared). Same day as early week =>
                      // "continue as scheduled"; a different day => "updated".
                      const statusFor = (v: string) =>
                        v && v !== form.originalDay ? 'updated' : 'continue';
                      const setDay = (label: string) => {
                        const newDay = day === label ? '' : label;
                        const combined = mod && newDay ? `${mod} ${newDay}` : newDay;
                        updateField(field.fieldSeasonId, { waterDay: combined, updateStatus: statusFor(combined) });
                        saveUpdateDay(field.fieldSeasonId, combined);
                      };
                      const setMod = (m: string) => {
                        // ASAP and Hold are standalone states, not day modifiers.
                        if (m === 'ASAP' || m === 'Hold') {
                          const newVal = val === m ? '' : m;
                          updateField(field.fieldSeasonId, { waterDay: newVal, updateStatus: statusFor(newVal) });
                          saveUpdateDay(field.fieldSeasonId, newVal);
                          return;
                        }
                        const newMod = mod === m ? '' : m;
                        const combined = newMod && day ? `${newMod} ${day}` : day;
                        updateField(field.fieldSeasonId, { waterDay: combined, updateStatus: statusFor(combined) });
                        saveUpdateDay(field.fieldSeasonId, combined);
                      };

                      // Early-week day from full report (auto-shaded)
                      const origDayName = DAY_NAMES.find(dn => (form.originalDay || '').includes(dn)) || '';
                      // Engine's suggested day (auto-outlined)
                      const sugDay = suggestion?.suggestedWaterDay || '';
                      const sugDayName = DAY_NAMES.find(dn => sugDay.includes(dn)) || '';

                      return (
                        <>
                          {days.map(d => {
                            const todayIdx = new Date().getDay();
                            const dayIdx = DAY_NAMES.indexOf(d.label);
                            const jsIdx = dayIdx === 6 ? 0 : dayIdx + 1;
                            const away = (jsIdx - todayIdx + 7) % 7;
                            const isOrig = origDayName === d.label && day !== d.label;
                            const isSug = sugDayName === d.label && day !== d.label;
                            const titleParts = [];
                            if (isSug) titleParts.push(`Suggested: ${sugDay}`);
                            if (isOrig) titleParts.push(`Early week: ${form.originalDay}`);
                            return (
                              <button
                                key={d.key}
                                type="button"
                                className={`wr-pill${day === d.label ? ' active' : ''}${isOrig ? ' early-week' : ''}${isSug ? ' suggested' : ''}`}
                                onClick={() => setDay(d.label)}
                                title={titleParts.length ? titleParts.join(' · ') : d.label}
                              >
                                {d.key}
                                <span className="wr-pill-days">{away === 0 ? '·' : away}</span>
                              </button>
                            );
                          })}
                          <span className="wr-pill-divider" />
                          {mods.map(m => (
                            <button
                              key={m}
                              type="button"
                              className={`wr-pill wr-pill-mod${(m === 'ASAP' || m === 'Hold') ? (val === m ? ' active' : '') : (mod === m ? ' active' : '')}`}
                              onClick={() => setMod(m)}
                            >{m}</button>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                  {/* Fixed-width slot so the pills don't shift when status appears */}
                  <span className={`wr-day-status${daySaveStatus[field.fieldSeasonId] === 'saved' ? ' wr-day-saved' : ''}${daySaveStatus[field.fieldSeasonId] === 'error' ? ' wr-day-error' : ''}`}>
                    {daySaveStatus[field.fieldSeasonId] === 'saving' ? 'saving…'
                      : daySaveStatus[field.fieldSeasonId] === 'saved' ? 'saved'
                      : daySaveStatus[field.fieldSeasonId] === 'error' ? 'error' : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      {currentOperation && (
        <div className="wr-actions">
          {/* In update mode each day click saves its own record, so no batch
              Save button — only the full report needs one. */}
          {mode === 'full' && (
            <button
              className="wr-save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Report'}
            </button>
          )}
          <button
            className="wr-copy-btn"
            onClick={handleCopyAll}
          >
            Copy All
          </button>
          {savedStatus !== 'idle' && (
            <span className={`wr-autosave wr-autosave-${savedStatus}`}>
              {savedStatus === 'saving' && 'Saving…'}
              {savedStatus === 'saved' && 'Saved'}
              {savedStatus === 'error' && 'Save failed — try again'}
            </span>
          )}
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
