'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ProcessedWeatherStation, BillingEntityOption } from './page';

const WeatherStationsMap = dynamic(() => import('@/components/WeatherStationsMap'), {
  ssr: false,
  loading: () => (
    <div className="ws-map-loading">
      <div className="loading">Loading map...</div>
    </div>
  ),
});

interface WeatherStationsClientProps {
  stations: ProcessedWeatherStation[];
  billingEntities: BillingEntityOption[];
  modelOptions: string[];
  connectivityOptions: string[];
  statusOptions: string[];
}

interface StationForm {
  stationName: string;
  model: string;
  billingEntity: string;
  installLat: string;
  installLng: string;
  installDate: string;
  connectivityType: string;
  status: string;
  pricePaid: string;
  notes: string;
}

const emptyForm: StationForm = {
  stationName: '',
  model: '',
  billingEntity: '',
  installLat: '',
  installLng: '',
  installDate: '',
  connectivityType: '',
  status: 'Active',
  pricePaid: '',
  notes: '',
};

function getStatusClass(status: string): string {
  switch (status) {
    case 'Active': return 'ws-status-active';
    case 'Offline': return 'ws-status-offline';
    case 'Decommissioned': return 'ws-status-decommissioned';
    default: return '';
  }
}

export default function WeatherStationsClient({
  stations: initialStations,
  billingEntities,
  modelOptions,
  connectivityOptions,
  statusOptions,
}: WeatherStationsClientProps) {
  const [stations, setStations] = useState(initialStations);
  const [view, setView] = useState<'table' | 'map'>('table');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBE, setFilterBE] = useState('all');
  const [filterConnectivity, setFilterConnectivity] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedStation, setSelectedStation] = useState<ProcessedWeatherStation | null>(null);
  const [form, setForm] = useState<StationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('stationName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const filteredStations = useMemo(() => {
    let filtered = stations;

    if (filterStatus !== 'all') {
      filtered = filtered.filter(s => s.status === filterStatus);
    }
    if (filterBE !== 'all') {
      filtered = filtered.filter(s => String(s.billingEntityId) === filterBE);
    }
    if (filterConnectivity !== 'all') {
      filtered = filtered.filter(s => s.connectivityType === filterConnectivity);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.stationName.toLowerCase().includes(q) ||
        s.billingEntityName.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.notes.toLowerCase().includes(q)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortColumn) {
        case 'stationName': aVal = a.stationName; bVal = b.stationName; break;
        case 'billingEntityName': aVal = a.billingEntityName; bVal = b.billingEntityName; break;
        case 'model': aVal = a.model; bVal = b.model; break;
        case 'status': aVal = a.status; bVal = b.status; break;
        case 'connectivityType': aVal = a.connectivityType; bVal = b.connectivityType; break;
        case 'installDate': aVal = a.installDate; bVal = b.installDate; break;
        case 'pricePaid': aVal = a.pricePaid; bVal = b.pricePaid; break;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [stations, filterStatus, filterBE, filterConnectivity, searchQuery, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortIcon = (column: string) => {
    if (sortColumn !== column) return '';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const handleOpenAdd = () => {
    setForm(emptyForm);
    setIsEditing(false);
    setShowAddModal(true);
  };

  const handleOpenDetail = (station: ProcessedWeatherStation) => {
    setSelectedStation(station);
    setShowDetailModal(true);
  };

  const handleStartEdit = () => {
    if (!selectedStation) return;
    setForm({
      stationName: selectedStation.stationName,
      model: selectedStation.model,
      billingEntity: selectedStation.billingEntityId ? String(selectedStation.billingEntityId) : '',
      installLat: selectedStation.installLat ? String(selectedStation.installLat) : '',
      installLng: selectedStation.installLng ? String(selectedStation.installLng) : '',
      installDate: selectedStation.installDate,
      connectivityType: selectedStation.connectivityType,
      status: selectedStation.status,
      pricePaid: selectedStation.pricePaid ? String(selectedStation.pricePaid) : '',
      notes: selectedStation.notes,
    });
    setIsEditing(true);
    setShowDetailModal(false);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!form.model) {
      showToast('Model is required');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        station_name: form.stationName || undefined,
        model: form.model,
        connectivity_type: form.connectivityType || undefined,
        status: form.status || undefined,
        notes: form.notes || '',
      };
      if (form.billingEntity) payload.billing_entity = parseInt(form.billingEntity, 10);
      if (form.installLat) payload.install_lat = parseFloat(form.installLat);
      if (form.installLng) payload.install_lng = parseFloat(form.installLng);
      if (form.installDate) payload.install_date = form.installDate;
      if (form.pricePaid) payload.price_paid = parseFloat(form.pricePaid);

      const isEdit = isEditing && selectedStation;
      const url = isEdit ? `/api/weather-stations/${selectedStation.id}` : '/api/weather-stations';
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        showToast('Failed to save weather station');
        return;
      }

      const saved = await response.json();
      const beName = form.billingEntity
        ? billingEntities.find(be => be.id === parseInt(form.billingEntity, 10))?.name || ''
        : '';

      const processed: ProcessedWeatherStation = {
        id: saved.id || selectedStation?.id || 0,
        stationName: form.stationName,
        model: form.model,
        billingEntityId: form.billingEntity ? parseInt(form.billingEntity, 10) : null,
        billingEntityName: beName,
        installLat: form.installLat ? parseFloat(form.installLat) : null,
        installLng: form.installLng ? parseFloat(form.installLng) : null,
        installDate: form.installDate,
        connectivityType: form.connectivityType,
        status: form.status,
        pricePaid: form.pricePaid ? parseFloat(form.pricePaid) : 0,
        notes: form.notes,
      };

      if (isEdit) {
        setStations(prev => prev.map(s => s.id === selectedStation.id ? processed : s));
        showToast('Weather station updated');
      } else {
        setStations(prev => [...prev, processed]);
        showToast('Weather station added');
      }

      setShowAddModal(false);
      setIsEditing(false);
      setSelectedStation(null);
    } catch {
      showToast('Failed to save weather station');
    } finally {
      setSaving(false);
    }
  };

  // Stats
  const activeCount = stations.filter(s => s.status === 'Active').length;
  const offlineCount = stations.filter(s => s.status === 'Offline').length;

  // Unique BEs with stations for filter
  const beWithStations = useMemo(() => {
    const beIds = new Set(stations.map(s => s.billingEntityId).filter(Boolean));
    return billingEntities.filter(be => beIds.has(be.id));
  }, [stations, billingEntities]);

  // Map data
  const mapStations = useMemo(() => {
    return filteredStations
      .filter(s => s.installLat && s.installLng)
      .map(s => ({
        id: s.id,
        name: s.stationName || s.billingEntityName || `Station #${s.id}`,
        model: s.model,
        status: s.status,
        lat: s.installLat!,
        lng: s.installLng!,
      }));
  }, [filteredStations]);

  return (
    <>
      {/* Page Header */}
      <header className="header">
        <div className="header-left">
          <h2>Weather Stations</h2>
          <span className="ws-header-stats">
            {stations.length} total · {activeCount} active{offlineCount > 0 ? ` · ${offlineCount} offline` : ''}
          </span>
        </div>
        <div className="header-right">
          <div className="ws-view-toggle">
            <button
              onClick={() => setView('table')}
              className={`ws-view-toggle-btn${view === 'table' ? ' active' : ''}`}
            >
              Table
            </button>
            <button
              onClick={() => setView('map')}
              className={`ws-view-toggle-btn${view === 'map' ? ' active' : ''}`}
            >
              Map
            </button>
          </div>
          <button className="btn btn-primary" onClick={handleOpenAdd}>+ Add Station</button>
        </div>
      </header>

      <div className="content">
        {/* Filters */}
        <div className="ws-filters">
          <input
            type="text"
            placeholder="Search stations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ws-filter-input"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="ws-filter-select"
          >
            <option value="all">All Statuses</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterBE}
            onChange={(e) => setFilterBE(e.target.value)}
            className="ws-filter-select"
          >
            <option value="all">All Billing Entities</option>
            {beWithStations.map(be => <option key={be.id} value={String(be.id)}>{be.name}</option>)}
          </select>
          <select
            value={filterConnectivity}
            onChange={(e) => setFilterConnectivity(e.target.value)}
            className="ws-filter-select"
          >
            <option value="all">All Connectivity</option>
            {connectivityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Table View */}
        {view === 'table' && (
          <>
            <div className="table-container">
              <table className="desktop-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('stationName')}>Station Name{sortIcon('stationName')}</th>
                    <th className="sortable" onClick={() => handleSort('billingEntityName')}>Billing Entity{sortIcon('billingEntityName')}</th>
                    <th className="sortable" onClick={() => handleSort('model')}>Model{sortIcon('model')}</th>
                    <th className="sortable" onClick={() => handleSort('status')}>Status{sortIcon('status')}</th>
                    <th className="sortable" onClick={() => handleSort('connectivityType')}>Connectivity{sortIcon('connectivityType')}</th>
                    <th className="sortable" onClick={() => handleSort('installDate')}>Install Date{sortIcon('installDate')}</th>
                    <th className="sortable ws-cell-price" onClick={() => handleSort('pricePaid')}>Price{sortIcon('pricePaid')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="entity-empty">
                        {stations.length === 0 ? 'No weather stations yet. Click "+ Add Station" to create one.' : 'No stations match your filters.'}
                      </td>
                    </tr>
                  )}
                  {filteredStations.map(station => (
                    <tr key={station.id} onClick={() => handleOpenDetail(station)} className="clickable-row">
                      <td className="ws-cell-name">{station.stationName || '—'}</td>
                      <td>{station.billingEntityName || '—'}</td>
                      <td>{station.model || '—'}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(station.status)}`}>
                          {station.status || '—'}
                        </span>
                      </td>
                      <td>{station.connectivityType || '—'}</td>
                      <td>{station.installDate || '—'}</td>
                      <td className="ws-cell-price">{station.pricePaid ? `$${station.pricePaid.toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="mobile-cards">
              {filteredStations.length === 0 && (
                <div className="empty-state">
                  <p>{stations.length === 0 ? 'No weather stations yet.' : 'No stations match your filters.'}</p>
                </div>
              )}
              {filteredStations.map(station => (
                <div key={station.id} className="mobile-card" onClick={() => handleOpenDetail(station)}>
                  <div className="mobile-card-header">
                    <span className="mobile-card-title">{station.stationName || `Station #${station.id}`}</span>
                    <span className={`status-badge ${getStatusClass(station.status)}`}>
                      {station.status || '—'}
                    </span>
                  </div>
                  <div className="mobile-card-body">
                    <div className="mobile-card-row"><span>Entity:</span> {station.billingEntityName || '—'}</div>
                    <div className="mobile-card-row"><span>Model:</span> {station.model || '—'}</div>
                    <div className="mobile-card-row"><span>Connectivity:</span> {station.connectivityType || '—'}</div>
                    {station.installDate && <div className="mobile-card-row"><span>Installed:</span> {station.installDate}</div>}
                    {station.pricePaid > 0 && <div className="mobile-card-row"><span>Price:</span> ${station.pricePaid.toFixed(2)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Map View */}
        {view === 'map' && (
          <div className="ws-map-container">
            <WeatherStationsMap stations={mapStations} onClose={() => setView('table')} />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedStation && (
        <div className="detail-panel-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>{selectedStation.stationName || 'Weather Station'}</h3>
              <button className="close-btn" onClick={() => setShowDetailModal(false)}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="ws-detail-grid">
                <div className="detail-row"><span className="detail-label">Station Name</span><span>{selectedStation.stationName || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Model</span><span>{selectedStation.model}</span></div>
                <div className="detail-row"><span className="detail-label">Status</span>
                  <span className={`status-badge ${getStatusClass(selectedStation.status)}`}>{selectedStation.status}</span>
                </div>
                <div className="detail-row"><span className="detail-label">Billing Entity</span><span>{selectedStation.billingEntityName || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Connectivity</span><span>{selectedStation.connectivityType || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Install Date</span><span>{selectedStation.installDate || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Price Paid</span><span>{selectedStation.pricePaid ? `$${selectedStation.pricePaid.toFixed(2)}` : '—'}</span></div>
                {selectedStation.installLat && selectedStation.installLng && (
                  <div className="detail-row"><span className="detail-label">Coordinates</span><span>{selectedStation.installLat.toFixed(6)}, {selectedStation.installLng.toFixed(6)}</span></div>
                )}
                {selectedStation.notes && (
                  <div className="detail-row ws-notes-row">
                    <span className="detail-label">Notes</span>
                    <p className="ws-notes-text">{selectedStation.notes}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>Close</button>
              <button className="btn btn-primary" onClick={handleStartEdit}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="detail-panel-overlay" onClick={() => { setShowAddModal(false); setIsEditing(false); }}>
          <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="detail-panel-header">
              <h3>{isEditing ? 'Edit Weather Station' : 'Add Weather Station'}</h3>
              <button className="close-btn" onClick={() => { setShowAddModal(false); setIsEditing(false); }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="detail-panel-content">
              <div className="edit-form">
                <div className="form-group">
                  <label>Station Name</label>
                  <input type="text" value={form.stationName} onChange={(e) => setForm({ ...form, stationName: e.target.value })} placeholder="e.g., Smith Farm North" />
                </div>
                <div className="form-group">
                  <label>Model *</label>
                  <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                    <option value="">Select model...</option>
                    {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Billing Entity</label>
                  <select value={form.billingEntity} onChange={(e) => setForm({ ...form, billingEntity: e.target.value })}>
                    <option value="">Select billing entity...</option>
                    {billingEntities.map(be => <option key={be.id} value={String(be.id)}>{be.name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="">Select status...</option>
                      {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Connectivity</label>
                    <select value={form.connectivityType} onChange={(e) => setForm({ ...form, connectivityType: e.target.value })}>
                      <option value="">Select type...</option>
                      {connectivityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Install Date</label>
                    <input type="date" value={form.installDate} onChange={(e) => setForm({ ...form, installDate: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Price Paid ($)</label>
                    <input type="number" step="0.01" value={form.pricePaid} onChange={(e) => setForm({ ...form, pricePaid: e.target.value })} placeholder="0.00" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Latitude</label>
                    <input type="number" step="0.000001" value={form.installLat} onChange={(e) => setForm({ ...form, installLat: e.target.value })} placeholder="e.g., 40.123456" />
                  </div>
                  <div className="form-group">
                    <label>Longitude</label>
                    <input type="number" step="0.000001" value={form.installLng} onChange={(e) => setForm({ ...form, installLng: e.target.value })} placeholder="e.g., -98.654321" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional notes about this station..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="detail-panel-footer">
              <button className="btn btn-secondary" onClick={() => { setShowAddModal(false); setIsEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Station'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="ws-toast">
          <svg fill="none" stroke="var(--accent-primary)" viewBox="0 0 24 24" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
    </>
  );
}
