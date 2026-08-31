'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  // Front-end-only probe label for 2-probe fields ("NE", "SW") — rides along
  // in the copied report next to the field name; not saved to Baserow.
  probeLabel: string;
}

// ── Spell helper ─────────────────────────────────────────────────────────────
// Common missing-apostrophe contractions and typos. Deliberately excludes
// ambiguous words that are also valid ("its", "were", "well", "id", "shed").
const SPELL_FIXES: Record<string, string> = {
  cant: "can't", dont: "don't", wont: "won't", isnt: "isn't", arent: "aren't",
  wasnt: "wasn't", werent: "weren't", hasnt: "hasn't", havent: "haven't",
  hadnt: "hadn't", doesnt: "doesn't", didnt: "didn't", couldnt: "couldn't",
  wouldnt: "wouldn't", shouldnt: "shouldn't", thats: "that's", whats: "what's",
  heres: "here's", theres: "there's", lets: "let's", youre: "you're",
  theyre: "they're", weve: "we've", youve: "you've", theyve: "they've",
  ive: "I've", im: "I'm", whos: "who's", wheres: "where's",
  teh: "the", adn: "and", taht: "that", wich: "which", recieve: "receive",
  seperate: "separate", definately: "definitely", alot: "a lot",
  untill: "until", occured: "occurred", thier: "their", beleive: "believe",
  becuase: "because", tommorow: "tomorrow", wierd: "weird",
  irrigaiton: "irrigation", irrigaton: "irrigation", moisure: "moisture",
  fertlizer: "fertilizer", fertilzer: "fertilizer", feild: "field",
  probaly: "probably", probally: "probably",
};

