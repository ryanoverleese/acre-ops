'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import EmptyState from '@/components/EmptyState';

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
}

export interface BillingEntityOption {
  id: number;
  name: string;
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

const STATUS_OPTIONS = [
  'On Order',
  'In Stock',
  'Assigned',
  'Installed',
  'RMA',
  'Retired',
];

// Rack options: 1A, 1B, 2A, 2B, ... 15A, 15B
const RACK_OPTIONS = [
  '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5A', '5B',
  '6A', '6B', '7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B',
  '11A', '11B', '12A', '12B', '13A', '13B', '14A', '14B', '15A', '15B',
];

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
  const mobileCardsRef = useRef<HTMLDivElement>(null);

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

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

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
          case 'rack': aVal = `${a.rack || ''}-${a.rackSlot || ''}`; bVal = `${b.rack || ''}-${b.rackSlot || ''}`; break;
          default: aVal = a.serialNumber.toLowerCase(); bVal = b.serialNumber.toLowerCase();
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [probes, searchQuery, sortColumn, sortDirection, viewMode, probeFieldMap, currentSeason, rackSortBy]);

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

  const openEditModal = (probe: ProcessedProbe) => {
    setSelectedProbe(probe);
    setEditForm({
      serial_number: probe.serialNumber,
      brand: probe.brand,
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
    } else if (statusLower === 'on order') {
      className += 'pending';
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
            style={{
              background: 'var(--accent-primary-dim)',
              color: 'var(--accent-primary)',
              border: 'none',
              borderRadius: '16px',
              padding: '4px 12px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {allSeasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="__add_year__">+ Add Year...</option>
          </select>
        </div>
      </header>

      <div className="content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">Total Probes</div>
            <div className="stat-value blue">{statusCounts.all || 0}</div>
          </div>
          <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setViewMode('on-order')}>
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
        <div className="fields-filter-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
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
            <div className="search-box" style={{ minWidth: '220px' }}>
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
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {viewMode === 'rack' && (
              <>
                <select
                  value={rackFilter}
                  onChange={(e) => setRackFilter(e.target.value as 'all' | 'empty')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: rackFilter === 'empty' ? 'var(--accent-primary-dim)' : 'var(--bg-card)',
                    color: rackFilter === 'empty' ? 'var(--accent-primary)' : 'var(--text-primary)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontWeight: rackFilter === 'empty' ? 600 : 500,
                  }}
                >
                  <option value="all">All Slots</option>
                  <option value="empty">Empty Only ({emptySlotCount})</option>
                </select>
                <select
                  value={rackSortBy}
                  onChange={(e) => setRackSortBy(e.target.value as 'rack' | 'slot' | 'serial')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  <option value="rack">Sort: Rack</option>
                  <option value="slot">Sort: Slot</option>
                  <option value="serial">Sort: Serial</option>
                </select>
              </>
            )}
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Probe
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="desktop-table" ref={desktopTableRef}>
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('serialNumber')}>
                  Serial Number
                  {sortColumn === 'serialNumber' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('brand')}>
                  Brand
                  {sortColumn === 'brand' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('status')}>
                  Status
                  {sortColumn === 'status' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('field')}>
                  Field
                  {sortColumn === 'field' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th>Rack Location</th>
                <th className="sortable" onClick={() => handleSort('operation')}>
                  Operation
                  {sortColumn === 'operation' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th className="sortable" onClick={() => handleSort('year')}>
                  Year New
                  {sortColumn === 'year' && <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredProbes.length === 0 ? (
                <tr>
                  <td colSpan={8}>
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
                    <td style={{ fontWeight: 600 }}>
                      #{probe.serialNumber}
                    </td>
                    <td>{getBrandBadge(probe.brand)}</td>
                    <td>{getStatusBadge(probe.status)}</td>
                    <td style={{ fontSize: '13px' }}>
                      {getFieldForProbe(probe.id) || '—'}
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {probe.rack && probe.rack !== '—' ? `${probe.rack}${probe.rackSlot ? `-${probe.rackSlot}` : ''}` : '—'}
                    </td>
                    <td style={{ fontSize: '13px' }}>{probe.operation}</td>
                    <td className="field-count">{probe.yearNew || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="action-btn" title="Edit" onClick={() => openEditModal(probe)}>
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
          <div style={{ position: 'relative' }}>
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
                      className="mobile-card"
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '2px dashed var(--border)',
                        opacity: 0.6,
                      }}
                    >
                      <div className="mobile-card-header">
                        <span className="mobile-card-title" style={{ color: 'var(--text-muted)' }}>
                          {item.rack}-{item.slot}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-muted)',
                        }}>
                          EMPTY
                        </span>
                      </div>
                      <div className="mobile-card-body" style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                        Slot available
                      </div>
                    </div>
                  ) : (
                    <div key={item.probe.id} className="mobile-card" onClick={() => openEditModal(item.probe)}>
                      <div className="mobile-card-header">
                        <span className="mobile-card-title" style={{ color: 'var(--accent-primary)' }}>
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
                      <div className="mobile-card-footer" style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.probe); }}
                        >
                          Delete
                        </button>
                        <span style={{
                          color: 'var(--accent-primary)',
                          fontSize: '13px',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
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
                          <span className="mobile-card-title" style={{ color: 'var(--accent-primary)' }}>
                            {probe.rack}{probe.rackSlot ? `-${probe.rackSlot}` : ''}
                          </span>
                          {getStatusBadge(probe.status)}
                        </>
                      ) : (
                        <>
                          <span className="mobile-card-title" style={{  }}>
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
                    <div className="mobile-card-footer" style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        onClick={(e) => { e.stopPropagation(); handleDelete(probe); }}
                      >
                        Delete
                      </button>
                      <span style={{
                        color: 'var(--accent-primary)',
                        fontSize: '13px',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
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
              <div
                className="rack-scrubber"
                style={{
                  position: 'fixed',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px',
                  padding: '10px 6px',
                  background: 'rgba(var(--bg-tertiary-rgb, 30, 30, 30), 0.85)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderRadius: '16px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05)',
                  zIndex: 100,
                }}
              >
                {rackNumbers.map((num) => (
                  <button
                    key={num}
                    onClick={() => scrollToRack(num)}
                    disabled={!activeRackNumbers.has(num)}
                    style={{
                      width: '30px',
                      height: '22px',
                      border: 'none',
                      borderRadius: '6px',
                      background: activeRackNumbers.has(num) ? 'var(--accent-primary)' : 'transparent',
                      color: activeRackNumbers.has(num) ? 'white' : 'var(--text-muted)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: activeRackNumbers.has(num) ? 'pointer' : 'default',
                      opacity: activeRackNumbers.has(num) ? 1 : 0.3,
                      transition: 'all 0.15s ease',
                    }}
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
                  <select
                    value={addForm.billing_entity}
                    onChange={(e) => setAddForm({ ...addForm, billing_entity: e.target.value })}
                  >
                    <option value="">Select billing entity...</option>
                    {billingEntities.map((be) => (
                      <option key={be.id} value={be.id}>{be.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Contact</label>
                  <select
                    value={addForm.contact}
                    onChange={(e) => setAddForm({ ...addForm, contact: e.target.value })}
                  >
                    <option value="">Select contact...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.operationName})</option>
                    ))}
                  </select>
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
                  <select
                    value={editForm.billing_entity}
                    onChange={(e) => setEditForm({ ...editForm, billing_entity: e.target.value })}
                  >
                    <option value="">Select billing entity...</option>
                    {billingEntities.map((be) => (
                      <option key={be.id} value={be.id}>{be.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Contact</label>
                  <select
                    value={editForm.contact}
                    onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                  >
                    <option value="">Select contact...</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.operationName})</option>
                    ))}
                  </select>
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
                      style={{ opacity: 0.6 }}
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
    </>
  );
}
