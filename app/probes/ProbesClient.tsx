'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import EmptyState from '@/components/EmptyState';
import SearchableSelect from '@/components/SearchableSelect';
import { useResizableColumns } from '@/hooks/useResizableColumns';
import { useOperationFocus } from '@/lib/OperationFocusContext';
import CreateProbeModal from '@/components/fields/CreateProbeModal';

export interface ProcessedProbe {
  id: number;
  serialNumber: string;
  brand: string;
  status: string;
  rack: string;
  rackSlot: string;
  yearNew?: number;
  notes?: string;
  damagesRepairs?: string;
  billingEntity: string;
  billingEntityId?: number;
  dateCreated?: string;
  contact: string;
  contactId?: number;
  operation: string;
  tradeYear: string;
}

export interface BillingEntityOption {
  id: number;
  name: string;
  operationName?: string;
}

export interface ContactOption {
  id: number;
  name: string;
  operationName: string;
}

export interface ProbeFieldAssignment {
  probeId: number;
  season: string;
  fieldName: string;
}

interface ProbesClientProps {
  probes: ProcessedProbe[];
  billingEntities: BillingEntityOption[];
  contacts: ContactOption[];
  brandOptions: string[];
  statusCounts: Record<string, number>;
  availableSeasons: string[];
  probeFieldAssignments: ProbeFieldAssignment[];
}