// Match the suggestion's capitalization to the typed word ("Cant" → "Can't")
function matchCase(typed: string, suggestion: string): string {
  if (typed[0] === typed[0].toUpperCase()) {
    return suggestion[0].toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

function findSpellIssues(text: string): { typed: string; fix: string }[] {
  const seen = new Set<string>();
  const out: { typed: string; fix: string }[] = [];
  for (const m of text.matchAll(/[A-Za-z]+/g)) {
    const word = m[0];
    const key = word.toLowerCase();
    const fix = SPELL_FIXES[key];
    if (fix && !seen.has(key)) {
      seen.add(key);
      out.push({ typed: word, fix: matchCase(word, fix) });
    }
  }
  return out;
}

function applyWordFix(text: string, typed: string, fix: string): string {
  return text.replace(new RegExp(`\\b${typed}\\b`, 'gi'), (m) => matchCase(m, fix));
}

// Hunspell dictionary layer (typo-js) — lazy-loaded once from /public/dict on
// first use, so the ~550KB dictionary never touches other pages.
let _typoPromise: Promise<import('typo-js').default | null> | null = null;
function loadTypo() {
  if (!_typoPromise) {
    _typoPromise = (async () => {
      try {
        const [{ default: Typo }, aff, dic] = await Promise.all([
          import('typo-js'),
          fetch('/dict/en_US.aff').then(r => r.text()),
          fetch('/dict/en_US.dic').then(r => r.text()),
        ]);
        return new Typo('en_US', aff, dic);
      } catch (e) {
        console.error('Spell dictionary failed to load (non-fatal):', e);
        return null;
      }
    })();
  }
  return _typoPromise;
}
const _suggestCache = new Map<string, string | null>();

// Small edit-distance check so we only suggest genuinely close corrections
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

/** Clickable fix chips under a text box: "cant → can't". Click subs all occurrences. */
function SpellHelper({ text, onFix, ignore }: {
  text: string;
  onFix: (newText: string) => void;
  ignore?: Set<string>;
}) {
  const [dictIssues, setDictIssues] = useState<{ typed: string; fix: string }[]>([]);

  useEffect(() => {
    if (!text.trim()) { setDictIssues([]); return; }
    const timer = setTimeout(async () => {
      const typo = await loadTypo();
      if (!typo) return;
      const seen = new Set<string>();
      const found: { typed: string; fix: string }[] = [];
      // Apostrophe words tokenize whole ("didn't", "Seril's") and are skipped:
      // contractions belong to the curated layer, and splitting them here made
      // the dictionary flag fragments like "didn" (→ "Din").
      for (const m of text.matchAll(/[A-Za-z']+/g)) {
        if (found.length >= 4) break; // don't flood the box
        const word = m[0];
        if (word.includes("'")) continue;
        const key = word.toLowerCase();
        if (word.length < 4 || seen.has(key)) continue;
        seen.add(key);
        if (SPELL_FIXES[key]) continue;            // curated layer already covers it
        if (ignore?.has(key)) continue;            // field/operation names, ag terms
        if (word === word.toUpperCase()) continue; // acronyms (VWC, ASAP)
        if (typo.check(word) || typo.check(key) || typo.check(key[0].toUpperCase() + key.slice(1))) continue;
        let fix = _suggestCache.get(key);
        if (fix === undefined) {
          const suggestions = typo.suggest(word, 3) || [];
          fix = suggestions.find(s => editDistance(key, s.toLowerCase()) <= 2) ?? null;
          _suggestCache.set(key, fix);
        }
        if (fix) found.push({ typed: word, fix: matchCase(word, fix) });
      }
      setDictIssues(found);
    }, 600); // debounce so it never checks mid-word
    return () => clearTimeout(timer);
  }, [text, ignore]);

  const curated = findSpellIssues(text);
  const curatedKeys = new Set(curated.map(i => i.typed.toLowerCase()));
  const issues = [...curated, ...dictIssues.filter(i => !curatedKeys.has(i.typed.toLowerCase()))];
  if (issues.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {issues.map(({ typed, fix }) => (
        <button
          key={typed.toLowerCase()}
          type="button"
          onClick={() => onFix(applyWordFix(text, typed, fix))}
          title={`Replace "${typed}" with "${fix}"`}
          style={{
            fontSize: 12, padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
            border: '1px solid #e0ba63', background: '#fdf6e3', color: '#7a5c0f',
          }}
        >
          {typed} → <b>{fix}</b>
        </button>
      ))}
    </div>
  );
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

type CropWeather = {
  status: 'loading' | 'ready' | 'error';
  gdu?: number;
  recentGdu?: number;
  recentEt0Inches?: number;
  throughDate?: string;
};

type MaturityInfo = {
  label: string;
  title: string;
  relativeMaturity?: number;
};

function getBlackLayerTargetGdu(relativeMaturity: number | undefined): number | null {
  if (!relativeMaturity) return null;
  const u2u = Math.round(129.1 + 22.8 * relativeMaturity);
  // Local floor from 2026-08-25 kernel checks: 108–112s were a week early
  // on U2U. 2860 puts Connie's Holdrege (~112 RM, planted Apr 13) at about
  // 5 days to black layer on Aug 30, not 2. 113+ stay at 2750.
  const localFloor = relativeMaturity <= 112 ? 2860 : 2750;
  return Math.max(u2u, localFloor);
}

function daysToBlackLayer(remainingGdu: number, recentGdu?: number): number {
  if (remainingGdu <= 0) return 0;
  const pace = typeof recentGdu === 'number' && recentGdu > 0 ? recentGdu / 7 : 25;
  return Math.max(1, Math.round(remainingGdu / pace));
}

function cropWeatherKey(plantingDate: string, asOfDate: string): string {
  return `${plantingDate}:${asOfDate}`;
}

/** Pioneer P1457 -> 114 RM; other brands may include a literal 80-125 rating. */
function parseCornRelativeMaturity(hybrid: string): number | null {
  const normalized = hybrid.trim().toUpperCase();
  const pioneer = normalized.match(/^P?(\d{2})\d{2}/);
  if (pioneer) {
    const prefix = Number(pioneer[1]);
    if (prefix >= 0 && prefix <= 25) return 100 + prefix;
  }
  const literal = normalized.match(/(?:^|\D)(8\d|9\d|1[01]\d|12[0-5])(?:\D|$)/);
  return literal ? Number(literal[1]) : null;
}

/** Pioneer soybean products such as P23Z58 encode maturity group 2.3. */
function parseSoybeanMaturityGroup(hybrid: string): number | null {
  const match = hybrid.trim().toUpperCase().match(/^P?(\d)(\d)[A-Z]/);
  return match ? Number(`${match[1]}.${match[2]}`) : null;
}

function getMaturityLabel(crop: string, hybrid: string): MaturityInfo | null {
  if (!hybrid) return null;
  const cropName = crop.toLowerCase();

  if (cropName.includes('corn')) {
    const relativeMaturity = parseCornRelativeMaturity(hybrid);
    if (relativeMaturity) {
      return {
        label: `${relativeMaturity} RM`,
        title: 'Comparative relative maturity. RM is not a literal number of calendar days after planting.',
        relativeMaturity,
      };
    }
  }

  if (cropName.includes('soy') || cropName.includes('bean')) {
    const maturityGroup = parseSoybeanMaturityGroup(hybrid);
    if (maturityGroup !== null) {
      return {
        label: `MG ${maturityGroup.toFixed(1)}`,
        title: 'Soybean maturity group; this is not a calendar-day rating.',
      };
    }
  }

  return null;
}

function getBlackLayerCopyLabel(
  field: OperationGroup['fields'][number],
  weather?: CropWeather,
): string | null {
  if (!field.crop.toLowerCase().includes('corn') || weather?.status !== 'ready') return null;
  const maturity = getMaturityLabel(field.crop, field.hybridVariety);
  if (!maturity?.relativeMaturity || typeof weather.gdu !== 'number') return null;

  const targetGdu = getBlackLayerTargetGdu(maturity.relativeMaturity);
  if (targetGdu === null) return null;
  const remainingGdu = targetGdu - weather.gdu;
  if (remainingGdu <= 0) return 'estimated at black layer';
  const days = daysToBlackLayer(remainingGdu, weather.recentGdu);
  return `about ${days} day${days === 1 ? '' : 's'} to black layer`;
}

function FieldCropDetails({
  field,
  weather,
}: {
  field: OperationGroup['fields'][number];
  weather?: CropWeather;
}) {
  const maturity = getMaturityLabel(field.crop, field.hybridVariety);
  const isCorn = field.crop.toLowerCase().includes('corn');
  const planted = field.plantingDate
    ? new Date(`${field.plantingDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'date missing';
  const through = weather?.throughDate
    ? new Date(`${weather.throughDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  // U2U Corn GDD model with a local floor (2860 at 112 RM and earlier, else 2750).
  const estimatedBlackLayerGdu = getBlackLayerTargetGdu(maturity?.relativeMaturity);
  const accumulatedGdu = weather?.status === 'ready' && typeof weather.gdu === 'number'
    ? weather.gdu
    : null;
  const remainingGdu = accumulatedGdu !== null && estimatedBlackLayerGdu !== null
    ? estimatedBlackLayerGdu - accumulatedGdu
    : null;
  const estimatedDays = remainingGdu !== null
    ? daysToBlackLayer(remainingGdu, weather?.recentGdu)
    : null;

  return (
    <span className="wr-crop-details">
      <span>{field.hybridVariety || 'hybrid missing'}</span>
      <span>Planted {planted}</span>
      {maturity && <span className="wr-maturity-factor" title={maturity.title}>{maturity.label}</span>}
      {field.plantingDate && isCorn && (
        <span
          className="wr-gdu-factor"
          title={through ? `Corn GDU (base 50, 86°/50° method) accumulated at Holdrege through ${through}.` : undefined}
        >
          {accumulatedGdu !== null && estimatedBlackLayerGdu !== null
            ? `${accumulatedGdu.toLocaleString()} / ~${estimatedBlackLayerGdu.toLocaleString()} GDU`
            : weather?.status === 'ready' && accumulatedGdu !== null
              ? `${accumulatedGdu.toLocaleString()} GDU`
            : weather?.status === 'error' ? 'GDU unavailable' : 'GDU…'}
        </span>
      )}
      {remainingGdu !== null && (
        <span
          className="wr-black-layer-factor"
          title="Estimated from planting-date GDU accumulation, recent heat, and hybrid maturity. This is physiological maturity (black layer), not milk line or harvest-ready."
        >
          {remainingGdu > 0
            ? `about ${estimatedDays}d to black layer`
            : 'estimated at black layer'}
        </span>
      )}
      {weather?.status === 'ready' && typeof weather.recentEt0Inches === 'number' && (
        <span
          className="wr-et-factor"
          title={`Seven completed days of FAO grass reference evapotranspiration (ET₀) at Holdrege${through ? ` through ${through}` : ''}. Weather context only—not an irrigation recommendation or Axtell alfalfa ET.`}
        >
          7d grass ET₀ {weather.recentEt0Inches.toFixed(2)} in
        </span>
      )}
    </span>
  );
}

// Ryan's report routes, in the exact order he writes them. Mon & Thu use one
// order, Tue & Fri the other (full report early week, update late week).
// Values are operation ids (from Baserow operations table 817295).
const ROUTE_MON_THU = [36, 48, 72, 34, 53, 79, 82, 166, 49, 52, 64, 40, 55, 133, 75, 80, 83, 86];
const ROUTE_TUE_FRI = [67, 35, 76, 47, 68, 51, 91, 77, 66, 69, 39, 90, 41, 92, 265, 46, 56, 87];

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

  // Keep the selected customer, report type, and date in the URL so a refresh
  // (or a shared/bookmarked link) lands back on the same view instead of
  // resetting to the first operation. Uses history.replaceState so it never
  // triggers a page refetch.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const op = params.get('op');
    const m = params.get('mode');
    const d = params.get('date');
    if (m === 'full' || m === 'update') setMode(m);
    // Honor a date from the URL only if it's today or later. A PAST date is a
    // stale leftover from a tab left open on an earlier day — trusting it
    // silently writes today's reports onto that old date (caused duplicate sets
    // on the wrong day). Same-day refresh (date === today) still persists, and
    // intentionally forward-dated reports (writing tomorrow's tonight) still work.
    const today = new Date().toISOString().split('T')[0];
    const urlDateValid = !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const effectiveDate = urlDateValid && d! >= today ? d! : today;
    setReportDate(effectiveDate);
    // Which customer to land on. Keep the saved op only if it's part of TODAY's
    // route (a genuine mid-route refresh). If it's from the other day's route
    // (or there's no saved op), start at the top of today's route instead.
    const opNum = op && operations.some(o => String(o.id) === op) ? Number(op) : null;
    const dstr = effectiveDate;
    const isTueFri = [2, 5].includes(new Date(dstr + 'T12:00:00').getDay());
    const otherRouteIds = isTueFri ? ROUTE_MON_THU : ROUTE_TUE_FRI;
    if (opNum != null && !otherRouteIds.includes(opNum)) {
      setSelectedOperationId(opNum);
    } else {
      const routeIds = isTueFri ? ROUTE_TUE_FRI : ROUTE_MON_THU;
      const byId = new Map(operations.map(o => [o.id, o]));
      const top = routeIds.map(id => byId.get(id)).find(Boolean) || operations[0];
      if (top) setSelectedOperationId(top.id);
    }
    // Run once on mount to read the incoming URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipFirstUrlSync = useRef(true);
  useEffect(() => {
    // Skip the mount run so we don't clobber the URL before restore reads it.
    if (skipFirstUrlSync.current) { skipFirstUrlSync.current = false; return; }
    if (selectedOperationId == null) return;
    const params = new URLSearchParams();
    params.set('op', String(selectedOperationId));
    params.set('mode', mode);
    params.set('date', reportDate);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [selectedOperationId, mode, reportDate]);

  const [overview, setOverview] = useState('');
  const [overviewPersisted, setOverviewPersisted] = useState('');
  const [overviewStatus, setOverviewStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [fieldForms, setFieldForms] = useState<Record<number, FieldForm>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Small status pill next to the Save button (saving / saved / error).
  const [savedStatus, setSavedStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Fields flagged as missing a rec/water day when Copy All was clicked;
  // non-null means the warning is showing and the next click copies anyway.
  const [copyWarning, setCopyWarning] = useState<string[] | null>(null);

  // Per-recommendation save tracking. `recPersisted` holds the rec text currently
  // in Baserow for each field; `recSaveStatus` drives the little pill. When you
  // click out of a recommendation it saves just that field through the (now
  // idempotent) bulk route, so it can't duplicate or wipe anything else.
  const [recPersisted, setRecPersisted] = useState<Record<number, string>>({});
  const [recSaveStatus, setRecSaveStatus] = useState<Record<number, 'saving' | 'saved' | 'error'>>({});

  // Scratch checkboxes for picking which probes to write recs on this week.
  // Deliberately NOT saved to Baserow and NOT persisted between weeks — it's a
  // working list for the current sitting only.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const togglePicked = (id: number) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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

  // Weather is shared by fields with the same planting date. Fetch once per
  // unique date for the selected operation instead of once per field card.
  const [cropWeather, setCropWeather] = useState<Record<string, CropWeather>>({});
  useEffect(() => {
    if (!currentOperation) return;
    const plantingDates = [...new Set(
      currentOperation.fields.map(field => field.plantingDate).filter(date => Boolean(date))
    )];
    if (plantingDates.length === 0) return;

    setCropWeather(current => {
      const next = { ...current };
      plantingDates.forEach(date => { next[cropWeatherKey(date, reportDate)] = { status: 'loading' }; });
      return next;
    });

    let cancelled = false;
    Promise.all(plantingDates.map(async plantingDate => {
      const key = cropWeatherKey(plantingDate, reportDate);
      try {
        const params = new URLSearchParams({ start: plantingDate, end: reportDate });
        const response = await fetch(`/api/gdu?${params.toString()}`);
        if (!response.ok) throw new Error('Weather unavailable');
        const data = await response.json();
        return [key, {
          status: 'ready',
          gdu: data.gdu,
          recentGdu: data.recentGdu,
          recentEt0Inches: data.recentEt0Inches,
          throughDate: data.throughDate,
        } satisfies CropWeather] as const;
      } catch {
        return [key, { status: 'error' } satisfies CropWeather] as const;
      }
    })).then(results => {
      if (cancelled) return;
      setCropWeather(current => ({ ...current, ...Object.fromEntries(results) }));
    });

    return () => { cancelled = true; };
  }, [currentOperation, reportDate]);

  // Words the spell checker should never flag: every operation and field name
  // plus ag terms that aren't in a standard dictionary.
  const spellIgnore = useMemo(() => {
    const s = new Set<string>(['fertigation', 'fertigate', 'fertigating', 'cropx',
      'pivots', 'subsoiling', 'sidedress', 'sidedressing', 'dryland', 'acre']);
    operations.forEach(op => {
      `${op.name} ${op.fields.map(f => f.fieldName).join(' ')}`
        .split(/[^A-Za-z]+/)
        .forEach(w => { if (w) s.add(w.toLowerCase()); });
    });
    return s;
  }, [operations]);

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

  // Most recent PRIOR-week water day per field (full or update rec) — shown as
  // the shaded "last time" pill in the early-week picker.
  const prevDayByFs = useMemo(() => {
    const m = new Map<number, string>();
    [...savedRecs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(wr => {
        if (wr.date < weekRange.start && wr.suggestedWaterDay) {
          m.set(wr.fieldSeasonId, wr.suggestedWaterDay); // later dates overwrite
        }
      });
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
            probeLabel: '',
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
            probeLabel: '',
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

  // Report route: which customer order to walk. Auto-picks by the report date's
  // weekday (Mon/Thu = one order, Tue/Fri = the other); can be overridden.
  const [routeChoice, setRouteChoice] = useState<'auto' | 'mon_thu' | 'tue_fri'>('auto');
  const autoRoute: 'mon_thu' | 'tue_fri' = useMemo(() => {
    const wd = new Date(reportDate + 'T12:00:00').getDay(); // 0=Sun … 2=Tue,5=Fri
    return wd === 2 || wd === 5 ? 'tue_fri' : 'mon_thu';
  }, [reportDate]);
  const activeRoute = routeChoice === 'auto' ? autoRoute : routeChoice;

  // Operations assigned to the selected day's route, in route order. Keep
  // unassigned operations available in the customer dropdown, but do not append
  // them here: the route progress should answer how many reports are due today.
  const orderedOps = useMemo(() => {
    const routeIds = activeRoute === 'tue_fri' ? ROUTE_TUE_FRI : ROUTE_MON_THU;
    const byId = new Map(operations.map(o => [o.id, o]));
    return routeIds.map(id => byId.get(id)).filter(Boolean) as typeof operations;
  }, [operations, activeRoute]);

  // Navigate between operations, following the route order
  const currentOpIndex = orderedOps.findIndex(o => o.id === selectedOperationId);
  const nextOp = currentOpIndex >= 0 && currentOpIndex < orderedOps.length - 1
    ? orderedOps[currentOpIndex + 1] : null;
  const prevOp = currentOpIndex > 0 ? orderedOps[currentOpIndex - 1] : null;
  const goToPrevOp = () => {
    if (prevOp) setSelectedOperationId(prevOp.id);
  };
  const goToNextOp = () => {
    if (nextOp) setSelectedOperationId(nextOp.id);
  };

  // Pick a route from the toggle; if the current customer isn't in that route,
  // jump to that route's first customer so the toggle actually moves you there.
  const chooseRoute = (r: 'auto' | 'mon_thu' | 'tue_fri') => {
    setRouteChoice(r);
    const eff = r === 'auto' ? autoRoute : r;
    const ids = eff === 'tue_fri' ? ROUTE_TUE_FRI : ROUTE_MON_THU;
    if (selectedOperationId == null || !ids.includes(selectedOperationId)) {
      const byId = new Map(operations.map(o => [o.id, o]));
      const top = ids.map(id => byId.get(id)).find(Boolean);
      if (top) setSelectedOperationId(top.id);
    }
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
    setCopyWarning(null);
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

  // Copy formatting: "Morn Thursday" → "Thursday Morning", "Eve Thursday" →
  // "Thursday Evening" (time of day reads AFTER the day); "Next Thursday"
  // keeps Next in front. Works for two-day picks ("Wednesday or Thursday").
  const formatDayForCopy = (dayStr: string): string => {
    const parts = dayStr.split(' ');
    if (parts[0] === 'Morn' && parts.length > 1) return `${todayLabel(parts.slice(1).join(' '))} Morning`;
    if (parts[0] === 'Eve' && parts.length > 1) return `${todayLabel(parts.slice(1).join(' '))} Evening`;
    return todayLabel(dayStr);
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

      // "Cosmo East (NE)" when a probe label is set on a 2-probe field
      const name = form.probeLabel.trim()
        ? `${field.fieldName} (${form.probeLabel.trim()})`
        : field.fieldName;
      const maturityLabel = getBlackLayerCopyLabel(
        field,
        field.plantingDate ? cropWeather[cropWeatherKey(field.plantingDate, reportDate)] : undefined,
      );
      const reportName = maturityLabel ? `${name} — ${maturityLabel}` : name;

      if (form.waterDay) {
        if (!waterSchedule[form.waterDay]) waterSchedule[form.waterDay] = [];
        waterSchedule[form.waterDay].push(reportName);
      }

      if (form.recommendation.trim()) {
        if (form.priority) {
          priorityFields.push({ name: reportName, rec: form.recommendation.trim() });
        } else {
          normalFields.push({ name: reportName, rec: form.recommendation.trim() });
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
      // Only label this block when there is a HIGH PRIORITY block above it to
      // tell it apart from. When nothing is flagged, every field is normal and
      // the header says nothing — so the copy just lists the fields.
      if (priorityFields.length > 0) lines.push('NORMAL PRIORITY:', '');
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
        lines.push(`${formatDayForCopy(day)}:`);
        sorted.forEach(name => lines.push(name));
        lines.push('');
      });
    }

    return lines.join('\n').trim();
  };

  // Build copy text for Update
  const buildUpdateText = (plain = false): string => {
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

      const name = form.probeLabel.trim()
        ? `${field.fieldName} (${form.probeLabel.trim()})`
        : field.fieldName;
      const maturityLabel = getBlackLayerCopyLabel(
        field,
        field.plantingDate ? cropWeather[cropWeatherKey(field.plantingDate, reportDate)] : undefined,
      );
      const reportName = maturityLabel ? `${name} — ${maturityLabel}` : name;

      if (form.updateStatus === 'updated') {
        updatedFields.push({ name: reportName, day });
      } else {
        continueFields.push({ name: reportName, day });
      }
    });

    // One line per field with its water day next to the name, soonest first
    // (ASAP/today on top → forward through the week → Hold last).
    const buildSchedule = (fields: { name: string; day: string }[]): string[] => {
      const sorted = [...fields].sort((a, b) => {
        const byDayDiff = daySortKey(a.day) - daySortKey(b.day);
        return byDayDiff !== 0 ? byDayDiff : a.name.localeCompare(b.name);
      });
      const out = sorted.map(f => `${f.name} - ${formatDayForCopy(f.day)}`);
      out.push('');
      return out;
    };

    if (updatedFields.length > 0) {
      lines.push('Updated day to water near probe:', '');
      lines.push(...buildSchedule(updatedFields));
    }

    if (continueFields.length > 0) {
      if (!plain) lines.push('Continue as scheduled:', '');
      lines.push(...buildSchedule(continueFields));
    }

    return lines.join('\n').trim();
  };

  // Fields that would be silently missing from the copied report: in full
  // mode a field with neither a recommendation nor a water day; in update
  // mode a field with no day at all.
  const getMissedFields = (): string[] => {
    if (!currentOperation) return [];
    return currentOperation.fields
      .filter(field => {
        const form = fieldForms[field.fieldSeasonId];
        if (!form) return true;
        if (mode === 'full') return !form.recommendation.trim() && !form.waterDay;
        return !(form.waterDay || form.originalDay);
      })
      .map(field => field.fieldName);
  };

  const handleCopyAll = async (plainUpdate = false) => {
    // Safety check: warn once about fields the report would silently skip;
    // a second click copies anyway.
    const missed = getMissedFields();
    if (missed.length > 0 && copyWarning === null) {
      setCopyWarning(missed);
      showToast(`${missed.length} field${missed.length !== 1 ? 's' : ''} missing — check warning`);
      return;
    }
    setCopyWarning(null);
    const text = mode === 'full' ? buildFullReportText() : buildUpdateText(plainUpdate);
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
      {/* Who you are writing for, said plainly and once. The dropdown alone was
          not enough: it looks like a filter, not an answer, so the eye skipped
          it and landed on the Next button's name instead. */}
      {currentOperation && (
        <div className="wr-current-op">
          <span className="wr-current-op-eyebrow">Writing reports for</span>
          <strong className="wr-current-op-name">{currentOperation.name}</strong>
          <span className="wr-current-op-meta">
            {currentOperation.fields.length} field{currentOperation.fields.length === 1 ? '' : 's'}
            {currentOpIndex >= 0 ? ` · ${currentOpIndex + 1} of ${orderedOps.length} on today's route` : ''}
          </span>
        </div>
      )}

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

        {/* Route toggle: which customer order to walk */}
        <div className="wr-route-pills" title="Report order — auto-picks by weekday">
          {(['auto', 'mon_thu', 'tue_fri'] as const).map(r => (
            <button
              key={r}
              className={`wr-route-pill${routeChoice === r ? ' active' : ''}`}
              onClick={() => chooseRoute(r)}
            >
              {r === 'auto' ? `Auto (${autoRoute === 'tue_fri' ? 'Tu/Fr' : 'Mo/Th'})` : r === 'mon_thu' ? 'Mo/Th' : 'Tu/Fr'}
            </button>
          ))}
        </div>

        <div className="wr-pagination">
          <button
            className="wr-page-btn"
            onClick={goToPrevOp}
            disabled={!prevOp}
            title={prevOp ? `Prev: ${prevOp.name}` : ''}
          >
            &larr; Prev
          </button>
          <span className="wr-route-progress">
            {currentOpIndex >= 0 ? currentOpIndex + 1 : '–'} / {orderedOps.length}
          </span>
          <button
            className="wr-page-btn wr-page-next"
            onClick={goToNextOp}
            disabled={!nextOp}
            title={nextOp ? `Next: ${nextOp.name}` : ''}
          >
            {/* The destination's name used to be the boldest thing on this row,
                while the grower actually open sat in a muted dropdown — so it
                read as "you are on Dwight" and cost a set of reports opened
                against the wrong grower's probes. The label leads with the
                action now; the name rides along quietly underneath. */}
            <span className="wr-page-next-label">Next &rarr;</span>
            {nextOp && <small className="wr-page-next-name">{nextOp.name}</small>}
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
            <SpellHelper text={overview} onFix={setOverview} ignore={spellIgnore} />
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

                  {/* Scratch pick-list checkbox (full/early-week mode only).
                      Front-end only — never saved, cleared on reload. */}
                  {mode === 'full' && (
                    <input
                      type="checkbox"
                      className="wr-pick"
                      checked={picked.has(field.fieldSeasonId)}
                      onChange={() => togglePicked(field.fieldSeasonId)}
                      title="Mark this probe to write a rec on (not saved)"
                      aria-label={`Pick ${field.fieldName} to write a rec`}
                    />
                  )}

                  {/* Field name + crop */}
                  <div className="wr-field-info">
                    <span className="wr-field-name">
                      {field.fieldName}
                      {suggestion && (suggestion.recommendation || suggestion.suggestedWaterDay) && (
                        <span className="wr-suggestion-dot" title="Suggestion available">&bull;</span>
                      )}
                    </span>
                    <span className="wr-field-meta">
                      {field.crop} &middot; {field.acres} ac
                    </span>
                    <FieldCropDetails
                      field={field}
                      weather={field.plantingDate ? cropWeather[cropWeatherKey(field.plantingDate, reportDate)] : undefined}
                    />
                  </div>

                  {/* Probe label for 2-probe fields — front-end only, shows in copied report */}
                  <input
                    type="text"
                    value={form.probeLabel}
                    onChange={(e) => updateField(field.fieldSeasonId, { probeLabel: e.target.value })}
                    placeholder="probe…"
                    title='Which probe this rec/day is for on 2-probe fields (e.g. "NE", "SW") — appears next to the field name in the copied report'
                    style={{
                      width: 64, fontSize: 12, padding: '4px 6px', marginRight: 8,
                      border: '1px solid #ddd', borderRadius: 6, textAlign: 'center',
                      background: form.probeLabel ? '#f0f6ee' : 'transparent',
                    }}
                  />

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

                        // Up to two days can be selected → "Wednesday or Thursday".
                        // Click a selected day to drop it; a third day starts over.
                        const setDay = (label: string) => {
                          let sel = day ? day.split(' or ') : [];
                          if (sel.includes(label)) sel = sel.filter(d => d !== label);
                          else if (sel.length >= 2) sel = [label];
                          else sel = [...sel, label];
                          sel.sort((a, b) => daySortKey(a) - daySortKey(b)); // soonest first
                          const newDay = sel.join(' or ');
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

                        // Engine's suggested day (dotted outline)
                        const sugDay = suggestion?.suggestedWaterDay || '';
                        const sugDayName = DAY_NAMES.find(dn => sugDay.includes(dn)) || '';
                        // Last week's recommended day (shaded)
                        const prevDay = prevDayByFs.get(field.fieldSeasonId) || '';
                        const prevDayName = DAY_NAMES.find(dn => prevDay.includes(dn)) || '';

                        return (
                          <>
                            {days.map(d => {
                              const todayIdx = new Date().getDay(); // 0=Sun
                              const dayIdx = DAY_NAMES.indexOf(d.label);
                              // DAY_NAMES is Mon=0, but JS getDay is Mon=1, Sun=0
                              const jsIdx = dayIdx === 6 ? 0 : dayIdx + 1;
                              const away = (jsIdx - todayIdx + 7) % 7;
                              const selDays = day ? day.split(' or ') : [];
                              const isActive = selDays.includes(d.label);
                              const isSug = sugDayName === d.label && !isActive;
                              const isPrev = prevDayName === d.label && !isActive;
                              const titleParts = [];
                              if (isSug) titleParts.push(`Suggested: ${sugDay}`);
                              if (isPrev) titleParts.push(`Last week: ${prevDay}`);
                              return (
                                <button
                                  key={d.key}
                                  type="button"
                                  className={`wr-pill${isActive ? ' active' : ''}${isPrev ? ' early-week' : ''}${isSug ? ' suggested' : ''}`}
                                  onClick={() => setDay(d.label)}
                                  title={titleParts.length ? titleParts.join(' · ') : d.label}
                                >
                                  {d.key}
                                  <span className="wr-pill-days">{away + 1}</span>
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
                  <SpellHelper
                    text={fieldNotes[field.fieldSeasonId] ?? ''}
                    onFix={(t) => {
                      setFieldNotes(n => ({ ...n, [field.fieldSeasonId]: t }));
                      saveFieldNote(field.fieldSeasonId, t);
                    }}
                    ignore={spellIgnore}
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
                    {/* Suggested water DAY lives on the pills now (dotted outline),
                        same as late week. Only rec TEXT still gets a box. */}
                    {suggestion && suggestion.recommendation && (
                      <div className="wr-suggestion">
                        <div className="wr-suggestion-label">Suggested</div>
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
                    <SpellHelper
                      text={form.recommendation}
                      onFix={(t) => updateField(field.fieldSeasonId, { recommendation: t })}
                      ignore={spellIgnore}
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
          {/* Full-report reference now lives inline on each field tile below. */}

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
            // This field's early-week full-report rec, shown inline for quick reference.
            const fullRec = fullReportRecs.find(r => r.fieldSeasonId === field.fieldSeasonId);

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
                  <FieldCropDetails
                    field={field}
                    weather={field.plantingDate ? cropWeather[cropWeatherKey(field.plantingDate, reportDate)] : undefined}
                  />
                </div>

                {/* Probe label for 2-probe fields — front-end only, rides into the
                    copied update text as "Field Name (NE)" */}
                <input
                  type="text"
                  value={form.probeLabel}
                  onChange={(e) => updateField(field.fieldSeasonId, { probeLabel: e.target.value })}
                  placeholder="probe…"
                  title='Which probe this day is for on 2-probe fields (e.g. "NE", "SW") — appears next to the field name in the copied report'
                  style={{
                    width: 64, fontSize: 12, padding: '4px 6px', marginRight: 8,
                    border: '1px solid #ddd', borderRadius: 6, textAlign: 'center',
                    background: form.probeLabel ? '#f0f6ee' : 'transparent',
                  }}
                />

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
                                <span className="wr-pill-days">{away + 1}</span>
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
                {/* Early-week full-report rec, inline for quick reference */}
                {fullRec && fullRec.recommendation && (
                  <div className="wr-update-ref">
                    <span className="wr-update-ref-label">
                      Full report{fullRec.suggestedWaterDay ? ` · ${fullRec.suggestedWaterDay}` : ''}:
                    </span>{' '}
                    {fullRec.recommendation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Safety warning: fields the copied report would silently skip */}
      {currentOperation && copyWarning && copyWarning.length > 0 && (
        <div style={{
          background: '#fdeeee', borderLeft: '3px solid #d03b3b', borderRadius: 6,
          padding: '10px 14px', margin: '10px 0', fontSize: 14, color: '#7a1f1f',
        }}>
          <b>⚠ Missing {mode === 'full' ? 'recommendation and water day' : 'water day'} for:</b>{' '}
          {copyWarning.join(' · ')}
          <div style={{ marginTop: 4, fontSize: 13, color: '#a05252' }}>
            These fields will NOT appear in the copied report. Fill them in, or click Copy Anyway.
          </div>
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
            onClick={() => handleCopyAll()}
            style={copyWarning ? { background: '#d03b3b', color: '#fff' } : undefined}
          >
            {copyWarning ? 'Copy Anyway' : 'Copy All'}
          </button>
          {mode === 'update' && (
            <button
              className="wr-copy-btn"
              onClick={() => handleCopyAll(true)}
              title='Copy the same update without the "Continue as scheduled" heading'
            >
              Copy (plain)
            </button>
          )}
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
