'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ProcessedWeatherStation, BillingEntityOption } from './page';

const WeatherStationsMap = dynamic(() => import('@/components/WeatherStationsMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)' }}>
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Active': return { background: '#dcfce7', color: '#166534' };
      case 'Offline': return { background: '#fef3c7', color: '#92400e' };
      case 'Decommissioned': return { background: '#fee2e2', color: '#991b1b' };
      default: return { background: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
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
      <div className="page-header">
        <div className="page-header-content">
          <h1>Weather Stations</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {stations.length} total · {activeCount} active{offlineCount > 0 ? ` · ${offlineCount} offline` : ''}
            </span>
          </div>
        </div>
        <div className="page-header-actions">
          <div style={{ display: 'flex', gap: '4px', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setView('table')}
              style={{
                padding: '6px 12px', fontSize: '13px', border: 'none', cursor: 'pointer',
                background: view === 'table' ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                color: view === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: view === 'table' ? 600 : 400,
              }}
            >
              Table
            </button>
            <button
              onClick={() => setView('map')}
              style={{
                padding: '6px 12px', fontSize: '13px', border: 'none', cursor: 'pointer',
                background: view === 'map' ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                color: view === 'map' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: view === 'map' ? 600 : 400,
              }}
            >
              Map
            </button>
          </div>
          <button className="btn btn-primary" onClick={handleOpenAdd}>+ Add Station</button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search stations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-group input"
          style={{ maxWidth: '240px', fontSize: '13px' }}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="form-group input"
          style={{ maxWidth: '160px', fontSize: '13px' }}
        >
          <option value="all">All Statuses</option>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterBE}
          onChange={(e) => setFilterBE(e.target.value)}
          className="form-group input"
          style={{ maxWidth: '200px', fontSize: '13px' }}
        >
          <option value="all">All Billing Entities</option>
          {beWithStations.map(be => <option key={be.id} value={String(be.id)}>{be.name}</option>)}
        </select>
        <select
          value={filterConnectivity}
          onChange={(e) => setFilterConnectivity(e.target.value)}
          className="form-group input"
          style={{ maxWidth: '160px', fontSize: '13px' }}
        >
          <option value="all">All Connectivity</option>
          {connectivityOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('stationName')} style={{ cursor: 'pointer' }}>Station Name{sortIcon('stationName')}</th>
                <th onClick={() => handleSort('billingEntityName')} style={{ cursor: 'pointer' }}>Billing Entity{sortIcon('billingEntityName')}</th>
                <th onClick={() => handleSort('model')} style={{ cursor: 'pointer' }}>Model{sortIcon('model')}</th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>Status{sortIcon('status')}</th>
                <th onClick={() => handleSort('connectivityType')} style={{ cursor: 'pointer' }}>Connectivity{sortIcon('connectivityType')}</th>
                <th onClick={() => handleSort('installDate')} style={{ cursor: 'pointer' }}>Install Date{sortIcon('installDate')}</th>
                <th onClick={() => handleSort('pricePaid')} style={{ cursor: 'pointer', textAlign: 'right' }}>Price{sortIcon('pricePaid')}</th>
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
                <tr key={station.id} onClick={() => handleOpenDetail(station)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{station.stationName || '—'}</td>
                  <td>{station.billingEntityName || '—'}</td>
                  <td>{station.model || '—'}</td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ ...getStatusStyle(station.status), padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      {station.status || '—'}
                    </span>
                  </td>
                  <td>{station.connectivityType || '—'}</td>
                  <td>{station.installDate || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{station.pricePaid ? `$${station.pricePaid.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Map View */}
      {view === 'map' && (
        <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <WeatherStationsMap stations={mapStations} onClose={() => setView('table')} />
        </div>
      )}

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
              <div style={{ display: 'grid', gap: '12px' }}>
                <div className="detail-row"><span className="detail-label">Station Name</span><span>{selectedStation.stationName || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Model</span><span>{selectedStation.model}</span></div>
                <div className="detail-row"><span className="detail-label">Status</span>
                  <span className="status-badge" style={{ ...getStatusStyle(selectedStation.status), padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{selectedStation.status}</span>
                </div>
                <div className="detail-row"><span className="detail-label">Billing Entity</span><span>{selectedStation.billingEntityName || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Connectivity</span><span>{selectedStation.connectivityType || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Install Date</span><span>{selectedStation.installDate || '—'}</span></div>
                <div className="detail-row"><span className="detail-label">Price Paid</span><span>{selectedStation.pricePaid ? `$${selectedStation.pricePaid.toFixed(2)}` : '—'}</span></div>
                {selectedStation.installLat && selectedStation.installLng && (
                  <div className="detail-row"><span className="detail-label">Coordinates</span><span>{selectedStation.installLat.toFixed(6)}, {selectedStation.installLng.toFixed(6)}</span></div>
                )}
                {selectedStation.notes && (
                  <div className="detail-row" style={{ flexDirection: 'column', gap: '4px' }}>
                    <span className="detail-label">Notes</span>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '13px' }}>{selectedStation.notes}</p>
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
                    style={{ minHeight: '80px', resize: 'vertical' }}
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
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '12px 20px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '14px', fontWeight: 500,
        }}>
          <svg fill="none" stroke="#16a34a" viewBox="0 0 24 24" width="18" height="18">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {toast}
        </div>
      )}
    </>
  );
}