function MultiSelectFilter({ label, options, selected, onChange }: { label: string; options: string[]; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange(next);
  };

  const display = selected.size === 0 ? label : selected.size === 1 ? Array.from(selected)[0] : `${selected.size} selected`;

  return (
    <div ref={ref} className="multi-select-filter" style={{ position: 'relative' }}>
      <button
        className={`probes-filter-select multi-select-btn${selected.size > 0 ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        type="button"
      >
        {display}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: '4px', flexShrink: 0 }}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="multi-select-dropdown">
          {options.map(opt => (
            <label key={opt} className="multi-select-option">
              <input type="checkbox" checked={selected.has(opt)} onChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))}
          {selected.size > 0 && (
            <button className="multi-select-clear" onClick={() => onChange(new Set())}>Clear</button>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_OPTIONS = [
  'On Order',
  'On Order - Trade',
  'In Stock',
  'Assigned',
  'Installed',
  'Trade Ordered',
  'RMA',
  'Retired',
];

// Rack options: 1A, 1B, 2A, 2B, ... 15A, 15B
const RACK_OPTIONS = [
  '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5A', '5B',
  '6A', '6B', '7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B',
  '11A', '11B', '12A', '12B', '13A', '13B', '14A', '14B', '15A', '15B',
];

// Column picker types and definitions
type ProbeColumnKey = 'serialNumber' | 'brand' | 'status' | 'field' | 'rack' | 'operation' | 'yearNew' | 'billingEntity' | 'tradeYear' | 'notes' | 'damagesRepairs' | 'dateCreated';

interface ProbeColumnDefinition {
  key: ProbeColumnKey;
  label: string;
  alwaysVisible?: boolean;
}

const ALL_PROBE_COLUMNS: ProbeColumnDefinition[] = [
  { key: 'serialNumber', label: 'Serial Number', alwaysVisible: true },
  { key: 'brand', label: 'Brand' },
  { key: 'status', label: 'Status' },
  { key: 'field', label: 'Field' },
  { key: 'rack', label: 'Rack Location' },
  { key: 'operation', label: 'Operation' },
  { key: 'yearNew', label: 'Year New' },
  { key: 'billingEntity', label: 'Billing Entity' },
  { key: 'tradeYear', label: 'Trade Year' },
  { key: 'notes', label: 'Notes' },
  { key: 'damagesRepairs', label: 'Damages/Repairs' },
  { key: 'dateCreated', label: 'Date Created' },
];

const DEFAULT_PROBE_COLUMNS: ProbeColumnKey[] = [
  'serialNumber', 'brand', 'status', 'field', 'rack', 'operation', 'yearNew', 'billingEntity', 'tradeYear',
];

const PROBE_COLUMNS_STORAGE_KEY = 'probes-visible-columns';

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  serialNumber: 140,
  brand: 100,
  status: 100,
  field: 120,
  rack: 120,
  operation: 130,
  yearNew: 90,
  billingEntity: 140,
  notes: 160,
  damagesRepairs: 160,
  dateCreated: 110,
};
const COLUMN_WIDTHS_STORAGE_KEY = 'probes-column-widths';

const initialAddForm = {
  serial_number: '',
  brand: '',
  billing_entity: '',
  contact: '',
  year_new: '',
  status: 'In Stock',
  rack: '',
  rack_slot: '',
  notes: '',
  damages_repairs: '',
};

export default function ProbesClient({ probes: initialProbes, billingEntities, contacts, brandOptions, statusCounts, availableSeasons, probeFieldAssignments }: ProbesClientProps) {
  const { focusedOperation } = useOperationFocus();
  const [probes, setProbes] = useState(initialProbes);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'rack' | 'on-order'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProbe, setSelectedProbe] = useState<ProcessedProbe | null>(null);
  const [addForm, setAddForm] = useState(initialAddForm);
  const [editForm, setEditForm] = useState(initialAddForm);
  const [saving, setSaving] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('serialNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentSeason, setCurrentSeason] = useState(availableSeasons[0] || String(new Date().getFullYear()));
  const [customYears, setCustomYears] = useState<string[]>([]);
  const [rackSortBy, setRackSortBy] = useState<'rack' | 'slot' | 'serial'>('rack');
  const [rackFilter, setRackFilter] = useState<'all' | 'empty'>('all');
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());
  const [filterBrand, setFilterBrand] = useState<Set<string>>(new Set());
  const [filterOperation, setFilterOperation] = useState<Set<string>>(new Set());
  const [filterBillingEntity, setFilterBillingEntity] = useState<Set<string>>(new Set());
  const [filterTradeYear, setFilterTradeYear] = useState<Set<string>>(new Set());
  const [savingTradeYear, setSavingTradeYear] = useState<Set<number>>(new Set());
  const [savedTradeYear, setSavedTradeYear] = useState<Set<number>>(new Set());
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradingProbe, setTradingProbe] = useState<ProcessedProbe | null>(null);
  const mobileCardsRef = useRef<HTMLDivElement>(null);
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [columnPickerPos, setColumnPickerPos] = useState({ top: 0, right: 0 });
  const [visibleColumns, setVisibleColumns] = useState<ProbeColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem(PROBE_COLUMNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ProbeColumnKey[];
        const validKeys = new Set(ALL_PROBE_COLUMNS.map(c => c.key));
        const validated = parsed.filter(k => validKeys.has(k));
        if (!validated.includes('serialNumber')) validated.unshift('serialNumber');
        return validated.length > 0 ? validated : DEFAULT_PROBE_COLUMNS;
      }
    } catch (e) { /* ignore */ }
    return DEFAULT_PROBE_COLUMNS;
  });

  const { columnWidths, resizingColumn, handleResizeStart, handleResetColumnWidth } = useResizableColumns({
    defaultWidths: DEFAULT_COLUMN_WIDTHS,
    storageKey: COLUMN_WIDTHS_STORAGE_KEY,
  });

  // Unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const statuses = new Set<string>();
    const brands = new Set<string>();
    const operations = new Set<string>();
    const billingEntities = new Set<string>();
    const tradeYears = new Set<string>();
    probes.forEach(p => {
      if (p.status) statuses.add(p.status);
      if (p.brand && p.brand !== 'Unknown') brands.add(p.brand);
      if (p.operation && p.operation !== '—') operations.add(p.operation);
      if (p.billingEntity && p.billingEntity !== '—') billingEntities.add(p.billingEntity);
      if (p.tradeYear) tradeYears.add(p.tradeYear);
    });
    const sort = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
    return { statuses: sort(statuses), brands: sort(brands), operations: sort(operations), billingEntities: sort(billingEntities), tradeYears: sort(tradeYears) };
  }, [probes]);

  // Rack numbers for the scrubber (1-15)
  const rackNumbers = Array.from({ length: 15 }, (_, i) => i + 1);

  // Combine available seasons with any custom years added by user
  const allSeasons = useMemo(() => {
    const combined = new Set([...availableSeasons, ...customYears]);
    return Array.from(combined).sort((a, b) => b.localeCompare(a));
  }, [availableSeasons, customYears]);

  // Build a lookup map for probe field assignments: key = "probeId-season", value = fieldName
  const probeFieldMap = useMemo(() => {
    const map = new Map<string, string>();
    probeFieldAssignments.forEach((pfa) => {
      map.set(`${pfa.probeId}-${pfa.season}`, pfa.fieldName);
    });
    return map;
  }, [probeFieldAssignments]);

  // Helper function to get field name for a probe in the current season
  const getFieldForProbe = (probeId: number): string | null => {
    return probeFieldMap.get(`${probeId}-${currentSeason}`) || null;
  };

  // Save column preferences
  useEffect(() => {
    try {
      localStorage.setItem(PROBE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
    } catch (e) { /* ignore */ }
  }, [visibleColumns]);

  // Close column picker on click outside
  useEffect(() => {
    if (!showColumnPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(event.target as Node)) {
        setShowColumnPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnPicker]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const toggleColumn = (columnKey: ProbeColumnKey) => {
    const column = ALL_PROBE_COLUMNS.find(col => col.key === columnKey);
    if (column?.alwaysVisible) return;
    setVisibleColumns(prev =>
      prev.includes(columnKey)
        ? prev.filter(c => c !== columnKey)
        : [...prev, columnKey]
    );
  };

  const isColumnVisible = (columnKey: ProbeColumnKey) => visibleColumns.includes(columnKey);

  const filteredProbes = useMemo(() => {
    let filtered = probes;

    // For on-order view, only show probes with status "On Order"
    if (viewMode === 'on-order') {
      filtered = filtered.filter((probe) => probe.status.toLowerCase() === 'on order');
    }

    // For rack view, only show probes with rack and sort based on rackSortBy
    if (viewMode === 'rack') {
      filtered = filtered.filter((probe) => probe.rack && probe.rack !== '—');
      filtered = [...filtered].sort((a, b) => {
        if (rackSortBy === 'rack') {
          // Sort by rack number first (numeric), then letter, then slot
          const rackA = a.rack || '';
          const rackB = b.rack || '';
          const numA = parseInt(rackA) || 0;
          const numB = parseInt(rackB) || 0;
          if (numA !== numB) return numA - numB;
          const letterA = rackA.replace(/\d+/, '');
          const letterB = rackB.replace(/\d+/, '');
          if (letterA !== letterB) return letterA.localeCompare(letterB);
          // Then by slot number
          const slotA = parseInt(a.rackSlot) || 0;
          const slotB = parseInt(b.rackSlot) || 0;
          return slotA - slotB;
        } else if (rackSortBy === 'slot') {
          // Sort by slot number first, then rack
          const slotA = parseInt(a.rackSlot) || 0;
          const slotB = parseInt(b.rackSlot) || 0;
          if (slotA !== slotB) return slotA - slotB;
          return (a.rack || '').localeCompare(b.rack || '');
        } else {
          // Sort by serial number
          return (a.serialNumber || '').localeCompare(b.serialNumber || '');
        }
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (probe) =>
          probe.serialNumber.toLowerCase().includes(query) ||
          probe.brand.toLowerCase().includes(query) ||
          probe.operation.toLowerCase().includes(query) ||
          (probe.rack || '').toLowerCase().includes(query) ||
          (probe.rackSlot || '').toLowerCase().includes(query)
      );
    }

    // Apply quick filters
    if (filterStatus.size > 0) {
      filtered = filtered.filter(p => filterStatus.has(p.status));
    }
    if (filterBrand.size > 0) {
      filtered = filtered.filter(p => filterBrand.has(p.brand));
    }
    if (focusedOperation) {
      filtered = filtered.filter(p => p.operation === focusedOperation.name);
    } else if (filterOperation.size > 0) {
      filtered = filtered.filter(p => filterOperation.has(p.operation));
    }
    if (filterBillingEntity.size > 0) {
      filtered = filtered.filter(p => filterBillingEntity.has(p.billingEntity));
    }
    if (filterTradeYear.size > 0) {
      filtered = filtered.filter(p => filterTradeYear.has(p.tradeYear));
    }

    // Sort (only if not in rack view, which has its own sort)
    if (viewMode !== 'rack') {
      filtered = [...filtered].sort((a, b) => {
        let aVal: string | number = '';
        let bVal: string | number = '';

        switch (sortColumn) {
          case 'serialNumber': aVal = a.serialNumber.toLowerCase(); bVal = b.serialNumber.toLowerCase(); break;
          case 'brand': aVal = a.brand.toLowerCase(); bVal = b.brand.toLowerCase(); break;
          case 'status': aVal = a.status.toLowerCase(); bVal = b.status.toLowerCase(); break;
          case 'field': aVal = (getFieldForProbe(a.id) || '').toLowerCase(); bVal = (getFieldForProbe(b.id) || '').toLowerCase(); break;
          case 'operation': aVal = a.operation.toLowerCase(); bVal = b.operation.toLowerCase(); break;
          case 'year': aVal = a.yearNew || 0; bVal = b.yearNew || 0; break;
          case 'yearNew': aVal = a.yearNew || 0; bVal = b.yearNew || 0; break;
          case 'rack': aVal = `${a.rack || ''}-${a.rackSlot || ''}`; bVal = `${b.rack || ''}-${b.rackSlot || ''}`; break;
          case 'billingEntity': aVal = a.billingEntity.toLowerCase(); bVal = b.billingEntity.toLowerCase(); break;
          case 'tradeYear': aVal = a.tradeYear || ''; bVal = b.tradeYear || ''; break;
          case 'notes': aVal = (a.notes || '').toLowerCase(); bVal = (b.notes || '').toLowerCase(); break;
          case 'damagesRepairs': aVal = (a.damagesRepairs || '').toLowerCase(); bVal = (b.damagesRepairs || '').toLowerCase(); break;
          case 'dateCreated': aVal = a.dateCreated || ''; bVal = b.dateCreated || ''; break;
          default: aVal = a.serialNumber.toLowerCase(); bVal = b.serialNumber.toLowerCase();
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [probes, searchQuery, sortColumn, sortDirection, viewMode, probeFieldMap, currentSeason, rackSortBy, filterStatus, filterBrand, filterOperation, filterBillingEntity, filterTradeYear, focusedOperation]);

  // Get unique rack prefixes (numbers) from filtered probes for highlighting active ones
  const activeRackNumbers = useMemo(() => {
    if (viewMode !== 'rack') return new Set<number>();
    const numbers = new Set<number>();
    filteredProbes.forEach(probe => {
      const num = parseInt(probe.rack || '');
      if (!isNaN(num)) numbers.add(num);
    });
    return numbers;
  }, [filteredProbes, viewMode]);

  // Compute display items with empty slots when enabled
  type RackDisplayItem =
    | { type: 'probe'; probe: ProcessedProbe }
    | { type: 'empty'; rack: string; slot: number };

  const rackDisplayItems = useMemo((): RackDisplayItem[] => {
    // Only show empty slots when in rack view sorted by rack
    if (viewMode !== 'rack' || rackSortBy !== 'rack') {
      return filteredProbes.map(probe => ({ type: 'probe' as const, probe }));
    }

    // Group probes by rack
    const probesByRack = new Map<string, Map<number, ProcessedProbe>>();
    let globalMaxSlot = 0;

    filteredProbes.forEach(probe => {
      const rack = probe.rack || '';
      const slot = parseInt(probe.rackSlot) || 0;
      if (!rack || rack === '—') return;

      if (!probesByRack.has(rack)) {
        probesByRack.set(rack, new Map());
      }
      probesByRack.get(rack)!.set(slot, probe);
      if (slot > globalMaxSlot) globalMaxSlot = slot;
    });

    // Build display items with empty slots
    const items: RackDisplayItem[] = [];
    const sortedRacks = Array.from(probesByRack.keys()).sort((a, b) => {
      const numA = parseInt(a) || 0;
      const numB = parseInt(b) || 0;
      if (numA !== numB) return numA - numB;
      return a.replace(/\d+/, '').localeCompare(b.replace(/\d+/, ''));
    });

    sortedRacks.forEach(rack => {
      const slotsMap = probesByRack.get(rack)!;
      const maxSlotInRack = Math.max(...Array.from(slotsMap.keys()), 0);
      const maxSlot = Math.max(maxSlotInRack, globalMaxSlot > 30 ? maxSlotInRack : Math.min(globalMaxSlot + 2, 30));

      for (let slot = 1; slot <= maxSlot; slot++) {
        if (slotsMap.has(slot)) {
          // If filtering for empty only, skip occupied slots
          if (rackFilter !== 'empty') {
            items.push({ type: 'probe', probe: slotsMap.get(slot)! });
          }
        } else {
          items.push({ type: 'empty', rack, slot });
        }
      }
    });

    return items;
  }, [filteredProbes, viewMode, rackSortBy, rackFilter]);

  // Count empty slots for display
  const emptySlotCount = useMemo(() => {
    return rackDisplayItems.filter(item => item.type === 'empty').length;
  }, [rackDisplayItems]);

  // Ref for desktop table
  const desktopTableRef = useRef<HTMLTableElement>(null);

  // Scroll to a specific rack number
  const scrollToRack = useCallback((rackNum: number) => {
    // Check if we're on mobile (mobile cards visible) or desktop (table visible)
    const isMobileVisible = mobileCardsRef.current &&
      window.getComputedStyle(mobileCardsRef.current).display !== 'none';

    if (isMobileVisible && mobileCardsRef.current) {
      // Mobile: scroll to mobile card
      const cards = mobileCardsRef.current.querySelectorAll('.mobile-card');
      for (const card of cards) {
        const titleEl = card.querySelector('.mobile-card-title');
        if (titleEl) {
          const rackText = titleEl.textContent || '';
          const cardRackNum = parseInt(rackText);
          if (cardRackNum === rackNum) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            break;
          }
        }
      }
    } else if (desktopTableRef.current) {
      // Desktop: scroll to table row
      const rows = desktopTableRef.current.querySelectorAll('tbody tr');
      for (const row of rows) {
        // Rack Location is the 5th column (index 4)
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
          const rackText = cells[4].textContent || '';
          const rowRackNum = parseInt(rackText);
          if (rowRackNum === rackNum) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight the row briefly
            row.classList.add('highlight-row');
            setTimeout(() => row.classList.remove('highlight-row'), 1500);
            break;
          }
        }
      }
    }
  }, []);

  const handleAdd = async () => {
    if (!addForm.serial_number.trim()) {
      alert('Serial number is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        serial_number: addForm.serial_number,
      };
      if (addForm.brand) payload.brand = addForm.brand;
      if (addForm.billing_entity) payload.billing_entity = parseInt(addForm.billing_entity, 10);
      if (addForm.contact) payload.contact = parseInt(addForm.contact, 10);
      if (addForm.year_new) payload.year_new = parseInt(addForm.year_new, 10);
      if (addForm.status) payload.status = addForm.status;
      if (addForm.rack) payload.rack = addForm.rack;
      if (addForm.rack_slot) payload.rack_slot = addForm.rack_slot;
      if (addForm.notes) payload.notes = addForm.notes;
      if (addForm.damages_repairs) payload.damages_repairs = addForm.damages_repairs;

      const response = await fetch('/api/probes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowAddModal(false);
        setAddForm(initialAddForm);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create probe');
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create probe');
    } finally {
      setSaving(false);
    }
  };

  const handleTradeYearChange = async (probeId: number, value: string) => {
    setSavingTradeYear(prev => new Set(prev).add(probeId));
    try {
      const response = await fetch(`/api/probes/${probeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade_year: value || null }),
      });
      if (response.ok) {
        setProbes(prev => prev.map(p => p.id === probeId ? { ...p, tradeYear: value } : p));
        setSavedTradeYear(prev => new Set(prev).add(probeId));
        setTimeout(() => setSavedTradeYear(prev => { const next = new Set(prev); next.delete(probeId); return next; }), 1500);
      }
    } catch (error) {
      console.error('Failed to update trade year:', error);
    } finally {
      setSavingTradeYear(prev => { const next = new Set(prev); next.delete(probeId); return next; });
    }
  };

  const handleEdit = async () => {
    if (!selectedProbe) return;
    if (!editForm.serial_number.trim()) {
      alert('Serial number is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        serial_number: editForm.serial_number,
        brand: editForm.brand || null,
        billing_entity: editForm.billing_entity ? parseInt(editForm.billing_entity, 10) : null,
        contact: editForm.contact ? parseInt(editForm.contact, 10) : null,
        year_new: editForm.year_new ? parseInt(editForm.year_new, 10) : null,
        status: editForm.status || null,
        rack: editForm.rack || null,
        rack_slot: editForm.rack_slot || null,
        notes: editForm.notes || null,
        damages_repairs: editForm.damages_repairs || null,
      };

      const response = await fetch(`/api/probes/${selectedProbe.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setShowEditModal(false);
        setSelectedProbe(null);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update probe');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update probe');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (probe: ProcessedProbe) => {
    if (!confirm(`Delete probe "${probe.serialNumber}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/probes/${probe.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setProbes(probes.filter((p) => p.id !== probe.id));
      } else {
        alert('Failed to delete probe');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete probe');
    }
  };

  const openTradeModal = (probe: ProcessedProbe) => {
    setTradingProbe(probe);
    setShowTradeModal(true);
  };

  const handleTradeComplete = async (oldProbeId: number, tradeYear: string) => {
    // Note: notes are set in handleTradeProbeCreated where we have both probe references
    try {
      const response = await fetch(`/api/probes/${oldProbeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade_year: tradeYear, status: 'Trade Ordered' }),
      });
      if (response.ok) {
        setProbes(prev => prev.map(p => p.id === oldProbeId ? { ...p, tradeYear, status: 'Trade Ordered' } : p));
      }
    } catch (error) {
      console.error('Failed to set trade year:', error);
    }
  };

  const handleTradeProbeCreated = async (newProbeId: number, newProbeOption: { id: number; serialNumber: string; brand: string; ownerBillingEntity: string; ownerOperationName: string; status: string }) => {
    const oldProbe = tradingProbe;
    const newSerial = newProbeOption.serialNumber || `On Order - Trade #${newProbeOption.id}`;
    const oldSerial = oldProbe?.serialNumber || `#${oldProbe?.id}`;

    // Add new probe to local state
    setProbes(prev => [...prev, {
      id: newProbeOption.id,
      serialNumber: newProbeOption.serialNumber || (newProbeOption.status === 'On Order - Trade' ? `On Order - Trade #${newProbeOption.id}` : `On Order #${newProbeOption.id}`),
      brand: newProbeOption.brand,
      status: newProbeOption.status,
      rack: '—',
      rackSlot: '—',
      billingEntity: newProbeOption.ownerBillingEntity,
      billingEntityId: oldProbe?.billingEntityId,
      contact: '—',
      operation: oldProbe?.operation || '',
      tradeYear: '',
      notes: `Replacing ${oldSerial} on trade`,
      dateCreated: new Date().toISOString(),
    }]);

    // Set trade notes on both probes
    if (oldProbe) {
      try {
        await Promise.all([
          fetch(`/api/probes/${oldProbe.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: `Traded for ${newSerial}` }),
          }),
          fetch(`/api/probes/${newProbeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: `Replacing ${oldSerial} on trade` }),
          }),
        ]);
        // Update old probe notes in local state
        setProbes(prev => prev.map(p => p.id === oldProbe.id ? { ...p, notes: `Traded for ${newSerial}` } : p));
      } catch (error) {
        console.error('Failed to set trade notes:', error);
      }
    }

    setShowTradeModal(false);
    setTradingProbe(null);
  };

  const openEditModal = (probe: ProcessedProbe) => {
    setSelectedProbe(probe);
    setEditForm({
      serial_number: probe.serialNumber,
      brand: probe.brand === 'Unknown' ? '' : probe.brand,
      billing_entity: probe.billingEntityId?.toString() || '',
      contact: probe.contactId?.toString() || '',
      year_new: probe.yearNew?.toString() || '',
      status: probe.status,
      rack: probe.rack === '—' ? '' : probe.rack,
      rack_slot: probe.rackSlot === '—' ? '' : probe.rackSlot,
      notes: probe.notes || '',
      damages_repairs: probe.damagesRepairs || '',
    });
    setShowEditModal(true);
  };

  const getBrandBadge = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('sentek')) {
      return <span className="brand-badge sentek">{brand}</span>;
    }
    if (brandLower.includes('cropx')) {
      return <span className="brand-badge cropx">{brand}</span>;
    }
    return <span className="brand-badge">{brand}</span>;
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    let className = 'status-badge ';
    if (statusLower === 'in stock' || statusLower === 'in-stock') {
      className += 'in-stock';
    } else if (statusLower === 'deployed' || statusLower === 'installed') {
      className += 'installed';
    } else if (statusLower === 'assigned') {
      className += 'pending';
    } else if (statusLower === 'rma' || statusLower === 'repair' || statusLower === 'needs repair') {
      className += 'repair';
    } else if (statusLower === 'retired') {
      className += 'retired';
    } else if (statusLower === 'on order - trade') {
      className += 'on-order-trade';
    } else if (statusLower === 'on order') {
      className += 'on-order';
    } else if (statusLower === 'trade ordered') {
      className += 'trade-ordered';
    } else {
      className += 'pending';
    }
    return (
      <span className={className}>
        <span className="status-dot"></span>
        {status}
      </span>
    );
  };

  const renderProbeCell = (probe: ProcessedProbe, colKey: ProbeColumnKey) => {
    switch (colKey) {
      case 'serialNumber':
        return <td key={colKey} className="cell-semibold">#{probe.serialNumber}</td>;
      case 'brand':
        return <td key={colKey}>{getBrandBadge(probe.brand)}</td>;
      case 'status':
        return <td key={colKey}>{getStatusBadge(probe.status)}</td>;
      case 'field':
        return <td key={colKey} className="cell-sm">{getFieldForProbe(probe.id) || '—'}</td>;
      case 'rack':
        return <td key={colKey} className="cell-sm">{probe.rack && probe.rack !== '—' ? `${probe.rack}${probe.rackSlot ? `-${probe.rackSlot}` : ''}` : '—'}</td>;
      case 'operation':
        return <td key={colKey} className="cell-sm">{probe.operation || '—'}</td>;
      case 'yearNew':
        return <td key={colKey} className="field-count">{probe.yearNew || '—'}</td>;
      case 'billingEntity':
        return <td key={colKey} className="cell-sm">{probe.billingEntity || '—'}</td>;
      case 'tradeYear':
        return (
          <td key={colKey} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <select
                value={probe.tradeYear}
                onChange={(e) => handleTradeYearChange(probe.id, e.target.value)}
                disabled={savingTradeYear.has(probe.id)}
                className="inline-select"
                style={{ fontSize: '12px', padding: '2px 4px', minWidth: '70px' }}
              >
                <option value="">—</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
              {savingTradeYear.has(probe.id) && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...</span>}
              {savedTradeYear.has(probe.id) && <span style={{ fontSize: '10px', color: 'var(--accent-primary)' }}>✓</span>}
            </div>
          </td>
        );
      case 'notes':
        return <td key={colKey} className="cell-sm cell-wrap">{probe.notes || '—'}</td>;
      case 'damagesRepairs':
        return <td key={colKey} className="cell-sm cell-wrap">{probe.damagesRepairs || '—'}</td>;
      case 'dateCreated':
        return <td key={colKey} className="cell-sm">{probe.dateCreated ? new Date(probe.dateCreated).toLocaleDateString() : '—'}</td>;
      default:
        return <td key={colKey}>—</td>;
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <h2>Probe Inventory</h2>
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
          >
            {allSeasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="__add_year__">+ Add Year...</option>
          </select>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid stats-grid-5">
          <div className="stat-card">
            <div className="stat-label">Total Probes</div>
            <div className="stat-value blue">{statusCounts.all || 0}</div>
          </div>
          <div className="stat-card stat-card-clickable" onClick={() => setViewMode('on-order')}>
            <div className="stat-label">On Order</div>
            <div className="stat-value amber">{statusCounts['on-order'] || statusCounts['on order'] || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">In Stock</div>
            <div className="stat-value green">{statusCounts['in-stock'] || statusCounts['in stock'] || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Installed</div>
            <div className="stat-value amber">{statusCounts['deployed'] || statusCounts['installed'] || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">RMA</div>
            <div className="stat-value red">{statusCounts['rma'] || statusCounts['repair'] || 0}</div>
          </div>
        </div>

        {/* Filter Row */}
        <div className="fields-filter-row">
          <div className="probes-filter-left">
            <div className="fields-tabs">
              <button
                onClick={() => setViewMode('all')}
                className={viewMode === 'all' ? 'active' : ''}
              >
                All Probes
              </button>
              <button
                onClick={() => setViewMode('rack')}
                className={viewMode === 'rack' ? 'active' : ''}
              >
                Probe Rack
              </button>
              <button
                onClick={() => setViewMode('on-order')}
                className={viewMode === 'on-order' ? 'active' : ''}
              >
                On Order
              </button>
            </div>
            <div className="search-box search-box-wide">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder={viewMode === 'rack' ? "Search rack or serial..." : "Search probes..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <MultiSelectFilter label="All Statuses" options={filterOptions.statuses} selected={filterStatus} onChange={setFilterStatus} />
            <MultiSelectFilter label="All Brands" options={filterOptions.brands} selected={filterBrand} onChange={setFilterBrand} />
            {!focusedOperation && (
              <MultiSelectFilter label="All Operations" options={filterOptions.operations} selected={filterOperation} onChange={setFilterOperation} />
            )}
            <MultiSelectFilter label="All Billing Entities" options={filterOptions.billingEntities} selected={filterBillingEntity} onChange={setFilterBillingEntity} />
            <MultiSelectFilter label="All Trade Years" options={filterOptions.tradeYears} selected={filterTradeYear} onChange={setFilterTradeYear} />
            {(filterStatus.size > 0 || filterBrand.size > 0 || filterOperation.size > 0 || filterBillingEntity.size > 0 || filterTradeYear.size > 0) && (
              <button
                className="btn btn-secondary btn-compact"
                onClick={() => { setFilterStatus(new Set()); setFilterBrand(new Set()); setFilterOperation(new Set()); setFilterBillingEntity(new Set()); setFilterTradeYear(new Set()); }}
                title="Clear all filters"
              >
                Clear
              </button>
            )}
          </div>
          <div className="probes-filter-right">
            {viewMode === 'rack' && (
              <>
                <select
                  value={rackFilter}
                  onChange={(e) => setRackFilter(e.target.value as 'all' | 'empty')}
                  className={`probes-rack-select${rackFilter === 'empty' ? ' active' : ''}`}
                >
                  <option value="all">All Slots</option>
                  <option value="empty">Empty Only ({emptySlotCount})</option>
                </select>
                <select
                  value={rackSortBy}
                  onChange={(e) => setRackSortBy(e.target.value as 'rack' | 'slot' | 'serial')}
                  className="probes-rack-select"
                >
                  <option value="rack">Sort: Rack</option>
                  <option value="slot">Sort: Slot</option>
                  <option value="serial">Sort: Serial</option>
                </select>
              </>
            )}
            <div ref={columnPickerRef} className="fields-col-picker">
              <button
                className="btn btn-secondary"
                onClick={(e) => {
                  if (showColumnPicker) {
                    setShowColumnPicker(false);
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setColumnPickerPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                    setShowColumnPicker(true);
                  }
                }}
                title="Configure visible columns"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Columns
              </button>
              {showColumnPicker && (
                <div className="fields-col-dropdown" style={{ position: 'fixed', top: columnPickerPos.top, right: columnPickerPos.right }}>
                  <div className="fields-col-header">
                    <span className="fields-col-label">Show Columns</span>
                  </div>
                  {ALL_PROBE_COLUMNS.map(col => (
                    <label
                      key={col.key}
                      className={`fields-col-item ${col.alwaysVisible ? 'disabled' : ''}`}
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
                        className={`fields-col-checkbox ${col.alwaysVisible ? 'disabled' : ''}`}
                      />
                      {col.label}
                      {col.alwaysVisible && <span className="fields-col-required">(required)</span>}
                    </label>
                  ))}
                  <div className="fields-col-footer">
                    <button className="btn btn-secondary fields-col-reset" onClick={() => setVisibleColumns(ALL_PROBE_COLUMNS.filter(c => c.alwaysVisible).map(c => c.key))}>
                      Deselect All
                    </button>
                    <button className="btn btn-secondary fields-col-reset" onClick={() => setVisibleColumns([...DEFAULT_PROBE_COLUMNS])}>
                      Reset to Defaults
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Probe
            </button>
          </div>
        </div>

        <div className="probes-row-count">
          Showing {filteredProbes.length} of {probes.length} probes
        </div>

        <div className="table-container">
          <table className="desktop-table" ref={desktopTableRef} style={{ userSelect: resizingColumn ? 'none' : undefined }}>
            <colgroup>
              {visibleColumns.map(colKey => (
                <col key={colKey} style={{ width: columnWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 100 }} />
              ))}
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                {visibleColumns.map(colKey => {
                  const colDef = ALL_PROBE_COLUMNS.find(c => c.key === colKey);
                  return (
                    <th key={colKey} className="sortable th-resizable" onClick={() => handleSort(colKey)}>
                      <span className="th-content">
                        {colDef?.label || colKey}
                        {sortColumn === colKey && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                      </span>
                      <div onMouseDown={(e) => handleResizeStart(colKey, e)} onDoubleClick={() => handleResetColumnWidth(colKey)} className={`resize-handle${resizingColumn === colKey ? ' active' : ''}`} title="Drag to resize, double-click to reset" />
                    </th>
                  );
                })}
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProbes.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1}>
                    <EmptyState
                      icon={searchQuery ? 'search' : 'probes'}
                      title={searchQuery ? 'No matching probes' : 'No probes yet'}
                      description={searchQuery ? 'Try a different search term' : 'Add your first probe to get started'}
                      action={!searchQuery ? { label: 'Add Probe', onClick: () => setShowAddModal(true) } : undefined}
                    />
                  </td>
                </tr>
              ) : (
                filteredProbes.map((probe) => (
                  <tr key={probe.id}>
                    {visibleColumns.map(colKey => renderProbeCell(probe, colKey))}
                    <td>
                      <div className="action-btn-group">
                        <button className="action-btn" title="Edit" onClick={() => openEditModal(probe)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button className="action-btn" title="Trade" onClick={() => openTradeModal(probe)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </button>
                        <button className="action-btn" title="Delete" onClick={() => handleDelete(probe)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="probes-mobile-wrapper">
            <div className="mobile-cards" ref={mobileCardsRef}>
              {filteredProbes.length === 0 ? (
                <EmptyState
                  icon={searchQuery ? 'search' : 'probes'}
                  title={searchQuery ? 'No matching probes' : viewMode === 'rack' ? 'No probes in rack' : 'No probes yet'}
                  description={searchQuery ? 'Try a different search term' : 'Add your first probe to get started'}
                  action={!searchQuery ? { label: 'Add Probe', onClick: () => setShowAddModal(true) } : undefined}
                />
              ) : viewMode === 'rack' && rackSortBy === 'rack' ? (
                rackDisplayItems.map((item, index) =>
                  item.type === 'empty' ? (
                    <div
                      key={`empty-${item.rack}-${item.slot}`}
                      className="mobile-card probes-empty-slot"
                    >
                      <div className="mobile-card-header">
                        <span className="mobile-card-title text-muted">
                          {item.rack}-{item.slot}
                        </span>
                        <span className="probes-empty-badge">
                          EMPTY
                        </span>
                      </div>
                      <div className="mobile-card-body probes-empty-slot-body">
                        Slot available
                      </div>
                    </div>
                  ) : (
                    <div key={item.probe.id} className="mobile-card" onClick={() => openEditModal(item.probe)}>
                      <div className="mobile-card-header">
                        <span className="mobile-card-title mobile-card-title-accent">
                          {item.probe.rack}{item.probe.rackSlot ? `-${item.probe.rackSlot}` : ''}
                        </span>
                        {getStatusBadge(item.probe.status)}
                      </div>
                      <div className="mobile-card-body">
                        <div className="mobile-card-row"><span>Serial:</span> #{item.probe.serialNumber}</div>
                        <div className="mobile-card-row"><span>Brand:</span> {item.probe.brand}</div>
                        <div className="mobile-card-row"><span>Billing Entity:</span> {item.probe.billingEntity}</div>
                        <div className="mobile-card-row"><span>Field:</span> {getFieldForProbe(item.probe.id) || '—'}</div>
                        <div className="mobile-card-row"><span>Operation:</span> {item.probe.operation}</div>
                      </div>
                      <div className="mobile-card-footer-bar">
                        <button
                          className="btn btn-secondary btn-compact"
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.probe); }}
                        >
                          Delete
                        </button>
                        <button
                          className="btn btn-secondary btn-compact"
                          onClick={(e) => { e.stopPropagation(); openTradeModal(item.probe); }}
                        >
                          Trade
                        </button>
                        <span className="mobile-card-edit-link">
                          Edit
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  )
                )
              ) : (
                filteredProbes.map((probe) => (
                  <div key={probe.id} className="mobile-card" onClick={() => openEditModal(probe)}>
                    <div className="mobile-card-header">
                      {viewMode === 'rack' ? (
                        <>
                          <span className="mobile-card-title mobile-card-title-accent">
                            {probe.rack}{probe.rackSlot ? `-${probe.rackSlot}` : ''}
                          </span>
                          {getStatusBadge(probe.status)}
                        </>
                      ) : (
                        <>
                          <span className="mobile-card-title">
                            #{probe.serialNumber}
                          </span>
                          {getStatusBadge(probe.status)}
                        </>
                      )}
                    </div>
                    <div className="mobile-card-body">
                      {viewMode === 'rack' ? (
                        <>
                          <div className="mobile-card-row"><span>Serial:</span> #{probe.serialNumber}</div>
                          <div className="mobile-card-row"><span>Brand:</span> {probe.brand}</div>
                          <div className="mobile-card-row"><span>Billing Entity:</span> {probe.billingEntity}</div>
                          <div className="mobile-card-row"><span>Field:</span> {getFieldForProbe(probe.id) || '—'}</div>
                          <div className="mobile-card-row"><span>Operation:</span> {probe.operation}</div>
                        </>
                      ) : (
                        <>
                          <div className="mobile-card-row"><span>Brand:</span> {probe.brand}</div>
                          <div className="mobile-card-row"><span>Billing Entity:</span> {probe.billingEntity}</div>
                          <div className="mobile-card-row"><span>Field:</span> {getFieldForProbe(probe.id) || '—'}</div>
                          <div className="mobile-card-row"><span>Operation:</span> {probe.operation}</div>
                          <div className="mobile-card-row"><span>Rack:</span> {probe.rack && probe.rack !== '—' ? `${probe.rack}${probe.rackSlot ? `-${probe.rackSlot}` : ''}` : '—'}</div>
                          <div className="mobile-card-row"><span>Year New:</span> {probe.yearNew || '—'}</div>
                        </>
                      )}
                    </div>
                    <div className="mobile-card-footer-bar">
                      <button
                        className="btn btn-secondary btn-compact"
                        onClick={(e) => { e.stopPropagation(); handleDelete(probe); }}
                      >
                        Delete
                      </button>
                      <button
                        className="btn btn-secondary btn-compact"
                        onClick={(e) => { e.stopPropagation(); openTradeModal(probe); }}
                      >
                        Trade
                      </button>
                      <span className="mobile-card-edit-link">
                        Edit
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </div>
                ))
            )}
            </div>
            {/* Rack Index Scrubber - only show in rack view on mobile */}
            {viewMode === 'rack' && filteredProbes.length > 0 && (
              <div className="rack-scrubber">
                {rackNumbers.map((num) => (
                  <button
                    key={num}
                    onClick={() => scrollToRack(num)}
                    disabled={!activeRackNumbers.has(num)}
                    className={`rack-scrubber-btn${activeRackNumbers.has(num) ? ' active' : ''}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => setShowAddModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Add New Probe</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Serial Number *</label>
                  <input
                    type="text"
                    value={addForm.serial_number}
                    onChange={(e) => setAddForm({ ...addForm, serial_number: e.target.value })}
                    placeholder="Enter serial number"
                  />
                </div>
                <div className="form-group">
                  <label>Brand</label>
                  <select
                    value={addForm.brand}
                    onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })}
                  >
                    <option value="">Select brand...</option>
                    {brandOptions.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Billing Entity</label>
                  <SearchableSelect
                    value={addForm.billing_entity}
                    onChange={(v) => setAddForm({ ...addForm, billing_entity: v })}
                    options={billingEntities.map((be) => ({
                      value: String(be.id),
                      label: be.name,
                    }))}
                    placeholder="Select billing entity..."
                  />
                </div>
                <div className="form-group">
                  <label>Contact</label>
                  <SearchableSelect
                    value={addForm.contact}
                    onChange={(v) => setAddForm({ ...addForm, contact: v })}
                    options={contacts.map((c) => ({
                      value: String(c.id),
                      label: `${c.name} (${c.operationName})`,
                    }))}
                    placeholder="Select contact..."
                  />
                </div>
                <div className="form-group">
                  <label>Year New</label>
                  <input
                    type="number"
                    value={addForm.year_new}
                    onChange={(e) => setAddForm({ ...addForm, year_new: e.target.value })}
                    placeholder="e.g. 2024"
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={addForm.status}
                    onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Rack</label>
                  <select
                    value={addForm.rack}
                    onChange={(e) => setAddForm({ ...addForm, rack: e.target.value })}
                  >
                    <option value="">Select rack...</option>
                    {RACK_OPTIONS.map((rack) => (
                      <option key={rack} value={rack}>{rack}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Rack Slot</label>
                  <input
                    type="number"
                    value={addForm.rack_slot}
                    onChange={(e) => setAddForm({ ...addForm, rack_slot: e.target.value })}
                    placeholder="e.g. 1, 2, 3"
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={addForm.notes}
                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                    placeholder="Enter notes..."
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Damages/Repairs</label>
                  <textarea
                    value={addForm.damages_repairs}
                    onChange={(e) => setAddForm({ ...addForm, damages_repairs: e.target.value })}
                    placeholder="Enter damages or repairs..."
                    rows={2}
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Create Probe'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedProbe && (
        <div className="detail-panel-overlay" onClick={() => setShowEditModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>Edit Probe</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Serial Number *</label>
                  <input
                    type="text"
                    value={editForm.serial_number}
                    onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                    placeholder="Enter serial number"
                  />
                </div>
                <div className="form-group">
                  <label>Brand</label>
                  <select
                    value={editForm.brand}
                    onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                  >
                    <option value="">Select brand...</option>
                    {brandOptions.map((brand) => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Billing Entity</label>
                  <SearchableSelect
                    value={editForm.billing_entity}
                    onChange={(v) => setEditForm({ ...editForm, billing_entity: v })}
                    options={billingEntities.map((be) => ({
                      value: String(be.id),
                      label: be.name,
                    }))}
                    placeholder="Select billing entity..."
                  />
                </div>
                <div className="form-group">
                  <label>Contact</label>
                  <SearchableSelect
                    value={editForm.contact}
                    onChange={(v) => setEditForm({ ...editForm, contact: v })}
                    options={contacts.map((c) => ({
                      value: String(c.id),
                      label: `${c.name} (${c.operationName})`,
                    }))}
                    placeholder="Select contact..."
                  />
                </div>
                <div className="form-group">
                  <label>Year New</label>
                  <input
                    type="number"
                    value={editForm.year_new}
                    onChange={(e) => setEditForm({ ...editForm, year_new: e.target.value })}
                    placeholder="e.g. 2024"
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  >
                    {!STATUS_OPTIONS.includes(editForm.status) && editForm.status && (
                      <option value={editForm.status}>{editForm.status}</option>
                    )}
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Rack</label>
                  <select
                    value={editForm.rack}
                    onChange={(e) => setEditForm({ ...editForm, rack: e.target.value })}
                  >
                    <option value="">Select rack...</option>
                    {RACK_OPTIONS.map((rack) => (
                      <option key={rack} value={rack}>{rack}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Rack Slot</label>
                  <input
                    type="number"
                    value={editForm.rack_slot}
                    onChange={(e) => setEditForm({ ...editForm, rack_slot: e.target.value })}
                    placeholder="e.g. 1, 2, 3"
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Enter notes..."
                    rows={3}
                  />
                </div>
                <div className="form-group">
                  <label>Damages/Repairs</label>
                  <textarea
                    value={editForm.damages_repairs}
                    onChange={(e) => setEditForm({ ...editForm, damages_repairs: e.target.value })}
                    placeholder="Enter damages or repairs..."
                    rows={2}
                  />
                </div>
                {selectedProbe.dateCreated && (
                  <div className="form-group">
                    <label>Date Created</label>
                    <input
                      type="text"
                      value={selectedProbe.dateCreated}
                      disabled
                      className="input-disabled"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTradeModal && tradingProbe && (
        <CreateProbeModal
          operationName=""
          billingEntities={billingEntities}
          onClose={() => { setShowTradeModal(false); setTradingProbe(null); }}
          onCreated={handleTradeProbeCreated}
          tradingProbe={{
            id: tradingProbe.id,
            serialNumber: tradingProbe.serialNumber,
            brand: tradingProbe.brand,
            billingEntityId: tradingProbe.billingEntityId,
          }}
          onTradeComplete={handleTradeComplete}
        />
      )}
    </>
  );
}
